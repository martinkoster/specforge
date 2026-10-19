// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
let script: Array<Record<string, unknown>> = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (params: { prompt: string; options: Record<string, unknown> }) => {
    calls.push(params);
    return (async function* () {
      for (const m of script) yield m;
    })();
  },
}));

const { startRun } = await import('../src/runner.js');
const { DecisionBroker } = await import('../src/broker.js');

const base = { cwd: '/w', executable: '/bin/claude', prompt: 'hi' };

describe('US-001 AC-1/AC-2/AC-4/AC-5 (support): runner passes the required Agent SDK options', () => {
  it('uses the user executable, permissionMode default, given setting sources and resume id', async () => {
    script = [{ type: 'result', subtype: 'success', is_error: false, session_id: 's1', result: 'ok' }];
    const run = startRun({ ...base, broker: new DecisionBroker(), settingSources: [], resume: 'prev', model: 'm', maxTurns: 3 });
    await run.done;

    expect(calls.at(-1)!.options).toMatchObject({
      cwd: '/w',
      pathToClaudeCodeExecutable: '/bin/claude',
      permissionMode: 'default',
      settingSources: [],
      resume: 'prev',
      model: 'm',
      maxTurns: 3,
    });
  });

  it('collects mapped events, resolves the session id and the final result', async () => {
    script = [
      { type: 'system', subtype: 'init', session_id: 'sess-9' },
      { type: 'assistant', session_id: 'sess-9', message: { content: [{ type: 'text', text: 'PONG' }] } },
      { type: 'result', subtype: 'success', is_error: false, session_id: 'sess-9', result: 'PONG' },
    ];
    const run = startRun({ ...base, broker: new DecisionBroker() });

    await expect(run.sessionId).resolves.toBe('sess-9');
    await expect(run.done).resolves.toMatchObject({ type: 'result', text: 'PONG' });
    expect(run.events.map((e) => e.type)).toEqual(['session', 'output', 'result']);
  });

  it('routes canUseTool to the decision broker', async () => {
    script = [{ type: 'result', subtype: 'success', is_error: false, session_id: 's', result: '' }];
    const broker = new DecisionBroker();
    startRun({ ...base, broker });
    const canUseTool = calls.at(-1)!.options.canUseTool as (n: string, i: object, o: object) => Promise<unknown>;

    const answer = canUseTool('Write', { file_path: 'x' }, { signal: new AbortController().signal, toolUseID: 'tu' });
    broker.decide(broker.pending()[0]!.id, { behavior: 'allow' });

    await expect(answer).resolves.toEqual({ behavior: 'allow', updatedInput: { file_path: 'x' } });
  });

  it('aborts through the abort controller passed to the SDK', () => {
    script = [];
    const run = startRun({ ...base, broker: new DecisionBroker() });
    const controller = calls.at(-1)!.options.abortController as AbortController;

    run.abort();

    expect(controller.signal.aborted).toBe(true);
  });

  it('fails when the stream ends without a result message', async () => {
    script = [{ type: 'system', subtype: 'init', session_id: 's' }];
    const run = startRun({ ...base, broker: new DecisionBroker() });

    await expect(run.done).rejects.toThrow(/without a result/);
  });
});
