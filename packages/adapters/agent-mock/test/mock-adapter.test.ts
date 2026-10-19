// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeAgentAdapterContract } from '@specforge/agent-adapter-contract';
import type { AgentEvent, PermissionAnswer, PermissionAsk, RunRequest } from '@specforge/application';
import { describe, expect, it } from 'vitest';
import { MockAdapter, type MockStep } from '../src/index.js';

function request(cwd: string, prompt = 'test', overrides: Partial<RunRequest> = {}): RunRequest {
  return { runId: 'r1', kind: 'implement', cwd, prompt, config: {}, ...overrides };
}

function recorder(answer: PermissionAnswer = { behavior: 'allow' }) {
  const events: AgentEvent[] = [];
  const asks: PermissionAsk[] = [];
  return {
    events,
    asks,
    onEvent: (e: AgentEvent) => events.push(e),
    onPermission: async (a: PermissionAsk) => {
      asks.push(a);
      return answer;
    },
  };
}

const workspace = () => mkdtempSync(join(tmpdir(), 'mock-adapter-'));
const scripted = (steps: MockStep[]) => new MockAdapter({ script: () => steps });

describe('US-044 AC-2: MockAdapter scripts agent behaviour', () => {
  it('emits scripted output and completes with the result text', async () => {
    const rec = recorder();
    const outcome = await scripted([
      { type: 'output', text: 'Working…' },
      { type: 'result', text: 'Done.' },
    ]).start(request(workspace()), rec).done;

    expect(rec.events.map((e) => e.type)).toEqual(['session', 'output', 'output']);
    expect(outcome).toMatchObject({ status: 'completed', resultText: 'Done.' });
  });

  it('emits tool events without asking for read-only tools', async () => {
    const rec = recorder();
    await scripted([
      { type: 'tool', toolName: 'Read', input: { file_path: 'a.ts' } },
      { type: 'result', text: 'ok' },
    ]).start(request(workspace()), rec).done;

    expect(rec.asks).toEqual([]);
    expect(rec.events.filter((e) => e.type === 'tool_use' || e.type === 'tool_result').map((e) => e.type)).toEqual([
      'tool_use',
      'tool_result',
    ]);
  });

  it('asks for permission and writes the file in the run directory when allowed', async () => {
    const cwd = workspace();
    const rec = recorder({ behavior: 'allow' });
    await scripted([
      { type: 'tool', toolName: 'Write', input: { file_path: 'src/app.ts', content: 'export {};\n' } },
      { type: 'result', text: 'ok' },
    ]).start(request(cwd), rec).done;

    expect(rec.asks).toEqual([
      { toolUseId: expect.any(String), toolName: 'Write', input: { file_path: 'src/app.ts', content: 'export {};\n' }, cwd },
    ]);
    expect(readFileSync(join(cwd, 'src', 'app.ts'), 'utf8')).toBe('export {};\n');
    expect(rec.events.find((e) => e.type === 'tool_result')).toMatchObject({ isError: false });
  });

  it('does not write the file when permission is denied and reports an error tool result', async () => {
    const cwd = workspace();
    const rec = recorder({ behavior: 'deny', message: 'no' });
    await scripted([
      { type: 'tool', toolName: 'Write', input: { file_path: 'x.txt', content: 'x' } },
      { type: 'result', text: 'ok' },
    ]).start(request(cwd), rec).done;

    expect(existsSync(join(cwd, 'x.txt'))).toBe(false);
    expect(rec.events.find((e) => e.type === 'tool_result')).toMatchObject({ isError: true });
  });

  it('refuses scripted writes outside the run directory', async () => {
    const cwd = workspace();
    const rec = recorder();
    await scripted([
      { type: 'tool', toolName: 'Write', input: { file_path: '../escape.txt', content: 'x' } },
      { type: 'result', text: 'ok' },
    ]).start(request(cwd), rec).done;

    expect(existsSync(join(cwd, '..', 'escape.txt'))).toBe(false);
    expect(rec.events.find((e) => e.type === 'tool_result')).toMatchObject({ isError: true });
  });

  it('returns a structured result block unchanged and reports usage', async () => {
    const block = '```specforge-result\n{"outcome":"success","testsPassed":3}\n```';
    const rec = recorder();
    const outcome = await scripted([
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 } },
      { type: 'result', text: `Implemented.\n${block}` },
    ]).start(request(workspace()), rec).done;

    expect(outcome.status === 'completed' && outcome.resultText).toContain(block);
    expect(outcome.status === 'completed' && outcome.usage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
    expect(rec.events).toContainEqual({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 } });
  });

  it('simulates failures', async () => {
    const rec = recorder();
    const outcome = await scripted([
      { type: 'output', text: 'start' },
      { type: 'fail', reason: 'agent crashed' },
    ]).start(request(workspace()), rec).done;

    expect(outcome).toEqual({ status: 'failed', reason: 'agent crashed' });
    expect(rec.events).toContainEqual({ type: 'error', message: 'agent crashed' });
  });

  it('simulates hangs that only end by cancellation', async () => {
    const run = scripted([{ type: 'hang' }]).start(request(workspace()), recorder());
    const raced = await Promise.race([run.done, new Promise((r) => setTimeout(() => r('still running'), 200))]);
    expect(raced).toBe('still running');

    await run.cancel();

    await expect(run.done).resolves.toEqual({ status: 'cancelled' });
  });

  it('waits for delays and can be cancelled during a delay', async () => {
    const run = scripted([
      { type: 'delay', ms: 60_000 },
      { type: 'result', text: 'late' },
    ]).start(request(workspace()), recorder());
    await run.sessionId;
    await run.cancel();
    await expect(run.done).resolves.toEqual({ status: 'cancelled' });
  });

  it('detects and verifies itself as an always-available runtime', async () => {
    const adapter = new MockAdapter();
    await expect(adapter.detect()).resolves.toEqual({ found: true, path: 'mock', version: '1.0.0' });
    await expect(adapter.verify('mock')).resolves.toEqual({ ok: true, version: '1.0.0' });
    expect(adapter.type).toBe('mock');
  });
});

describe('US-044 AC-3: MockAdapter passes the shared contract suite', () => {
  describeAgentAdapterContract({
    name: 'MockAdapter',
    create: () => new MockAdapter(),
    request: (scenario, overrides) => request(workspace(), scenario, overrides),
  });
});
