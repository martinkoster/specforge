// SPDX-License-Identifier: Apache-2.0
// Live acceptance tests for spike S1. They talk to a real Claude Code installation and cost model usage.
// Run with: npm run test:live   (S1_LIVE=1). Optional: S1_CLAUDE_PATH, S1_MODEL, S1_WAIT_MS.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DecisionBroker } from '../src/broker.js';
import { findClaudeOnPath, resolveClaudeExecutable } from '../src/executable.js';
import { listDescendants } from '../src/processTree.js';
import { recordResult } from '../src/record.js';
import { startRun, type RunOptions } from '../src/runner.js';

const LIVE = process.env.S1_LIVE === '1';
const WAIT_MS = Number(process.env.S1_WAIT_MS ?? 10 * 60 * 1000);
const MODEL = process.env.S1_MODEL || undefined;

function executable(): string {
  return resolveClaudeExecutable(process.env.S1_CLAUDE_PATH ?? findClaudeOnPath());
}

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 's1-live-'));
}

function base(cwd: string, broker: DecisionBroker): Omit<RunOptions, 'prompt'> {
  return { cwd, executable: executable(), model: MODEL, broker, settingSources: [], maxTurns: 6 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!LIVE)('US-001 live scenarios (real Claude Code)', () => {
  it('US-001 AC-1: streams assistant/tool messages with the session id from the user-installed Claude Code', async () => {
    const cwd = workspace();
    const broker = new DecisionBroker();
    const run = startRun({ ...base(cwd, broker), prompt: 'Reply with exactly the single word PONG and nothing else.' });

    const result = await run.done;
    const sessionId = await run.sessionId;

    expect(sessionId).toMatch(/[0-9a-f-]{20,}/);
    expect(run.events.some((e) => e.type === 'output' && /PONG/.test(e.text))).toBe(true);
    expect(result.isError).toBe(false);
    recordResult('ac1_stream', { ok: true, sessionId, executable: executable(), events: run.events.map((e) => e.type), costUsd: result.costUsd });
  }, 180_000);

  it(`US-001 AC-2: canUseTool blocks a tool call for ${Math.round(WAIT_MS / 60000)} min and the later allow reaches the agent`, async () => {
    const cwd = workspace();
    const broker = new DecisionBroker();
    let requestedAt = 0;
    broker.onRequest((req) => {
      requestedAt = Date.now();
      setTimeout(() => broker.decide(req.id, { behavior: 'allow' }), WAIT_MS);
    });
    const run = startRun({
      ...base(cwd, broker),
      prompt: 'Please create a file named hello.txt containing exactly: hello from specforge',
    });

    const result = await run.done;
    const waited = broker.audit()[0] ? broker.audit()[0]!.decidedAt - requestedAt : 0;

    expect(broker.audit()).toHaveLength(1);
    expect(waited).toBeGreaterThanOrEqual(WAIT_MS);
    expect(readFileSync(join(cwd, 'hello.txt'), 'utf8')).toContain('hello from specforge');
    expect(result.isError).toBe(false);
    recordResult('ac2_relay_allow_after_wait', { ok: true, waitedMs: waited, toolName: broker.audit()[0]!.toolName });
  }, WAIT_MS + 300_000);

  it('US-001 AC-2: a deny decision reaches the agent and the action is not executed', async () => {
    const cwd = workspace();
    const broker = new DecisionBroker();
    broker.onRequest((req) => broker.decide(req.id, { behavior: 'deny', message: 'Denied by SpecForge spike test.' }));
    const run = startRun({
      ...base(cwd, broker),
      prompt: 'Please create a file named todo.txt containing the line "Buy milk". If you are not permitted to write it, tell me and stop.',
    });

    await run.done;

    expect(existsSync(join(cwd, 'todo.txt'))).toBe(false);
    expect(broker.audit().some((a) => a.decision === 'deny')).toBe(true);
    expect(run.events.some((e) => e.type === 'tool_result' && e.isError)).toBe(true);
    recordResult('ac2_relay_deny', { ok: true });
  }, 180_000);

  it('US-001 AC-3: aborting stops the agent and all its child processes within 10 s', async () => {
    const cwd = workspace();
    const broker = new DecisionBroker();
    broker.onRequest((req) => broker.decide(req.id, { behavior: 'allow' }));
    const run = startRun({
      ...base(cwd, broker),
      prompt:
        'Run this exact command with your shell tool (Bash or PowerShell, whichever is available) in the foreground and wait for it to finish: node -e "setTimeout(() => {}, 180000)"',
    });

    // wait (time budget, process snapshots take seconds on Windows) until the long-running grandchild exists
    let grandchildSeen = false;
    const deadline = Date.now() + 150_000;
    while (!grandchildSeen && Date.now() < deadline) {
      await sleep(1000);
      const tree = await listDescendants(process.pid);
      grandchildSeen = tree.some((p) => /node/i.test(p.name) && tree.some((q) => q.pid === p.ppid));
    }
    expect(grandchildSeen).toBe(true);
    const before = await listDescendants(process.pid);

    const abortedAt = Date.now();
    run.abort();
    await run.done.catch(() => undefined);
    let remaining = await listDescendants(process.pid);
    while (remaining.length > 0 && Date.now() - abortedAt < 10_000) {
      await sleep(250);
      remaining = await listDescendants(process.pid);
    }
    const elapsed = Date.now() - abortedAt;

    recordResult('ac3_abort', {
      ok: remaining.length === 0,
      elapsedMs: elapsed,
      before: before.map((p) => p.name),
      survivors: remaining.map((p) => `${p.name}(${p.pid})`),
    });
    expect(remaining).toEqual([]);
    expect(elapsed).toBeLessThanOrEqual(10_000);
  }, 300_000);

  it('US-001 AC-4: resuming with the stored session id continues with prior context', async () => {
    const cwd = workspace();
    const broker = new DecisionBroker();
    const first = startRun({ ...base(cwd, broker), prompt: 'Remember the code word ZEBRA-42. Reply only with OK.' });
    await first.done;
    const sessionId = await first.sessionId;

    const second = startRun({ ...base(cwd, broker), resume: sessionId, prompt: 'What was the code word I asked you to remember? Reply with the code word only.' });
    const result = await second.done;

    expect(result.text).toContain('ZEBRA-42');
    expect(await second.sessionId).toBeTruthy();
    recordResult('ac4_resume', { ok: true, sessionId, resumedSessionId: await second.sessionId });
  }, 300_000);

  it('US-001 AC-5: project allow rules cannot bypass the relay when SpecForge isolates setting sources', async () => {
    const outcomes: Record<string, { relayed: boolean; fileWritten: boolean }> = {};
    const variants: Array<[string, RunOptions['settingSources']]> = [
      ['default (all sources)', undefined],
      ['project only', ['project']],
      ['isolated []', []],
    ];
    for (const [label, sources] of variants) {
      const cwd = workspace();
      mkdirSync(join(cwd, '.claude'));
      writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Write', 'Edit', 'Bash'] } }));
      const broker = new DecisionBroker();
      broker.onRequest((req) => broker.decide(req.id, { behavior: 'deny', message: 'Relay reached SpecForge; denied.' }));
      const run = startRun({
        ...base(cwd, broker),
        settingSources: sources,
        prompt: 'Please create a file named notes.txt containing the line "Team meeting moved to 10:00." If you are not permitted to write it, tell me and stop.',
      });
      await run.done;
      outcomes[label] = { relayed: broker.audit().length > 0, fileWritten: existsSync(join(cwd, 'notes.txt')) };
    }

    recordResult('ac5_settings_bypass', outcomes);
    expect(outcomes['isolated []']).toEqual({ relayed: true, fileWritten: false });
  }, 600_000);
});
