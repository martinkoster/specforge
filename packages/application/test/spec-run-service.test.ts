// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  SpecRunService,
  SPEC_TARGET_FOLDERS,
  type AgentAdapter,
  type AgentOutcome,
  type PermissionRunContext,
  type RunHooks,
  type RunRequest,
  type SpecReviewRecord,
  type SpecRunDeps,
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
  complete(text = 'Generated.') {
    this.finish({ status: 'completed', sessionId: 's1', resultText: text });
  }
  fail(reason: string) {
    this.finish({ status: 'failed', reason });
  }
}

const VALID_FR = '### FR-001: Login\nUsers log in.\n';

function setup(overrides: Partial<SpecRunDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const log: string[] = [];
  const reviews = new Map<string, SpecReviewRecord>();
  const statuses: Record<string, string> = {};
  const workspace = new Map<string, string>([['spec/02_requirements/functional_requirements.md', '### FR-001: Old\n']]);
  const asked: PermissionRunContext[] = [];
  let runs = 0;
  let implementationActive = 0;
  const deps: SpecRunDeps = {
    adapter,
    store: {
      createRun: (_p, run) => {
        log.push(`createRun ${run.kind}`);
        return `run-${++runs}`;
      },
      setRunStatus: (id, status) => void (statuses[id] = status),
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
      saveSpecReview: (r) => void reviews.set(r.runId, { ...r }),
      specReview: (id) => reviews.get(id),
      openSpecReviews: (projectId) =>
        [...reviews.values()].filter((r) => r.projectId === projectId && !['kept', 'discarded', 'superseded'].includes(r.state)),
      openSpecReview: (projectId, target) =>
        [...reviews.values()].find(
          (r) => r.projectId === projectId && r.target === target && !['kept', 'discarded', 'superseded'].includes(r.state),
        ),
    },
    snapshots: {
      capture: async (_p, folder) => {
        log.push(`capture ${folder}`);
        return 'snap-1';
      },
      changes: async () => [
        { path: 'spec/02_requirements/functional_requirements.md', change: 'M', patch: '-### FR-001: Old\n+### FR-001: Login' },
      ],
      restore: async (_p, folder, id) => void log.push(`restore ${folder} ${id}`),
    },
    files: { read: async (_p, path) => workspace.get(path) ?? null },
    index: () => ({ elements: [{ id: 'FR-001', path: 'spec/02_requirements/functional_requirements.md' }], dependencies: [] }),
    workspace: () => ({ root: '/ws', nonGit: false }),
    implementationActive: () => implementationActive > 0,
    env: async () => ({ env: { KEY: 'secret-value' }, secrets: ['secret-value'] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: {
      ask: async (run) => {
        asked.push(run);
        return { behavior: 'allow' };
      },
    },
    approvals: { markDraftAfterAiChange: async (_p, paths, runId) => void log.push(`draft ${paths.join(',')} ${runId}`) },
    reindex: async (_p, paths) => void log.push(`reindex ${paths.join(',')}`),
    onWritersChanged: () => void log.push('writersChanged'),
    now: () => '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
  const service = new SpecRunService(deps);
  return {
    service,
    adapter,
    log,
    reviews,
    statuses,
    workspace,
    asked,
    setImplementationActive: (n: number) => (implementationActive = n),
  };
}

async function finished(service: SpecRunService, runId: string) {
  await vi.waitFor(() => expect(['open', 'failed', 'cancelled']).toContain(service.review(runId)?.state));
  return service.review(runId)!;
}

describe('US-027 AC-1: spec runs through the adapter in the main workspace with restricted writes', () => {
  it('starts a generate run in the workspace root; permission asks carry the target folder as write scope', async () => {
    const { service, adapter, asked, log } = setup();

    const started = await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Generate the requirements.' });

    expect(started).toEqual({ ok: true, runId: 'run-1' });
    expect(log.slice(0, 3)).toEqual(['createRun generate', 'capture spec/02_requirements', 'writersChanged']);
    expect(adapter.requests[0]).toMatchObject({ kind: 'generate', cwd: '/ws', config: { env: { KEY: 'secret-value' } } });
    expect(adapter.requests[0]!.prompt).toContain('Generate the requirements.');
    expect(adapter.requests[0]!.prompt).toContain('spec/02_requirements');
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: 'x.md' }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({
      runId: 'run-1',
      projectId: 'p1',
      runKind: 'generate',
      workspaceRoot: '/ws',
      writeScope: 'spec/02_requirements',
    });
  });

  it('maps each generation target to its spec folder', () => {
    expect(SPEC_TARGET_FOLDERS).toEqual({
      requirements: 'spec/02_requirements',
      design: 'spec/03_design',
      epics: 'spec/04_user_stories/epics',
      stories: 'spec/04_user_stories',
      test_concepts: 'spec/05_test_concepts',
    });
  });

  it('refuses to start without an agent adapter', async () => {
    const { service } = setup({ adapter: undefined });
    await expect(service.start({ projectId: 'p1', target: 'design', instruction: 'x' })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/No agent adapter/),
    });
  });
});

describe('US-027 AC-2/AC-3: snapshot, validation and review', () => {
  it('after the run lists the changed files with diffs and validation issues', async () => {
    const { service, adapter, workspace, statuses, log } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    workspace.set('spec/02_requirements/functional_requirements.md', '### FR-001: Login\nSee FR-404.\n');

    adapter.complete();
    const review = await finished(service, runId);

    expect(review).toMatchObject({
      runId,
      projectId: 'p1',
      target: 'spec/02_requirements',
      snapshotId: 'snap-1',
      state: 'open',
      files: [
        { path: 'spec/02_requirements/functional_requirements.md', change: 'M', patch: expect.stringContaining('+### FR-001: Login') },
      ],
      issues: [
        {
          path: 'spec/02_requirements/functional_requirements.md',
          kind: 'broken_link',
          message: 'FR-001 references FR-404, which does not exist.',
        },
      ],
    });
    expect(statuses[runId]).toBe('completed');
    expect(log.filter((l) => l === 'writersChanged')).toHaveLength(2);
  });

  it('Keep re-indexes the changed files and marks them Draft (generated_by)', async () => {
    const { service, adapter, workspace, log } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    workspace.set('spec/02_requirements/functional_requirements.md', VALID_FR);
    adapter.complete();
    await finished(service, runId);

    await expect(service.keep(runId)).resolves.toEqual({ ok: true });

    expect(log.slice(-2)).toEqual([
      'reindex spec/02_requirements/functional_requirements.md',
      `draft spec/02_requirements/functional_requirements.md ${runId}`,
    ]);
    expect(service.review(runId)?.state).toBe('kept');
    await expect(service.keep(runId)).resolves.toEqual({ ok: false, reason: 'This review is already closed.' });
  });

  it('Discard restores the snapshot of the target folder and re-indexes', async () => {
    const { service, adapter, log } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    adapter.complete();
    await finished(service, runId);

    await expect(service.discard(runId)).resolves.toEqual({ ok: true });

    expect(log.slice(-2)).toEqual(['restore spec/02_requirements snap-1', 'reindex spec/02_requirements/functional_requirements.md']);
    expect(service.review(runId)?.state).toBe('discarded');
  });

  it('a failed run keeps its changes reviewable so they can be discarded', async () => {
    const { service, adapter, statuses } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    adapter.fail('Agent crashed');
    const review = await finished(service, runId);
    expect(review.state).toBe('failed');
    expect(review.files).toHaveLength(1);
    expect(statuses[runId]).toBe('failed');
    await expect(service.discard(runId)).resolves.toEqual({ ok: true });
  });
});

describe('US-027 AC-4: Ask agent to fix', () => {
  it('starts a follow-up run with the issues, on the same baseline snapshot; the old review is superseded', async () => {
    const { service, adapter, workspace, log } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    workspace.set('spec/02_requirements/functional_requirements.md', '### FR-001: Login\nSee FR-404.\n');
    adapter.complete();
    await finished(service, runId);

    const fix = await service.fix(runId);

    expect(fix).toEqual({ ok: true, runId: 'run-2' });
    expect(service.review(runId)?.state).toBe('superseded');
    expect(adapter.requests[1]!.prompt).toContain('FR-001 references FR-404, which does not exist.');
    // Only one capture: the follow-up compares against the original snapshot, so Discard returns to the pre-run state.
    expect(log.filter((l) => l.startsWith('capture'))).toHaveLength(1);
    expect(service.review('run-2')).toMatchObject({ snapshotId: 'snap-1', parentRunId: runId, state: 'running' });
  });

  it('refuses to fix a review without issues', async () => {
    const { service, adapter, workspace } = setup();
    const { runId } = (await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })) as { runId: string };
    workspace.set('spec/02_requirements/functional_requirements.md', VALID_FR);
    adapter.complete();
    await finished(service, runId);
    await expect(service.fix(runId)).resolves.toEqual({ ok: false, reason: 'There are no validation issues to fix.' });
  });
});

describe('US-027 AC-5: non-git mutual exclusion', () => {
  it('in non-git mode a spec run is refused while an implementation run is active', async () => {
    const { service, setImplementationActive } = setup({ workspace: () => ({ root: '/ws', nonGit: true }) });
    setImplementationActive(1);
    await expect(service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/implementation run is changing the shared workspace/),
    });
  });

  it('only one open review per target folder at a time', async () => {
    const { service } = setup();
    await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' });
    await expect(service.start({ projectId: 'p1', target: 'requirements', instruction: 'Again' })).resolves.toEqual({
      ok: false,
      reason: 'A specification run for spec/02_requirements is still running or awaiting review.',
    });
  });
});

describe('US-013 AC-2: specification runs need the AI capability', () => {
  it('refuses to start while AI functions are disabled', async () => {
    const { service, adapter } = setup({ aiDisabledReason: () => 'AI functions are disabled: No agent runtime is available.' });
    await expect(service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' })).resolves.toEqual({
      ok: false,
      reason: 'AI functions are disabled: No agent runtime is available.',
    });
    expect(adapter.requests).toEqual([]);
  });
});

describe('US-031/US-032: phase-specific generation instructions', () => {
  it('US-031 AC-1: requirements generation states the FR-/NFR-/CON- ID conventions', async () => {
    const { service, adapter } = setup();
    await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Generate the requirements from the approved intent.' });
    const prompt = adapter.requests[0]!.prompt;
    expect(prompt).toContain('functional_requirements.md');
    expect(prompt).toMatch(/### FR-001: /);
    expect(prompt).toMatch(/NFR-001/);
    expect(prompt).toMatch(/CON-001/);
    expect(prompt).toMatch(/Priority.*MoSCoW/);
  });

  it('US-032 AC-1/AC-2: design generation references requirement IDs and records decisions as ADRs', async () => {
    const { service, adapter } = setup();
    await service.start({ projectId: 'p1', target: 'design', instruction: 'Generate the design.' });
    const prompt = adapter.requests[0]!.prompt;
    expect(prompt).toMatch(/reference the requirement IDs/i);
    expect(prompt).toMatch(/### ADR-001: /);
    expect(prompt).toMatch(/Context.*Decision.*Alternatives.*Consequences/s);
  });
});

describe('US-030: refine an artifact with AI', () => {
  it('AC-1: starts a refine run limited to the artifact (or a section) with the instruction', async () => {
    const { service, adapter, asked, log } = setup();
    const started = await service.refine({
      projectId: 'p1',
      path: 'spec/02_requirements/functional_requirements.md',
      section: 'FR-001: Login',
      instruction: 'Make the acceptance criteria measurable.',
    });

    expect(started).toEqual({ ok: true, runId: 'run-1' });
    expect(log).toContain('capture spec/02_requirements');
    expect(adapter.requests[0]).toMatchObject({ kind: 'refine' });
    expect(adapter.requests[0]!.prompt).toContain('Make the acceptance criteria measurable.');
    expect(adapter.requests[0]!.prompt).toContain(
      'Change only the section "FR-001: Login" of spec/02_requirements/functional_requirements.md',
    );
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Edit', input: { file_path: 'x' }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({ runKind: 'refine', writeScope: 'spec/02_requirements/functional_requirements.md' });
    expect(service.review('run-1')).toMatchObject({ target: 'spec/02_requirements/functional_requirements.md', kind: 'refine' });
  });

  it('AC-2: the result is a reviewable diff; Accept marks the artifact Draft, Discard restores it', async () => {
    const { service, adapter, workspace, log } = setup();
    const path = 'spec/02_requirements/functional_requirements.md';
    const first = (await service.refine({ projectId: 'p1', path, instruction: 'Shorter.' })) as { runId: string };
    workspace.set(path, VALID_FR);
    adapter.complete();
    await finished(service, first.runId);
    await expect(service.keep(first.runId)).resolves.toEqual({ ok: true });
    expect(log.at(-1)).toBe(`draft ${path} ${first.runId}`);

    const second = (await service.refine({ projectId: 'p1', path, instruction: 'Longer.' })) as { runId: string };
    adapter.complete();
    await finished(service, second.runId);
    await expect(service.discard(second.runId)).resolves.toEqual({ ok: true });
    expect(log).toContain('restore spec/02_requirements snap-1');
  });

  it('refuses a refine while the folder is being generated, and a generation while a file of it is refined', async () => {
    const { service } = setup();
    await service.start({ projectId: 'p1', target: 'requirements', instruction: 'Go' });
    await expect(service.refine({ projectId: 'p1', path: 'spec/02_requirements/fr.md', instruction: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'A specification run for spec/02_requirements is still running or awaiting review.',
    });
    const other = setup();
    await other.service.refine({ projectId: 'p1', path: 'spec/03_design/design.md', instruction: 'x' });
    await expect(other.service.start({ projectId: 'p1', target: 'design', instruction: 'Go' })).resolves.toEqual({
      ok: false,
      reason: 'A specification run for spec/03_design/design.md is still running or awaiting review.',
    });
  });

  it('refuses paths outside spec/ and non-Markdown files', async () => {
    const { service } = setup();
    await expect(service.refine({ projectId: 'p1', path: 'src/app.ts', instruction: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'Only specification artifacts (spec/**/*.md) can be refined.',
    });
  });
});

describe('US-029 AC-3: kept proposals are reported', () => {
  it('calls onKept with the kept review', async () => {
    const kept: string[] = [];
    const { service, adapter } = setup({ onKept: (review) => void kept.push(review.runId) });
    const { runId } = (await service.refine({
      projectId: 'p1',
      path: 'spec/02_requirements/functional_requirements.md',
      instruction: 'x',
    })) as { runId: string };
    adapter.complete();
    await finished(service, runId);
    await service.keep(runId);
    expect(kept).toEqual([runId]);
  });
});

describe('US-035 AC-1: epic generation instructions', () => {
  it('epics are written as EP-xxx files with goal, value, linked requirements and acceptance criteria', async () => {
    const { service, adapter } = setup();
    await service.start({ projectId: 'p1', target: 'epics', instruction: 'Generate epics from the approved design.' });
    const prompt = adapter.requests[0]!.prompt;
    expect(prompt).toContain('spec/04_user_stories/epics/EP-001-<slug>.md');
    expect(prompt).toMatch(/kind: epic/);
    expect(prompt).toMatch(/## Goal.*## Value.*## Acceptance criteria/s);
    expect(prompt).toMatch(/requirements: \[FR-001/);
  });
});

describe('US-036 AC-1: story generation for selected epics', () => {
  it('names the selected epics and the story conventions (Backlog, epic, requirements, dependencies with rationale)', async () => {
    const { service, adapter } = setup({ epics: () => epicList });
    await service.start({ projectId: 'p1', target: 'stories', instruction: 'Generate user stories.', epicIds: ['EP-001', 'EP-003'] });
    const prompt = adapter.requests[0]!.prompt;
    expect(prompt).toContain('Generate stories only for the epics EP-001, EP-003.');
    expect(prompt).toMatch(/status: backlog/);
    expect(prompt).toMatch(/epic: EP-/);
    expect(prompt).toMatch(/depends_on:.*rationale/s);
    expect(prompt).toMatch(/related_to:.*rationale/s);
    expect(prompt).toMatch(/## Acceptance criteria/);
  });

  const epicList = [
    { id: 'EP-001', approval: 'approved' as const },
    { id: 'EP-002', approval: 'draft' as const },
    { id: 'EP-003', approval: 'approved' as const },
  ];

  it('generates for all approved epics when none are selected', async () => {
    const { service, adapter } = setup({ epics: () => epicList });
    await service.start({ projectId: 'p1', target: 'stories', instruction: 'Generate user stories.' });
    expect(adapter.requests[0]!.prompt).toContain('Generate stories only for the epics EP-001, EP-003.');
  });

  it('refuses Draft or unknown epics and an empty selection', async () => {
    const { service, adapter } = setup({ epics: () => epicList });
    const start = (epicIds: string[]) => service.start({ projectId: 'p1', target: 'stories', instruction: 'Go.', epicIds });
    expect(await start(['EP-001', 'EP-002'])).toEqual({ ok: false, reason: 'Stories are generated for approved epics only: EP-002.' });
    expect(await start(['EP-009'])).toEqual({ ok: false, reason: 'Stories are generated for approved epics only: EP-009.' });
    expect(await start([])).toEqual({ ok: false, reason: 'Select at least one approved epic.' });
    expect(adapter.requests).toHaveLength(0);
  });

  it('refuses while epics exist but none is approved', async () => {
    const { service } = setup({ epics: () => [{ id: 'EP-002', approval: 'draft' }] });
    expect(await service.start({ projectId: 'p1', target: 'stories', instruction: 'Go.' })).toEqual({
      ok: false,
      reason: 'Approve the epic structure before generating stories.',
    });
  });

  it('generates stories without epics when the project has none', async () => {
    const { service, adapter } = setup({ epics: () => [] });
    await service.start({ projectId: 'p1', target: 'stories', instruction: 'Generate user stories.' });
    expect(adapter.requests[0]!.prompt).not.toContain('Generate stories only for the epics');
  });
});
