// SPDX-License-Identifier: Apache-2.0
// US-089: delta generation as reviewable change sets (FR-107, ADR-021).
import { describe, expect, it, vi } from 'vitest';
import {
  DeltaService,
  type AgentAdapter,
  type AgentOutcome,
  type ChangeItemRecord,
  type ChangeSetRecord,
  type DeltaServiceDeps,
  type EpicChoice,
  type RunHooks,
  type RunRequest,
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
  complete() {
    this.finish({ status: 'completed', sessionId: 's1', resultText: 'Done.' });
  }
  fail(reason: string) {
    this.finish({ status: 'failed', reason });
  }
}

const FR = 'spec/02_requirements/functional_requirements.md';
const ORIGINAL =
  '---\nkind: requirements\napproval: approved\n---\n### FR-020: Export\nUsers export.\n### FR-034: Task details\nDetails.\n';

function setup(over: Partial<DeltaServiceDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const files = new Map<string, string>([[FR, ORIGINAL]]);
  const sets = new Map<string, ChangeSetRecord>();
  const items = new Map<string, ChangeItemRecord>();
  const log: string[] = [];
  const approvals = new Map<string, 'draft' | 'approved'>();
  // US-091: stories downstream of the changed elements (source references target).
  const links: { source: string; target: string }[] = [
    { source: 'UC-004', target: 'FR-034' },
    { source: 'US-011', target: 'UC-004' },
    { source: 'US-012', target: 'FR-034' },
    { source: 'US-013', target: 'FR-034' },
    { source: 'US-014', target: 'FR-118' },
  ];
  const stories: { id: string; title: string; status: 'backlog' | 'in_progress' | 'review' | 'done'; subState: string }[] = [];
  const decisions: unknown[] = [];
  let n = 0;
  const deps: DeltaServiceDeps = {
    store: {
      saveSet: (s) => void sets.set(s.id, { ...s }),
      set: (id) => sets.get(id),
      latest: (projectId, featureId, phase) =>
        [...sets.values()].filter((s) => s.projectId === projectId && s.featureId === featureId && s.phase === phase).at(-1),
      saveItems: (list) => list.forEach((i) => items.set(i.id, { ...i })),
      items: (changeSetId) => [...items.values()].filter((i) => i.changeSetId === changeSetId),
      item: (id) => items.get(id),
      setItemState: (id, state) => void (items.get(id)!.state = state),
    },
    adapter,
    runs: {
      createRun: (_p, run) => {
        log.push(`createRun ${run.kind} ${run.trigger}`);
        return `run-${++n}`;
      },
      setRunStatus: (id, status) => void log.push(`status ${id} ${status}`),
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
    },
    workspace: () => ({ root: '/ws', nonGit: false, specRoot: 'spec' }),
    scope: () => [{ targetRef: 'FR-034', reason: 'Related requirement of FI-001' }],
    featurePath: () => 'spec/01_intent/FI-001-comments.md',
    elements: () => [
      { id: 'FR-020', path: FR, title: 'Export' },
      { id: 'FR-034', path: FR, title: 'Task details' },
      { id: 'FR-117', path: 'spec/02_requirements/other.md', title: 'Other' },
      { id: 'UC-004', path: 'spec/03_design/uc.md', title: 'View task' },
    ],
    folderFiles: () => [FR],
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content, { expectedHash }) => {
        const current = files.get(path);
        if ((current === undefined ? null : `h${current.length}`) !== expectedHash) throw new Error('conflict');
        files.set(path, content);
        log.push(`write ${path}`);
        return `h${content.length}`;
      },
    }),
    markDraft: async (_p, paths, runId) => void log.push(`draft ${paths.join(',')} ${runId}`),
    artifactApproval: (_p, path) => approvals.get(path) ?? 'approved',
    inFlight: {
      links: () => links,
      stories: () => stories,
      save: (d) => void decisions.push(d),
      flag: (_p, storyId, sourceRef, reason) => void log.push(`flag ${storyId} ${sourceRef} ${reason}`),
      moveToReady: async (_p, storyId) => void log.push(`ready ${storyId}`),
    },
    snapshots: {
      capture: async (_p, folder) => {
        log.push(`capture ${folder}`);
        return 'snap-1';
      },
      changes: async () => [{ path: FR, change: 'M' as const }],
      restore: async (_p, folder) => {
        log.push(`restore ${folder}`);
        files.set(FR, ORIGINAL);
      },
    },
    reindex: async (_p, path) => void log.push(`reindex ${path}`),
    suppress: (_p, folder, active) => void log.push(`suppress ${folder} ${active}`),
    env: async () => ({ env: {}, secrets: [] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: { ask: async () => ({ behavior: 'allow' }) },
    implementationActive: () => false,
    newId: () => `id-${++n}`,
    now: () => '2026-11-20T10:00:00.000Z',
    ...over,
  };
  return { service: new DeltaService(deps), adapter, files, sets, items, log, approvals, decisions, stories };
}

const settled = async (service: DeltaService) => {
  await vi.waitFor(() => expect(service.view('p1', 'FI-001', 'requirements')?.state).not.toBe('running'));
  return service.view('p1', 'FI-001', 'requirements')!;
};

describe('US-089 AC-1: Generate delta on a snapshot of the target folder, scoped by the confirmed impact', () => {
  it('runs a generate run with the feature intent, the confirmed impact items and the next free IDs', async () => {
    const { service, adapter, log } = setup();
    const started = await service.generate('p1', 'FI-001', 'requirements');

    expect(started).toMatchObject({ ok: true });
    expect(log.slice(0, 3)).toEqual([
      'capture spec/02_requirements',
      'suppress spec/02_requirements true',
      expect.stringMatching(/^createRun generate FeatureDelta FI-001 requirements/),
    ]);
    const request = adapter.requests[0]!;
    expect(request.kind).toBe('generate');
    for (const text of [
      'spec/01_intent/FI-001-comments.md',
      `- FR-034 "Task details" (${FR}): Related requirement of FI-001`,
      'FR-118',
      '**Feature**: FI-001',
      'Changed by FI-001',
      '[DEPRECATED]',
      'Write only files inside spec/02_requirements/',
    ]) {
      expect(request.prompt).toContain(text);
    }
    expect(service.view('p1', 'FI-001', 'requirements')).toMatchObject({ state: 'running' });
  });

  it('is refused without a confirmed impact, in limited mode and while a change set of the phase is open', async () => {
    const empty = setup({ scope: () => [] });
    await expect(empty.service.generate('p1', 'FI-001', 'requirements')).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('impact'),
    });
    const limited = setup({ aiDisabledReason: () => 'Limited mode.' });
    await expect(limited.service.generate('p1', 'FI-001', 'requirements')).resolves.toEqual({ ok: false, reason: 'Limited mode.' });
    const { service } = setup();
    await service.generate('p1', 'FI-001', 'requirements');
    await expect(service.generate('p1', 'FI-001', 'requirements')).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('open'),
    });
  });
});

describe('US-089 AC-2: the result is a change set; the folder is restored', () => {
  it('stores new / modified / deprecated items and restores the target folder', async () => {
    const { service, adapter, files, log } = setup();
    await service.generate('p1', 'FI-001', 'requirements');
    files.set(
      FR,
      ORIGINAL.replace('### FR-020: Export', '### FR-020: [DEPRECATED] Export — replaced by FI-001')
        .replace('Details.', 'Changed by FI-001: comments.\nDetails.')
        .concat('### FR-118: Comment\n**Feature**: FI-001\nx\n'),
    );
    adapter.complete();

    const view = await settled(service);
    expect(view.state).toBe('open');
    expect(view.items.map((i) => [i.kind, i.elementId, i.state])).toEqual([
      ['deprecated', 'FR-020', 'open'],
      ['modified', 'FR-034', 'open'],
      ['new', 'FR-118', 'open'],
    ]);
    expect(files.get(FR)).toBe(ORIGINAL);
    expect(log).toEqual(expect.arrayContaining(['restore spec/02_requirements', `reindex ${FR}`, 'suppress spec/02_requirements false']));
    expect(log.indexOf('suppress spec/02_requirements false')).toBeGreaterThan(log.indexOf(`reindex ${FR}`));
    expect(service.state('p1', 'FI-001', 'requirements')).toBe('open');
  });

  it('validation rejects deletions and reused IDs; a failed run is reported; the folder is restored either way', async () => {
    const a = setup();
    await a.service.generate('p1', 'FI-001', 'requirements');
    a.files.set(FR, ORIGINAL.replace('### FR-020: Export\nUsers export.\n', '').concat('### FR-117: Reused\nx\n'));
    a.adapter.complete();
    const rejected = await settled(a.service);
    expect(rejected.state).toBe('failed');
    expect(rejected.reason).toContain('FR-020 was deleted');
    expect(rejected.reason).toContain('FR-117 is already used elsewhere');
    expect(rejected.items).toEqual([]);
    expect(a.files.get(FR)).toBe(ORIGINAL);

    const b = setup();
    await b.service.generate('p1', 'FI-001', 'requirements');
    b.adapter.fail('Rate limited.');
    expect(await settled(b.service)).toMatchObject({ state: 'failed', reason: 'Rate limited.' });

    const c = setup({ snapshots: { capture: async () => 's', changes: async () => [], restore: async () => undefined } });
    await c.service.generate('p1', 'FI-001', 'requirements');
    c.adapter.complete();
    expect(await settled(c.service)).toMatchObject({ state: 'failed', reason: 'The agent proposed no changes.' });
  });
});

describe('US-089 AC-3/AC-5: accept and discard per item', () => {
  it('accepts or discards items, accepts all, and discarding all closes the change set without touching files', async () => {
    const { service, adapter, files } = setup();
    await service.generate('p1', 'FI-001', 'requirements');
    files.set(
      FR,
      ORIGINAL.replace('Details.', 'Changed by FI-001: comments.\nDetails.').concat('### FR-118: Comment\n**Feature**: FI-001\nx\n'),
    );
    adapter.complete();
    const view = await settled(service);
    const [modified, added] = view.items;

    service.decide(modified!.id, 'accept');
    expect(service.view('p1', 'FI-001', 'requirements')!.items.map((i) => i.state)).toEqual(['accepted', 'open']);
    service.decide(modified!.id, 'discard');
    service.decide(added!.id, 'discard');
    expect(service.view('p1', 'FI-001', 'requirements')).toMatchObject({ state: 'discarded' });
    expect(files.get(FR)).toBe(ORIGINAL);
    expect(service.state('p1', 'FI-001', 'requirements')).toBe('none');
    expect(() => service.decide('nope', 'accept')).toThrow(/Unknown change/);
  });

  it('Accept all accepts every open item', async () => {
    const { service, adapter, files } = setup();
    await service.generate('p1', 'FI-001', 'requirements');
    files.set(FR, ORIGINAL.concat('### FR-118: A\nx\n### FR-119: B\ny\n'));
    adapter.complete();
    const view = await settled(service);
    service.acceptAll(view.id);
    expect(service.view('p1', 'FI-001', 'requirements')!.items.every((i) => i.state === 'accepted')).toBe(true);
  });
});

describe('US-090: applying the accepted changes', () => {
  async function generated(after: string) {
    const ctx = setup();
    await ctx.service.generate('p1', 'FI-001', 'requirements');
    ctx.files.set(FR, after);
    ctx.adapter.complete();
    const view = await settled(ctx.service);
    return { ...ctx, view };
  }

  const AGENT = ORIGINAL.replace('### FR-020: Export', '### FR-020: [DEPRECATED] Export — replaced by FI-001')
    .replace('Details.', 'Details and comments.')
    .concat('### FR-118: Comment on tasks\nUsers comment.\n');

  it('AC-1/AC-2/AC-5: writes the accepted items with feature links and a changelog entry; a discarded change leaves its element untouched', async () => {
    const { service, view, files, log } = await generated(AGENT);
    const byId = new Map(view.items.map((i) => [i.elementId, i]));
    service.decide(byId.get('FR-118')!.id, 'accept');
    service.decide(byId.get('FR-034')!.id, 'accept');
    service.decide(byId.get('FR-020')!.id, 'discard');

    const result = await service.apply(view.id);

    expect(result).toMatchObject({ applied: [FR], conflicts: [] });
    const content = files.get(FR)!;
    expect(content).toContain('### FR-020: Export\nUsers export.');
    expect(content).toContain('### FR-034: Task details\nChanged by FI-001.\nDetails and comments.');
    expect(content).toContain('### FR-118: Comment on tasks\n**Feature**: FI-001\nUsers comment.');
    expect(content).toMatch(/## Changelog\n- 2026-11-20: FI-001 — changed FR-034; new FR-118\n$/);
    expect(log).toEqual(expect.arrayContaining([`write ${FR}`, `reindex ${FR}`, expect.stringMatching(new RegExp(`^draft ${FR} run-`))]));
    expect(log.indexOf(`reindex ${FR}`, log.indexOf(`write ${FR}`))).toBeLessThan(log.findIndex((l) => l.startsWith('draft ')));
    expect(service.view('p1', 'FI-001', 'requirements')).toMatchObject({ state: 'applied' });
    expect(service.view('p1', 'FI-001', 'requirements')!.items.map((i) => i.state)).toEqual(['discarded', 'applied', 'applied']);
  });

  it('AC-4: the phase stays open until the changed artifacts are approved again; applied phases count as an accepted delta', async () => {
    const { service, view, approvals } = await generated(AGENT);
    service.acceptAll(view.id);
    await service.apply(view.id);
    approvals.set(FR, 'draft');
    expect(service.state('p1', 'FI-001', 'requirements')).toBe('open');
    approvals.set(FR, 'approved');
    expect(service.state('p1', 'FI-001', 'requirements')).toBe('applied');
    expect(service.acceptedDelta('p1', 'FI-001')).toBe(true);
    expect(service.acceptedDelta('p1', 'FI-002')).toBe(false);
  });

  it('AC-1: a file changed since the generation is a conflict and nothing of it is applied', async () => {
    const { service, view, files, log } = await generated(AGENT);
    service.acceptAll(view.id);
    files.set(FR, ORIGINAL.replace('Details.', 'Edited by hand.'));

    const result = await service.apply(view.id);

    expect(result.conflicts).toEqual([FR]);
    expect(files.get(FR)).toBe(ORIGINAL.replace('Details.', 'Edited by hand.'));
    expect(log.some((l) => l.startsWith('write '))).toBe(false);
    expect(service.view('p1', 'FI-001', 'requirements')).toMatchObject({ state: 'open', reason: expect.stringContaining(FR) });
  });

  it('refuses while items are undecided and for closed change sets', async () => {
    const { service, view } = await generated(AGENT);
    await expect(service.apply(view.id)).rejects.toThrow(/Accept or discard every change/);
    await expect(service.apply('nope')).rejects.toThrow(/Unknown change set/);
    for (const i of view.items) service.decide(i.id, 'discard');
    await expect(service.apply(view.id)).rejects.toThrow(/not open/);
  });

  it('a new file is written with its front-matter', async () => {
    const ctx = setup({
      snapshots: {
        capture: async () => 's',
        changes: async () => [{ path: 'spec/02_requirements/new.md', change: 'A' as const }],
        restore: async () => undefined,
      },
    });
    await ctx.service.generate('p1', 'FI-001', 'requirements');
    ctx.files.set('spec/02_requirements/new.md', '---\nkind: requirements\n---\n### FR-118: New\n**Feature**: FI-001\nx\n');
    ctx.adapter.complete();
    const view = await settled(ctx.service);
    ctx.files.delete('spec/02_requirements/new.md');
    ctx.service.acceptAll(view.id);
    await ctx.service.apply(view.id);
    expect(ctx.files.get('spec/02_requirements/new.md')).toMatch(
      /^---\nkind: requirements\n---\n### FR-118: New\n\*\*Feature\*\*: FI-001\nx\n\n## Changelog\n- 2026-11-20: FI-001 — new FR-118\n$/,
    );
  });
});

describe('US-091: in-flight protection when applying', () => {
  const AGENT = ORIGINAL.replace('Details.', 'Details and comments.');
  async function accepted() {
    const ctx = setup();
    ctx.stories.push(
      { id: 'US-011', title: 'Task view', status: 'in_progress', subState: 'running' },
      { id: 'US-012', title: 'Edit task', status: 'review', subState: 'none' },
      { id: 'US-013', title: 'Archive', status: 'done', subState: 'none' },
    );
    await ctx.service.generate('p1', 'FI-001', 'requirements');
    ctx.files.set(FR, AGENT);
    ctx.adapter.complete();
    const view = await settled(ctx.service);
    ctx.service.acceptAll(view.id);
    return { ...ctx, view };
  }

  it('AC-1: lists the affected queued/running/in-review stories with state and change summary and applies nothing without a decision', async () => {
    const { service, view, files } = await accepted();

    const result = await service.apply(view.id);

    expect(result).toEqual({
      needsDecision: [
        { storyId: 'US-011', title: 'Task view', status: 'in_progress', subState: 'running', changes: ['changed FR-034'] },
        { storyId: 'US-012', title: 'Edit task', status: 'review', subState: 'none', changes: ['changed FR-034'] },
      ],
    });
    expect(files.get(FR)).toBe(ORIGINAL);
    await expect(service.apply(view.id, { 'US-011': 'continue' })).resolves.toMatchObject({
      needsDecision: expect.arrayContaining([expect.objectContaining({ storyId: 'US-012' })]),
    });
  });

  it('AC-2..AC-5 (FR-110): continue flags the story, cancel moves it back to Ready, apply in corrections stores the feedback; decisions are recorded', async () => {
    const { service, view, files, log, decisions } = await accepted();

    const result = await service.apply(view.id, { 'US-011': 'continue', 'US-012': 'apply_in_corrections' });

    expect(result).toMatchObject({ applied: [FR], conflicts: [] });
    expect(files.get(FR)).toContain('Details and comments.');
    expect(log).toContain('flag US-011 FI-001 FI-001 changed FR-034 while US-011 was in flight (decision: continue unchanged).');
    expect(decisions).toEqual([
      expect.objectContaining({
        storyId: 'US-011',
        featureId: 'FI-001',
        changeSetId: view.id,
        decision: 'continue',
        pendingFeedback: null,
      }),
      expect.objectContaining({
        storyId: 'US-012',
        decision: 'apply_in_corrections',
        pendingFeedback: expect.stringContaining('FI-001 changed the specifications: changed FR-034'),
      }),
    ]);

    const other = await accepted();
    await other.service.apply(other.view.id, { 'US-011': 'cancel', 'US-012': 'continue' });
    expect(other.log).toContain('ready US-011');
  });

  it('without affected stories the change set applies directly', async () => {
    const ctx = setup();
    await ctx.service.generate('p1', 'FI-001', 'requirements');
    ctx.files.set(FR, ORIGINAL.concat('### FR-118: New\nx\n'));
    ctx.adapter.complete();
    const view = await settled(ctx.service);
    ctx.service.acceptAll(view.id);
    ctx.stories.splice(0);
    expect(await ctx.service.apply(view.id)).toMatchObject({ applied: [FR] });
  });
});

// US-093: the Epic & stories phase — epic choice, generated story files as change items, validation, apply.
const S = 'spec/04_user_stories';
const storyFile = (id: string, status: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\nstatus: ${status}\napproval: approved\nepic: EP-002\nrequirements: [FR-034]\n${extra}---\n## Acceptance criteria\n- [ ] AC-1: ${id} works.\n`;
const EPIC2 = `---\nkind: epic\nid: EP-002\ntitle: Tasks\napproval: approved\nrequirements: [FR-034]\n---\n## Goal\nTasks.\n`;

function storiesSetup(over: Partial<DeltaServiceDeps> = {}) {
  const holder: { files?: Map<string, string>; snapshot?: Map<string, string> } = {};
  const inStories = (p: string) => p.startsWith(`${S}/`);
  const choices = new Map<string, EpicChoice>();
  const elements = [
    { id: 'FI-001', path: 'spec/01_intent/FI-001-comments.md', title: 'Task comments' },
    { id: 'FR-034', path: FR, title: 'Task details' },
    { id: 'EP-002', path: `${S}/epics/EP-002.md`, title: 'Tasks' },
    { id: 'US-008', path: `${S}/US-008.md`, title: 'Story US-008' },
    { id: 'US-011', path: `${S}/US-011.md`, title: 'Story US-011' },
    { id: 'US-012', path: `${S}/US-012.md`, title: 'Story US-012' },
  ];
  const statuses = [
    { id: 'US-008', status: 'done' as const },
    { id: 'US-011', status: 'backlog' as const },
    { id: 'US-012', status: 'in_progress' as const },
  ];
  const t = setup({
    elements: () => elements,
    scope: () => [
      { targetRef: 'FR-034', reason: 'Related requirement' },
      { targetRef: 'EP-002', reason: 'The task epic' },
      { targetRef: 'US-008', reason: 'Task view (Done)' },
      { targetRef: 'US-011', reason: 'Task list' },
    ],
    folderFiles: () => [...holder.files!.keys()].filter(inStories),
    specIndex: () => ({ elements: elements.map((e) => ({ id: e.id, path: e.path })), dependencies: [], stories: statuses }),
    epicChoices: { get: (_p, featureId) => choices.get(featureId), save: (c) => void choices.set(c.featureId, c) },
    snapshots: {
      capture: async () => {
        holder.snapshot = new Map([...holder.files!].filter(([p]) => inStories(p)));
        return 'snap-s';
      },
      changes: async () => {
        const now = new Map([...holder.files!].filter(([p]) => inStories(p)));
        const out: { path: string; change: 'A' | 'M' | 'D' }[] = [];
        for (const [p, c] of now) {
          if (!holder.snapshot!.has(p)) out.push({ path: p, change: 'A' });
          else if (holder.snapshot!.get(p) !== c) out.push({ path: p, change: 'M' });
        }
        for (const p of holder.snapshot!.keys()) if (!now.has(p)) out.push({ path: p, change: 'D' });
        return out;
      },
      restore: async () => {
        for (const p of [...holder.files!.keys()].filter(inStories)) holder.files!.delete(p);
        for (const [p, c] of holder.snapshot!) holder.files!.set(p, c);
      },
    },
    ...over,
  });
  holder.files = t.files;
  t.files.set(`${S}/epics/EP-002.md`, EPIC2);
  t.files.set(`${S}/US-008.md`, storyFile('US-008', 'done'));
  t.files.set(`${S}/US-011.md`, storyFile('US-011', 'backlog'));
  t.files.set(`${S}/US-012.md`, storyFile('US-012', 'in_progress'));
  t.stories.push(
    { id: 'US-011', title: 'Story US-011', status: 'backlog', subState: 'none' },
    { id: 'US-012', title: 'Story US-012', status: 'in_progress', subState: 'running' },
  );
  return { ...t, choices };
}

const storiesSettled = async (service: DeltaService) => {
  await vi.waitFor(() => expect(service.view('p1', 'FI-001', 'stories')?.state).not.toBe('running'));
  return service.view('p1', 'FI-001', 'stories')!;
};

/** The agent proposes a new epic, a new story, a rework story of Done US-008 and adjusts not-started US-011. */
const writeProposal = (files: Map<string, string>) => {
  files.set(
    `${S}/epics/EP-003.md`,
    `---\nkind: epic\nid: EP-003\ntitle: Task comments\nrequirements: [FR-034]\n---\n## Goal\nComment on tasks.\n## Value\nV.\n## Acceptance criteria\n- A.\n`,
  );
  files.set(
    `${S}/US-013-comment-list.md`,
    storyFile('US-013', 'backlog', 'depends_on:\n  - id: US-008\n    rationale: Needs the task view.\n').replace(
      'epic: EP-002',
      'epic: EP-003',
    ),
  );
  files.set(
    `${S}/US-014-task-view-comments.md`,
    storyFile('US-014', 'backlog', 'reworks: [US-008]\n').replace('epic: EP-002', 'epic: EP-003'),
  );
  files.set(`${S}/US-011.md`, storyFile('US-011', 'backlog').replace('works.', 'works with comments.'));
};

describe('US-093 AC-1: the epic choice comes first', () => {
  it('proposes a new epic (default) or extending epics from the impact list; generation needs the approved choice', async () => {
    const { service } = storiesSetup();
    expect(service.epicProposal('p1', 'FI-001')).toEqual({
      newEpic: { id: 'EP-003', title: 'Task comments' },
      extend: [{ id: 'EP-002', title: 'Tasks', reason: 'The task epic' }],
      choice: null,
    });
    await expect(service.generate('p1', 'FI-001', 'stories')).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('epic'),
    });
    expect(() => service.chooseEpic('p1', 'FI-001', { mode: 'extend', epicIds: ['EP-077'] })).toThrow('EP-077');
    const chosen = service.chooseEpic('p1', 'FI-001', { mode: 'new', title: 'Comments on tasks' });
    expect(chosen.choice).toMatchObject({ mode: 'new', epicIds: ['EP-003'], title: 'Comments on tasks' });
  });

  it('the generation prompt names the chosen epic, feature links, rework rules and the scope with story states', async () => {
    const { service, adapter } = storiesSetup();
    service.chooseEpic('p1', 'FI-001', { mode: 'new' });
    await expect(service.generate('p1', 'FI-001', 'stories')).resolves.toMatchObject({ ok: true });
    expect(adapter.requests[0]!.kind).toBe('generate');
    const prompt = adapter.requests[0]!.prompt;
    for (const text of [
      `Create the new epic EP-003 "Task comments" as ${S}/epics/EP-003.md`,
      'feature: FI-001',
      `- US-008 "Story US-008" (Done, ${S}/US-008.md): Task view (Done)`,
      `- US-011 "Story US-011" (Backlog, ${S}/US-011.md): Task list`,
      'reworks: [US-008]',
      'Next free IDs: EP-003, US-013.',
      'depends_on',
      `Write only files inside ${S}/`,
    ]) {
      expect(prompt).toContain(text);
    }
    const extend = storiesSetup();
    extend.service.chooseEpic('p1', 'FI-001', { mode: 'extend', epicIds: ['EP-002'] });
    await extend.service.generate('p1', 'FI-001', 'stories');
    expect(extend.adapter.requests[0]!.prompt).toContain(`Extend the existing epic EP-002 "Tasks" (${S}/epics/EP-002.md)`);
  });
});

describe('US-093 AC-2: stories, adjustments and rework stories become change items', () => {
  it('splits the run per file: new epic, new story, rework story, adjusted not-started story; the folder is restored', async () => {
    const { service, adapter, files } = storiesSetup();
    service.chooseEpic('p1', 'FI-001', { mode: 'new' });
    await service.generate('p1', 'FI-001', 'stories');
    writeProposal(files);
    adapter.complete();
    const view = await storiesSettled(service);
    expect(view.reason).toBeNull();
    expect(view.items.map((i) => [i.kind, i.elementId, i.path])).toEqual([
      ['new', 'EP-003', `${S}/epics/EP-003.md`],
      ['new', 'US-013', `${S}/US-013-comment-list.md`],
      ['new', 'US-014', `${S}/US-014-task-view-comments.md`],
      ['modified', 'US-011', `${S}/US-011.md`],
    ]);
    expect(view.items[3]!.patch).toContain('+- [ ] AC-1: US-011 works with comments.');
    expect(files.has(`${S}/US-013-comment-list.md`)).toBe(false);
    expect(files.get(`${S}/US-011.md`)).toBe(storyFile('US-011', 'backlog'));
    expect(service.state('p1', 'FI-001', 'stories')).toBe('open');
  });
});

describe('US-093 AC-3: proposed dependencies and reworks are validated (FR-063)', () => {
  it('rejects changes to Done stories, reworks of stories that are not Done, unknown dependencies and cycles', async () => {
    const cases: [(files: Map<string, string>) => void, string][] = [
      [(f) => f.set(`${S}/US-008.md`, storyFile('US-008', 'done').replace('works.', 'changed.')), 'US-008 is Done'],
      [(f) => f.set(`${S}/US-013.md`, storyFile('US-013', 'backlog', 'reworks: [US-011]\n')), 'US-013 reworks US-011, which is not Done'],
      [
        (f) => f.set(`${S}/US-013.md`, storyFile('US-013', 'backlog', 'depends_on: [US-099]\n')),
        'US-013 depends on US-099, which does not exist',
      ],
      [
        (f) => {
          f.set(`${S}/US-013.md`, storyFile('US-013', 'backlog', 'depends_on: [US-014]\n'));
          f.set(`${S}/US-014.md`, storyFile('US-014', 'backlog', 'depends_on: [US-013]\n'));
        },
        'Dependency cycle',
      ],
    ];
    for (const [write, expected] of cases) {
      const { service, adapter, files } = storiesSetup();
      service.chooseEpic('p1', 'FI-001', { mode: 'new' });
      await service.generate('p1', 'FI-001', 'stories');
      write(files);
      adapter.complete();
      const view = await storiesSettled(service);
      expect(view.state).toBe('failed');
      expect(view.reason).toContain(expected);
    }
  });

  it('adjusting a story that is in flight needs the in-flight decision (US-091) before anything is applied', async () => {
    const { service, adapter, files, log } = storiesSetup();
    service.chooseEpic('p1', 'FI-001', { mode: 'new' });
    await service.generate('p1', 'FI-001', 'stories');
    files.set(`${S}/US-012.md`, storyFile('US-012', 'in_progress').replace('works.', 'works with comments.'));
    adapter.complete();
    const view = await storiesSettled(service);
    service.acceptAll(view.id);
    const result = await service.apply(view.id);
    expect(result).toEqual({
      needsDecision: [
        expect.objectContaining({ storyId: 'US-012', status: 'in_progress', subState: 'running', changes: ['adjusted US-012'] }),
      ],
    });
    expect(log.filter((l) => l.startsWith('write'))).toEqual([]);
  });
});

describe('US-093 AC-4: applying writes the stories into the epic lane in Backlog', () => {
  it('new files get the feature link and Backlog status; adjustments are marked "Changed by"; files become Draft', async () => {
    const { service, adapter, files, log, approvals } = storiesSetup();
    service.chooseEpic('p1', 'FI-001', { mode: 'new' });
    await service.generate('p1', 'FI-001', 'stories');
    writeProposal(files);
    files.set(`${S}/US-013-comment-list.md`, files.get(`${S}/US-013-comment-list.md`)!.replace('status: backlog', 'status: ready'));
    adapter.complete();
    const view = await storiesSettled(service);
    service.acceptAll(view.id);
    await expect(service.apply(view.id)).resolves.toEqual({
      applied: [`${S}/epics/EP-003.md`, `${S}/US-013-comment-list.md`, `${S}/US-014-task-view-comments.md`, `${S}/US-011.md`],
      conflicts: [],
    });
    const story = files.get(`${S}/US-013-comment-list.md`)!;
    expect(story).toContain('feature: FI-001');
    expect(story).toContain('status: backlog');
    expect(story).toContain('epic: EP-003');
    expect(files.get(`${S}/epics/EP-003.md`)).toContain('feature: FI-001');
    expect(files.get(`${S}/US-014-task-view-comments.md`)).toMatch(/reworks: \[ ?US-008 ?\]/);
    expect(files.get(`${S}/US-011.md`)).toContain('works with comments.');
    expect(files.get(`${S}/US-011.md`)).toContain('Changed by FI-001.');
    expect(files.get(`${S}/US-011.md`)).not.toContain('feature: FI-001');
    expect(log).toContain(
      `draft ${S}/epics/EP-003.md,${S}/US-013-comment-list.md,${S}/US-014-task-view-comments.md,${S}/US-011.md ${view.runId}`,
    );
    expect(service.view('p1', 'FI-001', 'stories')!.state).toBe('applied');
    approvals.set(`${S}/US-011.md`, 'draft');
    expect(service.state('p1', 'FI-001', 'stories')).toBe('open');
  });

  it('a new file that exists by now is a conflict', async () => {
    const { service, adapter, files } = storiesSetup();
    service.chooseEpic('p1', 'FI-001', { mode: 'new' });
    await service.generate('p1', 'FI-001', 'stories');
    writeProposal(files);
    adapter.complete();
    const view = await storiesSettled(service);
    service.acceptAll(view.id);
    files.set(`${S}/epics/EP-003.md`, 'someone else');
    const result = await service.apply(view.id);
    expect(result).toMatchObject({ conflicts: [`${S}/epics/EP-003.md`] });
  });
});

describe('US-094 AC-2: withdrawing a feature discards its open change sets', () => {
  it('lists open and running change sets per phase and discards the open ones; applied ones stay', async () => {
    const { service, adapter, files, sets } = setup();
    await service.generate('p1', 'FI-001', 'requirements');
    expect(service.openSets('p1', 'FI-001')).toEqual([{ phase: 'requirements', state: 'running' }]);
    files.set(FR, ORIGINAL.concat('### FR-118: Comment\nx\n'));
    adapter.complete();
    await settled(service);
    sets.set('applied-design', {
      id: 'applied-design',
      projectId: 'p1',
      featureId: 'FI-001',
      phase: 'design',
      runId: 'r0',
      state: 'applied',
      reason: null,
      createdAt: 't',
    });
    expect(service.openSets('p1', 'FI-001')).toEqual([{ phase: 'requirements', state: 'open' }]);
    expect(service.discardOpen('p1', 'FI-001')).toEqual(['requirements']);
    expect(service.view('p1', 'FI-001', 'requirements')).toMatchObject({ state: 'discarded', reason: 'The feature was withdrawn.' });
    expect(service.view('p1', 'FI-001', 'design')?.state).toBe('applied');
    expect(service.openSets('p1', 'FI-001')).toEqual([]);
  });
});
