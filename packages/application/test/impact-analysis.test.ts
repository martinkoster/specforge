// SPDX-License-Identifier: Apache-2.0
// US-088: AI impact analysis (read-only `impact` run) — streamed agent items, merge with trace items, cancel/re-run.
import { describe, expect, it, vi } from 'vitest';
import {
  ImpactService,
  parseImpactLine,
  type AgentAdapter,
  type AgentOutcome,
  type ImpactItemRecord,
  type ImpactServiceDeps,
  type PermissionRunContext,
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
  output(text: string) {
    this.hooks.onEvent({ type: 'output', text });
  }
  complete(text = 'Done.') {
    this.finish({ status: 'completed', sessionId: 's1', resultText: text });
  }
}

const line = (category: string, targetRef: string, confidence: string, reason: string) =>
  `IMPACT ${JSON.stringify({ category, targetRef, confidence, reason })}`;

function setup(over: Partial<ImpactServiceDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const rows = new Map<string, ImpactItemRecord>();
  const asked: PermissionRunContext[] = [];
  const updates: string[] = [];
  let n = 0;
  const deps: ImpactServiceDeps = {
    element: (_p, id) =>
      ({
        'FI-001': { type: 'feature_intent', title: 'Task comments' },
        'FR-034': { type: 'fr', title: 'Task details' },
        'UC-010': { type: 'uc', title: 'Task data model' },
        'EP-002': { type: 'epic', title: 'Task management' },
        'US-008': { type: 'story', title: 'Task detail view' },
      })[id],
    allLinks: () => [{ source: 'FI-001', target: 'FR-034' }],
    stories: () => [{ id: 'US-008', status: 'done', epicId: 'EP-002' }],
    storyRuns: () => [],
    storyFiles: () => [],
    store: {
      replaceTraceItems: (projectId, featureId, items) => {
        for (const [id, r] of rows) if (r.featureId === featureId && r.origin === 'trace') rows.delete(id);
        for (const i of items) rows.set(i.id, i);
      },
      removeOrigin: (projectId, featureId, origin) => {
        for (const [id, r] of rows) if (r.featureId === featureId && r.origin === origin && !r.confirmed) rows.delete(id);
      },
      items: (_p, featureId) => [...rows.values()].filter((r) => r.featureId === featureId),
      add: (item) => void rows.set(item.id, item),
      remove: (id) => void rows.delete(id),
      confirm: () => undefined,
    },
    newId: () => `item-${++n}`,
    agent: {
      adapter,
      runs: {
        createRun: () => `run-${++n}`,
        setRunStatus: () => undefined,
        markStarted: () => undefined,
        setSessionId: () => undefined,
        appendEvents: () => undefined,
      },
      workspace: () => ({ root: '/ws', nonGit: false }),
      context: () => ({
        featurePath: 'spec/01_intent/FI-001-task-comments.md',
        elements: ['- UC-010: Task data model', '- EP-002: Task management', '- US-008: Task detail view (done)'],
      }),
      env: async () => ({ env: {}, secrets: [] }),
      config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
      permissions: {
        ask: async (run) => {
          asked.push(run);
          return { behavior: 'deny', message: 'read-only' };
        },
      },
      implementationActive: () => false,
      now: () => 't',
      aiDisabledReason: () => null,
      onUpdated: (_p, featureId) => void updates.push(featureId),
    },
    ...over,
  };
  return { service: new ImpactService(deps), adapter, rows, asked, updates, deps };
}

describe('US-088 AC-1: the impact run starts in the background; trace items stay usable', () => {
  it('runs read-only with the feature intent and the element index; the state is analysing meanwhile', async () => {
    const { service, adapter, asked } = setup();
    service.propose('p1', 'FI-001');

    expect(await service.analyse('p1', 'FI-001')).toEqual({ ok: true, runId: expect.any(String) });
    expect(adapter.requests[0]).toMatchObject({ kind: 'impact', cwd: '/ws' });
    expect(adapter.requests[0]!.prompt).toContain('spec/01_intent/FI-001-task-comments.md');
    expect(adapter.requests[0]!.prompt).toContain('- UC-010: Task data model');
    expect(adapter.requests[0]!.prompt).toContain('FR-034');
    expect(service.view('p1', 'FI-001')).toMatchObject({ state: 'analysing', analysing: true });
    expect(service.view('p1', 'FI-001').items.map((i) => i.targetRef)).toEqual(['FR-034']);
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: 'x' }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({ runKind: 'impact', readOnly: true });
    await expect(service.analyse('p1', 'FI-001')).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('running') });
  });
});

describe('US-088 AC-2/AC-4: agent items stream in; duplicates of trace items keep the trace item', () => {
  it('adds streamed items with source AI and the final block, merging duplicates', async () => {
    const { service, adapter, updates } = setup();
    service.propose('p1', 'FI-001');
    await service.analyse('p1', 'FI-001');

    adapter.output(line('design', 'UC-010', 'medium', 'Comments need a new entity in the task data model.'));
    expect(service.view('p1', 'FI-001').items.find((i) => i.targetRef === 'UC-010')).toMatchObject({
      origin: 'agent',
      confidence: 'medium',
      category: 'design',
      reason: 'Comments need a new entity in the task data model.',
    });
    expect(updates).toContain('FI-001');
    adapter.output(
      `${line('requirement', 'FR-034', 'low', 'Duplicate')}\nnoise\n${line('epic', 'EP-002', 'high', 'Extend Task management.')}`,
    );
    adapter.complete(
      `Done.\n\`\`\`specforge-result\n${JSON.stringify({ items: [{ category: 'story_done', targetRef: 'US-008', confidence: 'high', reason: 'Implements the task detail view.' }] })}\n\`\`\``,
    );
    await vi.waitFor(() => expect(service.view('p1', 'FI-001').analysing).toBe(false));

    const items = service.view('p1', 'FI-001').items;
    expect(items.find((i) => i.targetRef === 'FR-034')).toMatchObject({ origin: 'trace', confidence: 'high' });
    expect(items.filter((i) => i.targetRef === 'FR-034')).toHaveLength(1);
    expect(items.map((i) => `${i.origin}:${i.targetRef}`)).toEqual(['trace:FR-034', 'agent:UC-010', 'agent:EP-002', 'agent:US-008']);
    expect(service.view('p1', 'FI-001').state).toBe('proposed');
  });

  it('parses only valid impact lines', () => {
    expect(parseImpactLine('IMPACT {"category":"epic","targetRef":"EP-1","confidence":"low","reason":"r"}')).toMatchObject({
      targetRef: 'EP-1',
    });
    expect(parseImpactLine('IMPACT {bad')).toBeNull();
    expect(parseImpactLine('IMPACT {"category":"nope","targetRef":"x","confidence":"low","reason":"r"}')).toBeNull();
    expect(parseImpactLine('other')).toBeNull();
  });
});

describe('US-088 AC-3: cancel, re-run and limited mode', () => {
  it('cancels the run, re-runs replacing the earlier agent items, and refuses in limited mode', async () => {
    const { service, adapter } = setup();
    service.propose('p1', 'FI-001');
    await service.analyse('p1', 'FI-001');
    adapter.output(line('design', 'UC-010', 'medium', 'First run.'));
    await service.cancel('p1', 'FI-001');
    await vi.waitFor(() => expect(service.view('p1', 'FI-001').analysing).toBe(false));

    await service.analyse('p1', 'FI-001');
    expect(service.view('p1', 'FI-001').items.map((i) => i.targetRef)).toEqual(['FR-034']);
    adapter.complete();
    await vi.waitFor(() => expect(service.view('p1', 'FI-001').analysing).toBe(false));

    const limited = setup();
    limited.deps.agent!.aiDisabledReason = () => 'Limited mode: no agent runtime.';
    await expect(limited.service.analyse('p1', 'FI-001')).resolves.toEqual({ ok: false, reason: 'Limited mode: no agent runtime.' });
    const none = setup({ agent: undefined });
    await expect(none.service.analyse('p1', 'FI-001')).resolves.toMatchObject({ ok: false });
    await expect(none.service.cancel('p1', 'FI-001')).resolves.toBeUndefined();
  });
});
