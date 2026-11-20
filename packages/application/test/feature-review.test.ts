// SPDX-License-Identifier: Apache-2.0
// US-083: AI review and clarification in the feature wizard (feature_review run, multi-turn, FR-103).
import { describe, expect, it, vi } from 'vitest';
import {
  FeatureReviewService,
  FeatureWizardService,
  featureIntentFile,
  parseFeatureReview,
  type AgentAdapter,
  type AgentOutcome,
  type FeatureReviewDeps,
  type PermissionRunContext,
  type RunHooks,
  type RunRequest,
  type WizardRecord,
} from '../src/index.js';

class ScriptedAdapter implements AgentAdapter {
  readonly type = 'scripted';
  requests: RunRequest[] = [];
  hooks!: RunHooks;
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
    return { sessionId: Promise.resolve('s1'), done, cancel: async () => this.finish({ status: 'cancelled' }) };
  }
  complete(result: unknown) {
    this.finish({
      status: 'completed',
      sessionId: 'sess-1',
      resultText: `Done.\n\`\`\`specforge-result\n${JSON.stringify(result)}\n\`\`\`\n`,
    });
  }
  fail(reason: string) {
    this.finish({ status: 'failed', reason });
  }
}

const FIRST = {
  title: 'Task comments',
  draft: {
    problem: 'Team members cannot discuss a task where it lives.',
    goal: 'Users comment on tasks and mention teammates.',
    inScope: ['Comments on tasks', '@mentions'],
    outOfScope: ['Attachments'],
    successCriteria: ['A comment appears for all task viewers within 2 s'],
    constraints: [],
    assumptions: ['Comments are plain text'],
  },
  overlaps: [{ ref: 'FR-034', text: 'Task details already show a description field.' }],
  conflicts: [{ ref: 'ADR-005', text: 'ADR-005 keeps the task view read-only for viewers.' }],
  suggestedEpic: { id: 'EP-002', reason: 'Task management' },
  covered: null,
  questions: [
    {
      id: 'q1',
      text: 'Which formatting may comments use?',
      why: 'Affects storage and rendering.',
      options: ['Plain text', 'Markdown', 'Rich text'],
    },
  ],
  done: false,
};

function setup(over: Partial<FeatureReviewDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const rows = new Map<string, WizardRecord>();
  const files = new Map<string, { content: string; hash: string }>([
    [
      'spec/01_intent/FI-001-comments.md',
      { content: '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\n---\n## Problem\nOld.\n', hash: 'h1' },
    ],
  ]);
  const log: string[] = [];
  const asked: PermissionRunContext[] = [];
  const statuses: Record<string, string> = {};
  let n = 0;
  const store = {
    save: (row: WizardRecord) => void rows.set(row.id, structuredClone(row)),
    get: (id: string) => (rows.has(id) ? structuredClone(rows.get(id)!) : undefined),
    list: (projectId: string) => [...rows.values()].filter((r) => r.projectId === projectId),
    remove: (id: string) => void rows.delete(id),
  };
  const fileApi = {
    read: async (path: string) => files.get(path),
    writeAtomic: async (path: string, content: string) => {
      files.set(path, { content, hash: 'h2' });
      return 'h2';
    },
  };
  const wizards = new FeatureWizardService({
    store,
    featureIds: () => ['FI-001'],
    specRoot: () => 'spec',
    files: () => fileApi,
    reindex: async (_p, path) => void log.push(`reindex ${path}`),
    approve: async () => undefined,
    newId: () => `wiz-${++n}`,
    now: () => '2026-11-20T10:00:00.000Z',
  });
  const deps: FeatureReviewDeps = {
    wizards: store,
    adapter,
    runs: {
      createRun: (_p, run) => {
        log.push(`createRun ${run.kind}`);
        return `run-${++n}`;
      },
      setRunStatus: (id, status) => void (statuses[id] = status),
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
    },
    workspace: () => ({ root: '/ws', nonGit: false }),
    context: () => ({
      intentPath: 'spec/01_intent/intent.md',
      requirements: [{ id: 'FR-034', title: 'Task details' }],
      epics: [{ id: 'EP-002', title: 'Task management' }],
      adrs: [{ id: 'ADR-005', title: 'Read-only viewers' }],
      features: [{ id: 'FI-001', title: 'Comments', path: 'spec/01_intent/FI-001-comments.md' }],
    }),
    files: () => fileApi,
    reindex: async (_p, path) => void log.push(`reindex ${path}`),
    env: async () => ({ env: {}, secrets: [] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: {
      ask: async (run) => {
        asked.push(run);
        return { behavior: 'deny', message: 'read-only' };
      },
    },
    implementationActive: () => false,
    now: () => '2026-11-20T10:00:00.000Z',
    ...over,
  };
  const service = new FeatureReviewService(deps);
  return { service, wizards, adapter, rows, files, log, asked, statuses };
}

const review = (service: FeatureReviewService, id: string) => service.state(id);
const settled = async (service: FeatureReviewService, id: string) => {
  await vi.waitFor(() => expect(review(service, id)?.state).not.toBe('running'));
  return review(service, id)!;
};

describe('US-083 AC-1: Review with AI starts a feature_review run with the project context', () => {
  it('runs read-only with the idea, the main intent, the requirement and epic index and the ADR titles', async () => {
    const { service, wizards, adapter, asked, log } = setup();
    const wizard = wizards.create('p1', { text: 'Users can comment on tasks', motivation: 'E-mail threads get lost.' });

    const started = await service.review(wizard.id);

    expect(started).toEqual({ ok: true, runId: 'run-2' });
    expect(log).toEqual(['createRun feature_review']);
    expect(wizards.get(wizard.id)).toMatchObject({ step: 'review', draft: { review: { state: 'running', runId: 'run-2' } } });
    const prompt = adapter.requests[0]!.prompt;
    expect(adapter.requests[0]!.kind).toBe('feature_review');
    for (const text of [
      'Users can comment on tasks',
      'E-mail threads get lost.',
      'spec/01_intent/intent.md',
      'FR-034: Task details',
      'EP-002: Task management',
      'ADR-005: Read-only viewers',
      'FI-001: Comments',
      '"covered"',
    ]) {
      expect(prompt).toContain(text);
    }
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: 'x' }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({ runKind: 'feature_review', readOnly: true });
  });

  it('is refused in limited mode, without an idea and while a review runs', async () => {
    const limited = setup({ aiDisabledReason: () => 'Limited mode.' });
    const w = limited.wizards.create('p1', { text: 'Idea' });
    await expect(limited.service.review(w.id)).resolves.toEqual({ ok: false, reason: 'Limited mode.' });

    const { service, wizards } = setup();
    const empty = wizards.create('p1', { text: ' ' });
    await expect(service.review(empty.id)).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('Describe') });
    const busy = wizards.create('p1', { text: 'Idea' });
    await service.review(busy.id);
    await expect(service.review(busy.id)).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('running') });
    await expect(service.review('nope')).resolves.toMatchObject({ ok: false });
  });
});

describe('US-083 AC-2: enhanced draft with AI-added parts and findings', () => {
  it('stores the parts per section (the idea as the user part), overlaps, conflicts, the suggested epic and questions', async () => {
    const { service, wizards, adapter, statuses } = setup();
    const wizard = wizards.create('p1', { text: 'Users can comment on tasks' });
    await service.review(wizard.id);
    adapter.complete(FIRST);

    const r = await settled(service, wizard.id);
    expect(r.state).toBe('ready');
    expect(statuses['run-2']).toBe('completed');
    expect(r.parts.filter((p) => p.section === 'problem')).toEqual([
      { id: 'problem-0', section: 'problem', text: 'Users can comment on tasks', origin: 'user', removed: false },
      { id: 'problem-1', section: 'problem', text: 'Team members cannot discuss a task where it lives.', origin: 'ai', removed: false },
    ]);
    expect(r.parts.filter((p) => p.section === 'in_scope').map((p) => p.text)).toEqual(['Comments on tasks', '@mentions']);
    expect(r.overlaps).toEqual([{ ref: 'FR-034', text: 'Task details already show a description field.' }]);
    expect(r.conflicts).toEqual([{ ref: 'ADR-005', text: 'ADR-005 keeps the task view read-only for viewers.' }]);
    expect(r.suggestedEpic).toEqual({ id: 'EP-002', reason: 'Task management' });
    expect(r.questions).toEqual([{ ...FIRST.questions[0], answer: null, deferred: false }]);
    expect(wizards.get(wizard.id)?.draft.title).toBe('Task comments');
    expect(wizards.get(wizard.id)?.sessionId).toBe('sess-1');
  });

  it('Keep / Remove / Edit of AI-added parts', async () => {
    const { service, wizards, adapter } = setup();
    const wizard = wizards.create('p1', { text: 'Idea' });
    await service.review(wizard.id);
    adapter.complete(FIRST);
    await settled(service, wizard.id);

    service.editPart(wizard.id, 'assumptions-0', { removed: true });
    service.editPart(wizard.id, 'goal-0', { text: 'Users comment on tasks.' });
    service.editPart(wizard.id, 'assumptions-0', { removed: false });
    const r = review(service, wizard.id)!;
    expect(r.parts.find((p) => p.id === 'goal-0')).toMatchObject({ text: 'Users comment on tasks.', origin: 'user' });
    expect(r.parts.find((p) => p.id === 'assumptions-0')?.removed).toBe(false);
    expect(() => service.editPart(wizard.id, 'nope', { removed: true })).toThrow(/Unknown part/);
  });

  it('a failed run or a missing result block is reported', async () => {
    const { service, wizards, adapter } = setup();
    const a = wizards.create('p1', { text: 'Idea' });
    await service.review(a.id);
    adapter.fail('Rate limited.');
    expect(await settled(service, a.id)).toMatchObject({ state: 'failed', reason: 'Rate limited.' });

    const b = wizards.create('p1', { text: 'Idea' });
    await service.review(b.id);
    adapter.complete('not an object');
    expect(await settled(service, b.id)).toMatchObject({ state: 'failed', reason: expect.stringContaining('no valid') });
  });

  it('parses only a valid result block', () => {
    expect(parseFeatureReview('no block')).toBeNull();
    expect(parseFeatureReview('```specforge-result\n{bad json\n```')).toBeNull();
    expect(parseFeatureReview(`\`\`\`specforge-result\n${JSON.stringify({ draft: {}, done: true })}\n\`\`\``)).toMatchObject({
      done: true,
      questions: [],
    });
  });
});

describe('US-083 AC-3: an idea that is already covered', () => {
  async function covered(ref: string) {
    const ctx = setup();
    const wizard = ctx.wizards.create('p1', { text: 'Let users comment' });
    await ctx.service.review(wizard.id);
    ctx.adapter.complete({ ...FIRST, covered: { ref, text: `Already covered by ${ref}.` } });
    await settled(ctx.service, wizard.id);
    return { ...ctx, wizardId: wizard.id };
  }

  it('reports the covering element; Continue dismisses it', async () => {
    const { service, wizardId } = await covered('FR-034');
    expect(review(service, wizardId)?.covered).toEqual({ ref: 'FR-034', text: 'Already covered by FR-034.', dismissed: false });
    service.dismissCovered(wizardId);
    expect(review(service, wizardId)?.covered?.dismissed).toBe(true);
  });

  it('Merge into FI-x appends the idea to that feature intent and removes the draft; Withdraw removes it', async () => {
    const { service, wizardId, files, log, wizards } = await covered('FI-001');
    await service.mergeInto(wizardId, 'FI-001');
    const content = files.get('spec/01_intent/FI-001-comments.md')!.content;
    expect(content).toContain('## Merged ideas');
    expect(content).toContain('- Let users comment (2026-11-20)');
    expect(log).toContain('reindex spec/01_intent/FI-001-comments.md');
    expect(wizards.get(wizardId)).toBeUndefined();
    await expect(service.mergeInto('nope', 'FI-001')).rejects.toThrow(/Unknown feature draft/);

    const other = await covered('FI-001');
    await expect(other.service.mergeInto(other.wizardId, 'FI-404')).rejects.toThrow(/FI-404/);
    other.service.withdraw(other.wizardId);
    expect(other.wizards.get(other.wizardId)).toBeUndefined();
  });
});

describe('US-083 AC-4: clarification questions resume the same session', () => {
  it('sends the answers in the same session and updates the draft in place; deferred questions stay open', async () => {
    const { service, wizards, adapter } = setup();
    const wizard = wizards.create('p1', { text: 'Users can comment on tasks' });
    await service.review(wizard.id);
    adapter.complete({ ...FIRST, questions: [...FIRST.questions, { id: 'q2', text: 'Notify by e-mail?', why: 'Scope.', options: [] }] });
    await settled(service, wizard.id);
    service.editPart(wizard.id, 'out_of_scope-0', { removed: true });
    service.deferQuestion(wizard.id, 'q2');

    expect(await service.answer(wizard.id, { q1: 'Markdown' })).toEqual({ ok: true, runId: expect.any(String) });
    expect(adapter.requests[1]).toMatchObject({ resumeSessionId: 'sess-1', kind: 'feature_review' });
    expect(adapter.requests[1]!.prompt).toContain('Which formatting may comments use? → Markdown');
    expect(wizards.get(wizard.id)?.step).toBe('clarify');
    adapter.complete({
      ...FIRST,
      draft: { ...FIRST.draft, outOfScope: ['Attachments'], assumptions: ['Comments use Markdown'] },
      questions: [],
      done: true,
    });

    const r = await settled(service, wizard.id);
    expect(r.parts.find((p) => p.section === 'assumptions')?.text).toBe('Comments use Markdown');
    expect(r.parts.find((p) => p.section === 'out_of_scope')).toMatchObject({ text: 'Attachments', removed: true });
    expect(r.questions.map((q) => [q.id, q.answer, q.deferred])).toEqual([
      ['q1', 'Markdown', false],
      ['q2', null, true],
    ]);
    expect(r.done).toBe(true);
    await expect(service.answer(wizard.id, {})).resolves.toMatchObject({ ok: false });
  });
});

describe('US-083 AC-5: answers and open conflicts are recorded in the feature intent', () => {
  it('writes kept parts per section, the clarified decisions table and open questions', async () => {
    const { service, wizards, adapter } = setup();
    const wizard = wizards.create('p1', { text: 'Users can comment on tasks' });
    await service.review(wizard.id);
    adapter.complete({ ...FIRST, questions: [...FIRST.questions, { id: 'q2', text: 'Notify by e-mail?', why: 'Scope.', options: [] }] });
    await settled(service, wizard.id);
    service.editPart(wizard.id, 'assumptions-0', { removed: true });
    await service.answer(wizard.id, { q1: 'Markdown' });
    adapter.complete({ ...FIRST, questions: [], done: true });
    await settled(service, wizard.id);

    const content = featureIntentFile({ id: 'FI-002', title: 'Task comments', draft: wizards.get(wizard.id)!.draft });
    expect(content).toContain('## Problem\nUsers can comment on tasks\n\nTeam members cannot discuss a task where it lives.');
    expect(content).toContain('## Goal\nUsers comment on tasks and mention teammates.');
    expect(content).toContain('### In scope\n- Comments on tasks\n- @mentions');
    expect(content).toContain('### Out of scope\n- Attachments');
    expect(content).toContain('## Success criteria\n- A comment appears for all task viewers within 2 s');
    expect(content).not.toContain('Comments are plain text');
    expect(content).toContain('| 1 | Which formatting may comments use? | Markdown |');
    expect(content).toContain('## Open questions\n- Notify by e-mail?\n- ADR-005: ADR-005 keeps the task view read-only for viewers.');
  });
});
