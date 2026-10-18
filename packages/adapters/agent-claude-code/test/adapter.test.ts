// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { AgentEvent, PermissionAnswer, PermissionAsk, RunRequest } from '@specforge/application';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeCodeAdapter, agentEnvironment, mapSdkMessage, type QueryFunction, type SdkMessage } from '../src/adapter.js';

type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; toolUseID: string },
) => Promise<{ behavior: string; message?: string; updatedInput?: unknown }>;

const init: SdkMessage = { type: 'system', subtype: 'init', session_id: 'sess-1' };
const text = (t: string): SdkMessage => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const toolUse: SdkMessage = {
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: 'a.txt' } }] },
};
const toolResult = (isError: boolean): SdkMessage => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', is_error: isError }] },
});
const success = (result: string): SdkMessage => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 'sess-1',
  result,
  total_cost_usd: 0.05,
  usage: { input_tokens: 120, output_tokens: 40 },
});

/** A fake `query()` that records its options and plays a script (which may call `canUseTool`). */
function fakeQuery(script: (options: Record<string, unknown>) => AsyncGenerator<SdkMessage>) {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
  const query: QueryFunction = (params) => {
    calls.push(params);
    return script(params.options);
  };
  return { query, calls };
}

const request = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  runId: 'r1',
  kind: 'implement',
  cwd: '/ws',
  prompt: 'Implement US-001.',
  systemAppend: 'Report a specforge-result block.',
  config: { env: { ANTHROPIC_API_KEY: 'sk-configured' }, model: 'claude-sonnet-5-5', maxTurns: 40 },
  ...overrides,
});

function hooks(answer: (ask: PermissionAsk) => Promise<PermissionAnswer> = async () => ({ behavior: 'allow' })) {
  const events: AgentEvent[] = [];
  const asks: PermissionAsk[] = [];
  return {
    events,
    asks,
    onEvent: (e: AgentEvent) => events.push(e),
    onPermission: (a: PermissionAsk) => {
      asks.push(a);
      return answer(a);
    },
  };
}

const adapter = (query: QueryFunction) =>
  new ClaudeCodeAdapter({ executable: () => '/opt/claude', query, baseEnv: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-from-shell' } });

describe('US-045 AC-1: Agent SDK messages become adapter events (ADR-008)', () => {
  it('maps session, output, tool use/result, usage and the final result', async () => {
    const { query } = fakeQuery(async function* () {
      yield init;
      yield text('Working on it.');
      yield toolUse;
      yield toolResult(false);
      yield success('Done.\n```specforge-result\n{}\n```');
    });
    const rec = hooks();
    const run = adapter(query).start(request(), rec);

    await expect(run.done).resolves.toEqual({
      status: 'completed',
      sessionId: 'sess-1',
      resultText: 'Done.\n```specforge-result\n{}\n```',
      usage: { inputTokens: 120, outputTokens: 40, costUsd: 0.05 },
    });
    await expect(run.sessionId).resolves.toBe('sess-1');
    expect(rec.events).toEqual([
      { type: 'session', sessionId: 'sess-1' },
      { type: 'output', text: 'Working on it.' },
      { type: 'tool_use', toolUseId: 'tu-1', toolName: 'Write', input: { file_path: 'a.txt' } },
      { type: 'tool_result', toolUseId: 'tu-1', isError: false },
      { type: 'usage', usage: { inputTokens: 120, outputTokens: 40, costUsd: 0.05 } },
    ]);
  });

  it('reports error results and failures as failed runs', async () => {
    const maxTurns = fakeQuery(async function* () {
      yield init;
      yield { type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 'sess-1', errors: ['Reached the turn limit.'] };
    });
    await expect(adapter(maxTurns.query).start(request(), hooks()).done).resolves.toEqual({
      status: 'failed',
      reason: 'Reached the turn limit.',
    });

    const crash = fakeQuery(async function* () {
      yield init;
      throw new Error('Claude Code exited with code 1');
    });
    const rec = hooks();
    await expect(adapter(crash.query).start(request(), rec).done).resolves.toEqual({
      status: 'failed',
      reason: 'Claude Code exited with code 1',
    });
    expect(rec.events.at(-1)).toEqual({ type: 'error', message: 'Claude Code exited with code 1' });

    const silent = fakeQuery(async function* () {
      yield init;
    });
    await expect(adapter(silent.query).start(request(), hooks()).done).resolves.toEqual({
      status: 'failed',
      reason: 'The agent ended without a result.',
    });
  });

  it('ignores system messages other than init and empty text blocks', () => {
    expect(mapSdkMessage({ type: 'system', subtype: 'compact_boundary' })).toEqual([]);
    expect(mapSdkMessage({ type: 'assistant', message: { content: [{ type: 'text', text: '' }, { type: 'thinking' }] } })).toEqual([]);
    expect(mapSdkMessage({ type: 'stream_event' })).toEqual([]);
  });

  it('fails with an explanation when no Claude Code executable is configured', async () => {
    const { query, calls } = fakeQuery(async function* () {
      yield init;
    });
    const run = new ClaudeCodeAdapter({ executable: () => undefined, query }).start(request(), hooks());
    await expect(run.done).resolves.toEqual({ status: 'failed', reason: expect.stringMatching(/not configured/) });
    await expect(run.sessionId).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('US-045 AC-2: permissions, abort and resume', () => {
  it('routes canUseTool to the broker and waits for the decision without a timeout', async () => {
    vi.useFakeTimers();
    try {
      let decide!: (a: PermissionAnswer) => void;
      const answers: unknown[] = [];
      const { query } = fakeQuery(async function* (options) {
        yield init;
        const canUseTool = options.canUseTool as CanUseTool;
        answers.push(await canUseTool('Write', { file_path: 'a.txt' }, { signal: new AbortController().signal, toolUseID: 'tu-1' }));
        answers.push(await canUseTool('Bash', { command: 'rm -rf /' }, { signal: new AbortController().signal, toolUseID: 'tu-2' }));
        yield success('ok');
      });
      const rec = hooks((ask) =>
        ask.toolName === 'Write' ? new Promise((resolve) => (decide = resolve)) : Promise.resolve({ behavior: 'deny', message: 'No.' }),
      );
      const run = adapter(query).start(request(), rec);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(rec.asks).toEqual([{ toolUseId: 'tu-1', toolName: 'Write', input: { file_path: 'a.txt' }, cwd: '/ws' }]);
      decide({ behavior: 'allow' });
      await expect(run.done).resolves.toMatchObject({ status: 'completed' });
      expect(answers).toEqual([
        { behavior: 'allow', updatedInput: { file_path: 'a.txt' } },
        { behavior: 'deny', message: 'No.' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel aborts the query; a pending permission request is denied; the run ends as cancelled', async () => {
    let answer: unknown;
    const { query } = fakeQuery(async function* (options) {
      yield init;
      const controller = options.abortController as AbortController;
      answer = await (options.canUseTool as CanUseTool)('Write', {}, { signal: controller.signal, toolUseID: 'tu-1' });
      if (controller.signal.aborted) throw new Error('Claude Code process aborted by user');
      yield success('never');
    });
    const run = adapter(query).start(
      request(),
      hooks(() => new Promise(() => undefined)),
    );
    await run.sessionId;

    await run.cancel('user');
    await expect(run.done).resolves.toEqual({ status: 'cancelled' });
    expect(answer).toEqual({ behavior: 'deny', message: 'The run was stopped.' });
  });

  it('resumes the stored session', async () => {
    const { query, calls } = fakeQuery(async function* () {
      yield init;
      yield success('ZEBRA-42');
    });
    await adapter(query).start(request({ kind: 'correct', resumeSessionId: 'sess-1' }), hooks()).done;
    expect(calls[0]!.options.resume).toBe('sess-1');
    await adapter(query).start(request(), hooks()).done;
    expect(calls[1]!.options).not.toHaveProperty('resume');
  });

  it('spawns the configured executable itself and exposes the process id (process-tree kill, FR-034)', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      exitCode: null,
      kill: () => true,
    });
    const spawnProcess = vi.fn(() => child);
    const { query } = fakeQuery(async function* (options) {
      const spawnClaude = options.spawnClaudeCodeProcess as (o: object) => unknown;
      spawnClaude({
        command: '/opt/claude',
        args: ['--output-format', 'stream-json'],
        cwd: '/ws',
        env: { PATH: '/bin' },
        signal: new AbortController().signal,
      });
      yield init;
      yield success('ok');
    });
    const claude = new ClaudeCodeAdapter({ executable: () => '/opt/claude', query, spawnProcess: spawnProcess as never });
    const run = claude.start(request(), hooks());
    await run.done;
    expect(spawnProcess).toHaveBeenCalledWith(
      '/opt/claude',
      ['--output-format', 'stream-json'],
      expect.objectContaining({ cwd: '/ws', windowsHide: true }),
    );
    expect(run.pid?.()).toBe(4242);
  });
});

describe('US-045 AC-3: credentials only in the agent environment; no bypass modes', () => {
  it('passes the configured provider variables and drops provider variables inherited from the core', async () => {
    const { query, calls } = fakeQuery(async function* () {
      yield init;
      yield success('ok');
    });
    await adapter(query).start(request(), hooks()).done;
    const env = calls[0]!.options.env as Record<string, string>;
    expect(env).toMatchObject({ PATH: '/bin', ANTHROPIC_API_KEY: 'sk-configured', CLAUDE_AGENT_SDK_CLIENT_APP: 'specforge' });
    expect(process.env.ANTHROPIC_API_KEY).not.toBe('sk-configured');

    expect(
      agentEnvironment({
        HOME: '/home/u',
        ANTHROPIC_API_KEY: 'shell',
        ANTHROPIC_AUTH_TOKEN: 't',
        CLAUDE_CODE_OAUTH_TOKEN: 'subscription',
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_SECRET_ACCESS_KEY: 's',
        GOOGLE_APPLICATION_CREDENTIALS: '/k.json',
      }),
    ).toEqual({ HOME: '/home/u', CLAUDE_AGENT_SDK_CLIENT_APP: 'specforge' });
  });

  it('runs in default permission mode without Claude settings files, bypass flags or extra CLI arguments', async () => {
    const { query, calls } = fakeQuery(async function* () {
      yield init;
      yield success('ok');
    });
    await adapter(query).start(request(), hooks()).done;
    const options = calls[0]!.options;
    expect(options).toMatchObject({
      cwd: '/ws',
      pathToClaudeCodeExecutable: '/opt/claude',
      permissionMode: 'default',
      settingSources: [],
      model: 'claude-sonnet-5-5',
      maxTurns: 40,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Report a specforge-result block.' },
    });
    expect(options).not.toHaveProperty('extraArgs');
    expect(options).not.toHaveProperty('allowDangerouslySkipPermissions');
    expect(options).not.toHaveProperty('allowedTools');
  });
});

describe('US-045: capabilities and runtime', () => {
  it('reports resume, permission relay and structured results and needs a provider', () => {
    expect(adapter(fakeQuery(async function* () {}).query).capabilities()).toEqual({
      resume: true,
      permissionRelay: true,
      structuredResult: true,
      models: [],
      requiresProvider: true,
    });
  });
});
