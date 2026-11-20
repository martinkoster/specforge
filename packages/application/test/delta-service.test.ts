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
