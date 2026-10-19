// SPDX-License-Identifier: Apache-2.0
import type { ExecSubState } from '@specforge/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExecutionService,
  type AgentAdapter,
  type AgentOutcome,
  type ExecutionDeps,
  type LaunchRequest,
  type PermissionAnswer,
  type RunEventRecord,
  type RunHooks,
  type RunRequest,
} from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
});

/** A final message with a valid structured result (US-051). */
const VALID_RESULT = ['Done.', '```specforge-result', '{"outcome":"success","summary":"Done."}', '```', ''].join('\n');

/** A controllable agent: the test drives events, permission asks and the outcome. */
class ScriptedAdapter implements AgentAdapter {
  readonly type = 'scripted';
  requests: RunRequest[] = [];
  hooks!: RunHooks;
  cancelled = false;
  private finish!: (outcome: AgentOutcome) => void;
  capabilities() {
    return { resume: true, permissionRelay: true, structuredResult: true, models: [] };
  }
  async detect() {
    return { found: true };
  }
  async verify() {
    return { ok: true };
  }
  start(request: RunRequest, hooks: RunHooks) {
    this.requests.push(request);
    this.hooks = hooks;
    const done = new Promise<AgentOutcome>((resolve) => (this.finish = resolve));
    return {
      sessionId: Promise.resolve('session-1'),
      done,
      cancel: async () => {
        this.cancelled = true;
        this.finish({ status: 'cancelled' });
      },
    };
  }
  complete(text = VALID_RESULT) {
    this.finish({ status: 'completed', sessionId: 'session-1', resultText: text });
  }
  fail(reason: string) {
    this.finish({ status: 'failed', reason });
  }
}

const request: LaunchRequest = {
  runId: 'run-1',
  projectId: 'p1',
  storyId: 'US-001',
  startKind: 'implement',
  trigger: 'StoryAuthorised US-001',
};

function setup(overrides: Partial<ExecutionDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const statuses: string[] = [];
  const reasons: Record<string, string> = {};
  const subStates: ExecSubState[] = [];
  const notices: (string | null)[] = [];
  const events: RunEventRecord[] = [];
  const flushes: number[] = [];
  const emitted: string[] = [];
  const finished: string[] = [];
  const completed: string[] = [];
  const requeued: unknown[] = [];
  const results: unknown[] = [];
  const touches: unknown[] = [];
  const processes: unknown[] = [];
  const asks: unknown[] = [];
  let answer: (a: PermissionAnswer) => void = () => undefined;
  const deps: ExecutionDeps = {
    store: {
      setRunStatus: (_id, status, reason) => {
        statuses.push(status);
        if (reason) reasons[status] = reason;
      },
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: (_runId, batch) => {
        flushes.push(batch.length);
        events.push(...batch);
      },
      setSubState: (_p, _s, sub) => void subStates.push(sub),
      setStatusNotice: (_p, _s, notice) => void notices.push(notice),
      requeueConflict: (_p, storyId, entry, files) => void requeued.push({ storyId, entry, files }),
      saveResult: (runId, result) => void results.push({ runId, ...result }),
      recordTouches: (_p, storyId, runId, paths) => void touches.push({ storyId, runId, paths }),
      recordProcess: (runId, record) => void processes.push({ runId, record }),
    },
    spaces: {
      prepare: async () => ({ kind: 'ready', cwd: '/wt/US-001', workspaceRoot: '/wt/US-001', nonGit: false }),
      changes: async () => [
        { path: 'src/login.ts', change: 'A' as const, additions: 10, deletions: 0 },
        { path: 'README.md', change: 'M' as const, additions: 1, deletions: 1 },
      ],
    },
    prompts: { build: async () => ({ prompt: 'Implement US-001.', systemAppend: 'Do not modify spec/.' }) },
    adapter,
    env: async () => ({ env: { ANTHROPIC_API_KEY: 'sk-secret-value-123', LANG: 'C' }, secrets: ['sk-secret-value-123'] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: { model: 'claude-opus-5-5', env: [] } }),
    permissions: {
      ask: (_ctx, a) => {
        asks.push(a);
        return new Promise((resolve) => (answer = resolve));
      },
    },
    implementationActive: () => false,
    transitions: { completed: async (_p, storyId) => void completed.push(storyId) },
    onFinished: (r, outcome) => void finished.push(`${r.storyId}:${outcome}`),
    emit: (_runId, event) => void emitted.push(event.type === 'output' ? event.text : event.type),
    now: () => '2026-10-15T12:00:00.000Z',
    ...overrides,
  };
  return {
    results,
    touches,
    processes,
    service: new ExecutionService(deps),
    adapter,
    statuses,
    reasons,
    subStates,
    notices,
    events,
    flushes,
    emitted,
    finished,
    completed,
    requeued,
    asks,
    answer: (a: PermissionAnswer) => answer(a),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('US-048 AC-1: launch through the adapter with the prepared execution space', () => {
  it('starts the agent in the execution space with prompt, model and environment; statuses follow the lifecycle', async () => {
    const s = setup();

    const done = s.service.launch(request);
    await tick();

    expect(s.adapter.requests).toEqual([
      {
        runId: 'run-1',
        kind: 'implement',
        cwd: '/wt/US-001',
        prompt: 'Implement US-001.',
        systemAppend: 'Do not modify spec/.',
        config: { model: 'claude-opus-5-5', env: { ANTHROPIC_API_KEY: 'sk-secret-value-123', LANG: 'C' } },
      },
    ]);
    expect(s.statuses).toEqual(['running']);
    expect(s.subStates).toEqual(['running']);
    s.adapter.complete();
    await done;
    expect(s.statuses).toEqual(['running', 'completed']);
  });

  it('correction runs use the correct run kind', async () => {
    const s = setup();
    const done = s.service.launch({ ...request, startKind: 'correct', parentRunId: 'run-0' });
    await tick();
    expect(s.adapter.requests[0]!.kind).toBe('correct');
    s.adapter.complete();
    await done;
  });

  it('without an agent adapter the run fails with a stated reason', async () => {
    const s = setup({ adapter: undefined });
    await s.service.launch(request);
    expect(s.statuses).toEqual(['failed']);
    expect(s.reasons.failed).toMatch(/No agent adapter/);
    expect(s.subStates).toEqual(['failed']);
    expect(s.finished).toEqual(['US-001:failed']);
  });

  it('a merge conflict while preparing blocks the story (queued, reason conflict) instead of starting the agent', async () => {
    const s = setup({
      spaces: {
        prepare: async () => ({ kind: 'blocked_conflict', files: ['src/a.ts'], message: 'US-001 conflicts with US-002 in src/a.ts.' }),
      },
    });

    await s.service.launch(request);

    expect(s.adapter.requests).toEqual([]);
    expect(s.statuses).toEqual(['cancelled']);
    expect(s.subStates).toEqual(['blocked_conflict']);
    expect(s.requeued).toEqual([
      { storyId: 'US-001', entry: { queuedAt: '2026-10-15T12:00:00.000Z', startKind: 'implement' }, files: ['src/a.ts'] },
    ]);
    expect(s.notices.at(-1)).toBe('US-001 conflicts with US-002 in src/a.ts.');
    expect(s.finished).toEqual(['US-001:cancelled']);
  });
});

describe('US-048 AC-2: redacted, batched event persistence', () => {
  it('redacts secrets and persists events in batches of 200 or every 100 ms', async () => {
    vi.useFakeTimers();
    const s = setup();
    const done = s.service.launch(request);
    await vi.advanceTimersByTimeAsync(0);

    s.adapter.hooks.onEvent({ type: 'output', text: 'key is sk-secret-value-123' });
    for (let i = 0; i < 249; i++) s.adapter.hooks.onEvent({ type: 'output', text: `line ${i}` });
    expect(s.flushes).toEqual([200]);
    await vi.advanceTimersByTimeAsync(100);
    expect(s.flushes).toEqual([200, 50]);

    expect(s.events[0]).toEqual({
      seq: 1,
      ts: '2026-10-15T12:00:00.000Z',
      type: 'output',
      payload: { type: 'output', text: 'key is ***' },
    });
    expect(s.events.map((e) => e.seq)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
    expect(s.emitted[0]).toBe('key is ***');
    s.adapter.complete();
    await done;
  });

  it('flushes remaining events when the run ends', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    s.adapter.hooks.onEvent({ type: 'output', text: 'last words' });
    s.adapter.complete();
    await done;
    expect(s.events.map((e) => (e.payload as { text?: string }).text)).toContain('last words');
  });
});

describe('US-048 AC-3: timeouts', () => {
  it('fails a run that exceeds the maximum duration (Failed (timeout))', async () => {
    vi.useFakeTimers();
    const s = setup({ config: () => ({ maxRunDurationS: 60, idleTimeoutS: 3600, agent: { env: [] } }) });
    const done = s.service.launch(request);
    await vi.advanceTimersByTimeAsync(0);

    for (let t = 0; t < 6; t++) {
      s.adapter.hooks.onEvent({ type: 'output', text: 'working' });
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await vi.advanceTimersByTimeAsync(1_000);
    await done;

    expect(s.adapter.cancelled).toBe(true);
    expect(s.statuses.at(-1)).toBe('failed');
    expect(s.reasons.failed).toBe('Timeout: the run exceeded the maximum duration of 1 min.');
    expect(s.notices.at(-1)).toBe('Failed (timeout)');
    expect(s.finished).toEqual(['US-001:failed']);
  });

  it('fails an idle run', async () => {
    vi.useFakeTimers();
    const s = setup({ config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 30, agent: { env: [] } }) });
    const done = s.service.launch(request);
    await vi.advanceTimersByTimeAsync(31_000);
    await done;
    expect(s.reasons.failed).toBe('Timeout: no agent activity for 30 s.');
  });

  it('waiting for a permission decision pauses both timeouts', async () => {
    vi.useFakeTimers();
    const s = setup({ config: () => ({ maxRunDurationS: 60, idleTimeoutS: 30, agent: { env: [] } }) });
    const done = s.service.launch(request);
    await vi.advanceTimersByTimeAsync(0);

    const decision = s.adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Bash', input: { command: 'npm test' }, cwd: '/wt/US-001' });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.statuses).toEqual(['running']);
    expect(s.subStates).toEqual(['running', 'awaiting_permission']);

    s.answer({ behavior: 'allow' });
    await expect(decision).resolves.toEqual({ behavior: 'allow' });
    expect(s.subStates.at(-1)).toBe('running');
    s.adapter.complete();
    await done;
    expect(s.statuses).toEqual(['running', 'completed']);
  });

  it('relays permission asks with the run context to the broker', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    void s.adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: 'a.ts' }, cwd: '/wt/US-001' });
    await tick();
    expect(s.asks).toEqual([{ toolUseId: 't', toolName: 'Write', input: { file_path: 'a.ts' }, cwd: '/wt/US-001' }]);
    s.answer({ behavior: 'deny', message: 'no' });
    s.adapter.complete();
    await done;
  });
});

describe('US-048 AC-4: outcome', () => {
  it('a completed run moves the story to Review and frees the slot', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    s.adapter.complete();
    await done;

    expect(s.completed).toEqual(['US-001']);
    expect(s.finished).toEqual(['US-001:completed']);
  });

  it('a failed run keeps the story In Progress (Failed) with the reason and frees the slot', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    s.adapter.fail('The agent crashed.');
    await done;

    expect(s.completed).toEqual([]);
    expect(s.subStates.at(-1)).toBe('failed');
    expect(s.reasons.failed).toBe('The agent crashed.');
    expect(s.notices.at(-1)).toBe('Failed: The agent crashed.');
    expect(s.finished).toEqual(['US-001:failed']);
  });

  it('an error while preparing fails the run instead of leaving it in Preparing', async () => {
    const s = setup({ spaces: { prepare: async () => Promise.reject(new Error('worktree locked')) } });
    await s.service.launch(request);
    expect(s.reasons.failed).toBe('Preparing the run failed: worktree locked');
    expect(s.finished).toEqual(['US-001:failed']);
  });
});

describe('US-048 AC-3: permission asked while the agent starts', () => {
  it('does not trip the timeouts (timers run before the agent starts)', async () => {
    const adapter = new ScriptedAdapter();
    const start = adapter.start.bind(adapter);
    let decision: Promise<PermissionAnswer> | undefined;
    adapter.start = (req, hooks) => {
      const handle = start(req, hooks);
      // Some agents ask for a permission synchronously, before start() returns.
      decision = hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: {}, cwd: '/wt' });
      return handle;
    };
    const s = setup({ adapter });
    const done = s.service.launch(request);
    await tick();
    await tick();

    expect(s.statuses).toEqual(['running']);
    s.answer({ behavior: 'allow' });
    await decision;
    adapter.complete();
    await done;
    expect(s.statuses).toEqual(['running', 'completed']);
  });
});

describe('Core shutdown', () => {
  it('shutdown cancels active runs and waits until they have ended', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();

    await s.service.shutdown();

    expect(s.adapter.cancelled).toBe(true);
    await done;
    expect(s.finished).toEqual(['US-001:cancelled']);
    expect(s.statuses.at(-1)).toBe('interrupted');
    expect(s.subStates.at(-1)).toBe('interrupted');
  });

  it('launches after shutdown fail immediately', async () => {
    const s = setup();
    await s.service.shutdown();
    await s.service.launch(request);
    expect(s.adapter.requests).toEqual([]);
    expect(s.reasons.failed).toMatch(/shutting down/);
  });
});

describe('US-051: result and changes of a completed run', () => {
  const block = (json: object) => `Done.\n\n\`\`\`specforge-result\n${JSON.stringify(json)}\n\`\`\`\n`;

  it('AC-1/AC-2/AC-3: stores the parsed result with the computed changes and records the touched files', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    s.adapter.complete(
      block({
        outcome: 'success',
        summary: 'Login added.',
        tests: { run: 3, passed: 3, failed: 0 },
        recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
      }),
    );
    await done;

    expect(s.statuses.at(-1)).toBe('completed');
    expect(s.results).toEqual([
      {
        runId: 'run-1',
        result: {
          outcome: 'success',
          summary: 'Login added.',
          tests: { run: 3, passed: 3, failed: 0 },
          changedFiles: [],
          openIssues: [],
          recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
        },
        unavailableReason: null,
        computedFiles: [
          { path: 'src/login.ts', change: 'A', additions: 10, deletions: 0 },
          { path: 'README.md', change: 'M', additions: 1, deletions: 1 },
        ],
        rawResult: expect.stringContaining('specforge-result'),
      },
    ]);
    expect(s.touches).toEqual([{ storyId: 'US-001', runId: 'run-1', paths: ['src/login.ts', 'README.md'] }]);
  });

  it('AC-1: without a valid block the run is "completed — result unavailable"; changes are still computed', async () => {
    const s = setup();
    const done = s.service.launch(request);
    await tick();
    s.adapter.complete('All done, no block.');
    await done;

    expect(s.statuses.at(-1)).toBe('completed_no_result');
    expect(s.results[0]).toMatchObject({
      result: null,
      unavailableReason: 'The agent did not report a structured result.',
      computedFiles: expect.any(Array),
    });
    expect(s.completed).toEqual(['US-001']);
  });

  it('a failure to compute changes does not fail the completed run', async () => {
    const s = setup({
      spaces: {
        prepare: async () => ({ kind: 'ready', cwd: '/wt', workspaceRoot: '/wt', nonGit: false }),
        changes: async () => Promise.reject(new Error('git broke')),
      },
    });
    const done = s.service.launch(request);
    await tick();
    s.adapter.complete(block({ outcome: 'success', summary: 'x' }));
    await done;
    expect(s.statuses.at(-1)).toBe('completed');
    expect(s.results[0]).toMatchObject({ computedFiles: [] });
  });
});

describe('US-049 AC-1: cancelling a run', () => {
  /** An adapter whose process may ignore the cancel request; killing the tree ends it. */
  class StubbornAdapter extends ScriptedAdapter {
    constructor(private readonly honoursCancel: boolean) {
      super();
    }
    override start(request: RunRequest, hooks: RunHooks) {
      const handle = super.start(request, hooks);
      return {
        ...handle,
        pid: () => 4242,
        cancel: async () => {
          if (this.honoursCancel) await handle.cancel();
        },
      };
    }
  }

  function cancelSetup(honoursCancel: boolean, killEnds = true) {
    const adapter = new StubbornAdapter(honoursCancel);
    const killed: number[] = [];
    const s = setup({
      adapter,
      processes: {
        identify: async (pid) => ({ pid, startTime: 't0', commandLine: 'claude --print' }),
        killTree: async (pid) => {
          killed.push(pid);
          if (killEnds) adapter.fail('killed');
        },
      },
    });
    return { ...s, adapter, killed };
  }

  it('a cooperating agent ends quickly: run Cancelled, slot freed', async () => {
    const s = cancelSetup(true);
    const done = s.service.launch(request);
    await tick();

    await expect(s.service.cancel('run-1')).resolves.toBe(true);
    await done;

    expect(s.statuses.at(-1)).toBe('cancelled');
    expect(s.killed).toEqual([]);
    expect(s.finished).toEqual(['US-001:cancelled']);
  });

  it('kills the process tree when the agent does not stop within 5 s', async () => {
    vi.useFakeTimers();
    const s = cancelSetup(false);
    const done = s.service.launch(request);
    await vi.advanceTimersByTimeAsync(0);

    const cancelled = s.service.cancel('run-1');
    await vi.advanceTimersByTimeAsync(5_000);
    await cancelled;
    await done;

    expect(s.killed).toEqual([4242]);
    expect(s.statuses.at(-1)).toBe('cancelled');
    expect(s.finished).toEqual(['US-001:cancelled']);
  });

  it('marks the run Cancelled after 10 s even if nothing ends', async () => {
    vi.useFakeTimers();
    const s = cancelSetup(false, false);
    void s.service.launch(request);
    await vi.advanceTimersByTimeAsync(0);

    const cancelled = s.service.cancel('run-1');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(cancelled).resolves.toBe(true);

    expect(s.statuses.at(-1)).toBe('cancelled');
    expect(s.finished).toEqual(['US-001:cancelled']);
    // A late outcome changes nothing.
    s.adapter.complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.finished).toEqual(['US-001:cancelled']);
  });

  it('cancelling an unknown run returns false', async () => {
    const s = setup();
    await expect(s.service.cancel('nope')).resolves.toBe(false);
  });
});

describe('US-049 AC-3: process registry', () => {
  it('records the identity of the agent process when the adapter reports its pid', async () => {
    const adapter = new ScriptedAdapter();
    const start = adapter.start.bind(adapter);
    adapter.start = (req, hooks) => ({ ...start(req, hooks), pid: () => 777 });
    const s = setup({
      adapter,
      processes: { identify: async (pid) => ({ pid, startTime: 'st', commandLine: 'agent' }), killTree: async () => undefined },
    });

    const done = s.service.launch(request);
    await tick();
    await tick();
    adapter.complete();
    await done;

    expect(s.processes).toEqual([{ runId: 'run-1', record: { pid: 777, startTime: 'st', commandLine: 'agent' } }]);
  });

  it('US-045: a pid that is known only once the agent process runs is recorded when the session starts', async () => {
    const adapter = new ScriptedAdapter();
    const start = adapter.start.bind(adapter);
    const agent: { pid?: number } = {};
    adapter.start = (req, hooks) => ({ ...start(req, hooks), pid: () => agent.pid });
    const s = setup({
      adapter,
      processes: { identify: async (p) => ({ pid: p, startTime: 'st', commandLine: 'claude' }), killTree: async () => undefined },
    });

    const done = s.service.launch(request);
    await tick();
    agent.pid = 778;
    adapter.hooks.onEvent({ type: 'session', sessionId: 'session-1' });
    await tick();
    adapter.complete();
    await done;

    expect(s.processes).toEqual([{ runId: 'run-1', record: { pid: 778, startTime: 'st', commandLine: 'claude' } }]);
  });
});

describe('US-055 AC-2: resume continues the agent session of the stopped run', () => {
  it('passes the previous session id to an adapter that supports resume', async () => {
    const s = setup({ resumeSession: (r) => (r.parentRunId === 'run-0' ? 'session-0' : undefined) });
    const done = s.service.launch({ ...request, startKind: 'resume', parentRunId: 'run-0' });
    await vi.waitFor(() => expect(s.adapter.requests).toHaveLength(1));
    expect(s.adapter.requests[0]!.resumeSessionId).toBe('session-0');
    s.adapter.complete();
    await done;
  });

  it('starts a fresh session for retries and for adapters without resume', async () => {
    const retry = setup({ resumeSession: () => 'session-0' });
    const a = retry.service.launch({ ...request, startKind: 'retry', parentRunId: 'run-0' });
    await vi.waitFor(() => expect(retry.adapter.requests).toHaveLength(1));
    expect(retry.adapter.requests[0]!.resumeSessionId).toBeUndefined();
    retry.adapter.complete();
    await a;

    const noResume = setup({ resumeSession: () => 'session-0' });
    noResume.adapter.capabilities = () => ({ resume: false, permissionRelay: true, structuredResult: true, models: [] });
    const b = noResume.service.launch({ ...request, startKind: 'resume', parentRunId: 'run-0' });
    await vi.waitFor(() => expect(noResume.adapter.requests).toHaveLength(1));
    expect(noResume.adapter.requests[0]!.resumeSessionId).toBeUndefined();
    noResume.adapter.complete();
    await b;
  });
});
