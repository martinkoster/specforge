// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ClarificationService,
  INTENT_TEMPLATE,
  parseClarification,
  type AgentAdapter,
  type AgentOutcome,
  type ClarificationDeps,
  type ClarificationRecord,
  type PermissionRunContext,
  type RunHooks,
  type RunRequest,
} from '../src/index.js';

class ScriptedAdapter implements AgentAdapter {
  readonly type = 'scripted';
  requests: RunRequest[] = [];
  hooks!: RunHooks;
  cancelled = 0;
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
        this.cancelled++;
        this.finish({ status: 'cancelled' });
      },
    };
  }
  reply(result: unknown) {
    this.finish({
      status: 'completed',
      sessionId: 'session-1',
      resultText: `Here.\n\`\`\`specforge-result\n${JSON.stringify(result)}\n\`\`\`\n`,
    });
  }
}

const ROUND_1 = {
  done: false,
  items: [
    { id: 'q1', type: 'question', text: 'Who are the users?' },
    { id: 'a1', type: 'assumption', text: 'Single-user desktop app.' },
    { id: 'alt1', type: 'alternative', text: 'Web or desktop?', options: ['Web', 'Desktop'] },
  ],
};

function setup(overrides: Partial<ClarificationDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const records = new Map<string, ClarificationRecord>();
  const asked: PermissionRunContext[] = [];
  const refines: unknown[] = [];
  const updates: string[] = [];
  let runs = 0;
  let ids = 0;
  const deps: ClarificationDeps = {
    store: {
      createRun: () => `run-${++runs}`,
      setRunStatus: () => undefined,
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
      saveClarification: (r) => void records.set(r.id, structuredClone(r)),
      clarification: (id) => records.get(id),
      latestClarification: (projectId, path) =>
        [...records.values()].filter((r) => r.projectId === projectId && r.intentPath === path).at(-1),
    },
    adapter,
    workspace: () => ({ root: '/ws', nonGit: false }),
    env: async () => ({ env: {}, secrets: [] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: {
      ask: async (run) => {
        asked.push(run);
        return { behavior: 'allow' };
      },
    },
    implementationActive: () => false,
    refine: async (request) => {
      refines.push(request);
      return { ok: true, runId: 'proposal-1' };
    },
    newId: () => `c${++ids}`,
    onUpdated: (record) => void updates.push(record.state),
    now: () => '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
  return { service: new ClarificationService(deps), adapter, records, asked, refines, updates };
}

const INTENT = 'spec/01_intent/intent.md';

describe('US-028 AC-1: intent template', () => {
  it('offers a template with front-matter and the main intent sections', () => {
    expect(INTENT_TEMPLATE).toMatch(/^---\nkind: intent\napproval: draft\n---\n/);
    for (const section of [
      '## Vision',
      '## Problem',
      '## Users and stakeholders',
      '## Scope',
      '## Success criteria',
      '## Constraints',
      '## Open questions',
    ]) {
      expect(INTENT_TEMPLATE).toContain(section);
    }
  });
});

describe('US-028 AC-2: Analyse intent', () => {
  it('starts a read-only clarify run and shows its questions, ambiguities, alternatives and assumptions', async () => {
    const { service, adapter, asked } = setup();
    const started = await service.start('p1', INTENT);
    expect(started).toEqual({ ok: true, clarificationId: 'c1' });
    expect(adapter.requests[0]).toMatchObject({ kind: 'clarify', cwd: '/ws' });
    expect(adapter.requests[0]!.prompt).toContain(INTENT);
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: INTENT }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({ runKind: 'clarify', readOnly: true });

    adapter.reply(ROUND_1);
    await service.idle();
    expect(service.current('p1', INTENT)).toMatchObject({
      state: 'awaiting_answers',
      sessionId: 'session-1',
      items: [
        { id: 'q1', type: 'question', text: 'Who are the users?', answer: null },
        { id: 'a1', type: 'assumption', text: 'Single-user desktop app.', answer: null },
        { id: 'alt1', type: 'alternative', options: ['Web', 'Desktop'], answer: null },
      ],
    });
  });

  it('a result without a valid block fails the round with a reason', async () => {
    const { service, adapter } = setup();
    await service.start('p1', INTENT);
    adapter.reply({ nonsense: true });
    await service.idle();
    expect(service.current('p1', INTENT)).toMatchObject({ state: 'failed', reason: expect.stringMatching(/no valid clarification/) });
  });

  it('parses the clarification block', () => {
    expect(parseClarification('```specforge-result\n{"done":true,"items":[]}\n```')).toEqual({ done: true, items: [] });
    expect(parseClarification('no block')).toBeNull();
    expect(parseClarification('```specforge-result\n{"done":"x"}\n```')).toBeNull();
  });
});

describe('US-028 AC-3: answers resume the same session; finishing proposes Clarified decisions', () => {
  it('sends the answers into the same agent session and shows the next questions', async () => {
    const { service, adapter } = setup();
    await service.start('p1', INTENT);
    adapter.reply(ROUND_1);
    await service.idle();

    await expect(service.answer('c1', { q1: 'Product owners', a1: 'accepted', alt1: 'Desktop' })).resolves.toEqual({ ok: true });
    expect(adapter.requests[1]).toMatchObject({ kind: 'clarify', resumeSessionId: 'session-1' });
    expect(adapter.requests[1]!.prompt).toContain('Who are the users? → Product owners');
    expect(adapter.requests[1]!.prompt).toContain('Single-user desktop app. → accepted');

    adapter.reply({ done: true, items: [] });
    await service.idle();
    const record = service.current('p1', INTENT)!;
    expect(record.state).toBe('complete');
    expect(record.items.map((i) => i.answer)).toEqual(['Product owners', 'accepted', 'Desktop']);
  });

  it('finish proposes a "Clarified decisions" section of the intent as a reviewable change', async () => {
    const { service, adapter, refines } = setup();
    await service.start('p1', INTENT);
    adapter.reply(ROUND_1);
    await service.idle();
    await service.answer('c1', { q1: 'Product owners' });
    adapter.reply({ done: true, items: [] });
    await service.idle();

    await expect(service.finish('c1')).resolves.toEqual({ ok: true, runId: 'proposal-1' });
    expect(refines).toEqual([
      {
        projectId: 'p1',
        path: INTENT,
        instruction: expect.stringContaining('## Clarified decisions'),
      },
    ]);
    expect((refines[0] as { instruction: string }).instruction).toContain('Who are the users? → Product owners');
    expect(service.current('p1', INTENT)).toMatchObject({ state: 'finished', proposalRunId: 'proposal-1' });
  });

  it('refuses answers while a round is running and finishing without any answer', async () => {
    const { service, adapter } = setup();
    await service.start('p1', INTENT);
    await expect(service.answer('c1', { q1: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'The agent is still working on the previous answers.',
    });
    adapter.reply(ROUND_1);
    await service.idle();
    await expect(service.finish('c1')).resolves.toEqual({ ok: false, reason: 'Answer at least one item first.' });
    await expect(service.answer('nope', {})).resolves.toEqual({ ok: false, reason: 'Unknown clarification nope.' });
  });
});

describe('US-028 AC-4: cancelling keeps the answers as a draft', () => {
  it('cancels the active round; the answers given so far stay and can be continued later', async () => {
    const { service, adapter } = setup();
    await service.start('p1', INTENT);
    adapter.reply(ROUND_1);
    await service.idle();
    await service.answer('c1', { q1: 'Product owners' });

    await expect(service.cancel('c1')).resolves.toEqual({ ok: true });
    await service.idle();
    expect(adapter.cancelled).toBe(1);
    const record = service.current('p1', INTENT)!;
    expect(record).toMatchObject({ state: 'cancelled' });
    expect(record.items[0]!.answer).toBe('Product owners');

    // Saving more draft answers works without a running agent.
    await expect(service.saveDraft('c1', { a1: 'rejected' })).resolves.toEqual({ ok: true });
    expect(service.current('p1', INTENT)!.items[1]!.answer).toBe('rejected');
  });

  it('refuses without the AI capability', async () => {
    const { service } = setup({ aiDisabledReason: () => 'AI functions are disabled.' });
    await expect(service.start('p1', INTENT)).resolves.toEqual({ ok: false, reason: 'AI functions are disabled.' });
  });
});
