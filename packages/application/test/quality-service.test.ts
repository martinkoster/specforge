// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  QualityService,
  parseFindings,
  qualityCriteria,
  type AgentAdapter,
  type AgentOutcome,
  type PermissionRunContext,
  type QualityDeps,
  type QualityFinding,
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
  complete(text: string) {
    this.finish({ status: 'completed', sessionId: 's1', resultText: text });
  }
  fail(reason: string) {
    this.finish({ status: 'failed', reason });
  }
}

const RESULT = [
  'Review done.',
  '```specforge-result',
  JSON.stringify({
    findings: [
      { severity: 'minor', element: 'FR-002', category: 'clarity', explanation: 'Vague wording.', suggestedFix: 'Say "within 2 s".' },
      {
        severity: 'critical',
        element: 'FR-001',
        category: 'testability',
        explanation: 'No acceptance criterion.',
        suggestedFix: 'Add one.',
      },
    ],
  }),
  '```',
].join('\n');

function setup(overrides: Partial<QualityDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const findings = new Map<string, QualityFinding>();
  const statuses: Record<string, string> = {};
  const asked: PermissionRunContext[] = [];
  const refines: unknown[] = [];
  const checked: string[] = [];
  let ids = 0;
  let runs = 0;
  const deps: QualityDeps = {
    store: {
      createRun: () => `run-${++runs}`,
      setRunStatus: (id, status) => void (statuses[id] = status),
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
      replaceFindings: (projectId, path, next) => {
        for (const [id, f] of findings) if (f.projectId === projectId && f.artifactPath === path && f.state === 'open') findings.delete(id);
        for (const f of next) findings.set(f.id, f);
      },
      findings: (projectId, path) =>
        [...findings.values()].filter((f) => f.projectId === projectId && (path === undefined || f.artifactPath === path)),
      finding: (id) => findings.get(id),
      findingsFixedBy: (runId) => [...findings.values()].filter((f) => f.fixRunId === runId),
      updateFinding: (id, patch) => void findings.set(id, { ...findings.get(id)!, ...patch }),
    },
    adapter,
    workspace: () => ({ root: '/ws', nonGit: false }),
    env: async () => ({ env: {}, secrets: [] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: {
      ask: async (run) => {
        asked.push(run);
        return { behavior: 'deny', message: 'read-only' };
      },
    },
    implementationActive: () => false,
    refine: async (request) => {
      refines.push(request);
      return { ok: true, runId: 'refine-1' };
    },
    newId: () => `f${++ids}`,
    onChecked: (_p, path) => void checked.push(path),
    now: () => '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
  return { service: new QualityService(deps), adapter, findings, statuses, asked, refines, checked };
}

const PATH = 'spec/02_requirements/functional_requirements.md';

describe('US-029 AC-1: quality check runs with phase-specific criteria', () => {
  it('starts a read-only quality_check run on the artifact with the criteria of its phase', async () => {
    const { service, adapter, asked } = setup();
    await expect(service.check('p1', PATH)).resolves.toEqual({ ok: true, runId: 'run-1' });
    expect(adapter.requests[0]).toMatchObject({ kind: 'quality_check', cwd: '/ws' });
    expect(adapter.requests[0]!.prompt).toContain(`Review ${PATH}`);
    expect(adapter.requests[0]!.prompt).toContain('Each requirement is testable with an acceptance criterion');
    await adapter.hooks.onPermission({ toolUseId: 't', toolName: 'Write', input: { file_path: 'x' }, cwd: '/ws' });
    expect(asked[0]).toMatchObject({ runKind: 'quality_check', readOnly: true });
  });

  it('has criteria for intent, requirements, design and stories', () => {
    expect(qualityCriteria('spec/01_intent/intent.md')).toContain('Open questions and assumptions are explicit');
    expect(qualityCriteria('spec/03_design/design.md')).toContain('Decisions are recorded as ADRs with alternatives');
    expect(qualityCriteria('spec/04_user_stories/US-001.md')).toContain('Stories satisfy INVEST');
    expect(qualityCriteria('spec/04_user_stories/epics/EP-001.md')).toContain('Stories satisfy INVEST');
    expect(qualityCriteria('spec/99/x.md')).toEqual([
      'Clarity and unambiguous wording',
      'Consistency with upstream artifacts and with itself',
      'Completeness',
    ]);
  });

  it('refuses without the AI capability or an adapter', async () => {
    expect(await setup({ aiDisabledReason: () => 'AI functions are disabled.' }).service.check('p1', PATH)).toEqual({
      ok: false,
      reason: 'AI functions are disabled.',
    });
    expect(await setup({ adapter: undefined }).service.check('p1', PATH)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/No agent adapter/),
    });
  });
});

describe('US-029 AC-2: findings by severity with location', () => {
  it('stores the findings of the result, sorted by severity, and replaces the previous open ones', async () => {
    const { service, adapter, statuses, checked } = setup();
    await service.check('p1', PATH);
    adapter.complete(RESULT);
    await service.idle();

    expect(statuses['run-1']).toBe('completed');
    expect(checked).toEqual([PATH]);
    expect(service.findings('p1', PATH).map((f) => [f.severity, f.elementId, f.explanation, f.state])).toEqual([
      ['critical', 'FR-001', 'No acceptance criterion.', 'open'],
      ['minor', 'FR-002', 'Vague wording.', 'open'],
    ]);

    await service.check('p1', PATH);
    adapter.complete('```specforge-result\n{"findings":[{"severity":"info","explanation":"Fine now."}]}\n```');
    await service.idle();
    expect(service.findings('p1', PATH).map((f) => f.explanation)).toEqual(['Fine now.']);
  });

  it('marks runs without a valid findings block and failed runs', async () => {
    const noBlock = setup();
    await noBlock.service.check('p1', PATH);
    noBlock.adapter.complete('No block.');
    await noBlock.service.idle();
    expect(noBlock.statuses['run-1']).toBe('completed_no_result');

    const failed = setup();
    await failed.service.check('p1', PATH);
    failed.adapter.fail('crashed');
    await failed.service.idle();
    expect(failed.statuses['run-1']).toBe('failed');
  });

  it('parses only the last fenced block and rejects invalid ones', () => {
    expect(parseFindings('```specforge-result\n{"findings":[{"severity":"bad","explanation":"x"}]}\n```')).toBeNull();
    expect(parseFindings('```specforge-result\nnot json\n```')).toBeNull();
    expect(
      parseFindings(
        '```specforge-result\n{"findings":[]}\n```\n```specforge-result\n{"findings":[{"severity":"major","explanation":"y"}]}\n```',
      ),
    ).toEqual([{ severity: 'major', category: 'general', explanation: 'y', suggestedFix: '' }]);
  });
});

describe('US-029 AC-3/AC-4: apply fix, dismiss, open count', () => {
  async function checked() {
    const s = setup();
    await s.service.check('p1', PATH);
    s.adapter.complete(RESULT);
    await s.service.idle();
    return s;
  }

  it("Apply fix starts a refine proposal of the finding's section; keeping it marks the finding applied", async () => {
    const { service, refines } = await checked();
    const critical = service.findings('p1', PATH)[0]!;

    await expect(service.applyFix(critical.id)).resolves.toEqual({ ok: true, runId: 'refine-1' });
    expect(refines).toEqual([
      { projectId: 'p1', path: PATH, section: 'FR-001', instruction: expect.stringContaining('No acceptance criterion.') },
    ]);
    expect(service.findings('p1', PATH)[0]).toMatchObject({ state: 'open', fixRunId: 'refine-1' });

    service.proposalKept('refine-1');
    expect(service.findings('p1', PATH).find((f) => f.id === critical.id)).toMatchObject({ state: 'applied' });
    await expect(service.applyFix(critical.id)).resolves.toEqual({ ok: false, reason: 'This finding is no longer open.' });
    await expect(service.applyFix('nope')).resolves.toEqual({ ok: false, reason: 'Unknown finding nope.' });
  });

  it('Dismiss needs a reason and records it; the open count drops', async () => {
    const { service } = await checked();
    const minor = service.findings('p1', PATH)[1]!;
    expect(service.openCount('p1', PATH)).toBe(2);

    expect(service.dismiss(minor.id, '  ')).toEqual({ ok: false, reason: 'Give a reason for dismissing the finding.' });
    expect(service.dismiss(minor.id, 'Intentional wording.')).toEqual({ ok: true });
    expect(service.dismiss('nope', 'x')).toEqual({ ok: false, reason: 'Unknown finding nope.' });

    expect(service.findings('p1', PATH).at(-1)).toMatchObject({ id: minor.id, state: 'dismissed', dismissReason: 'Intentional wording.' });
    expect(service.openCount('p1', PATH)).toBe(1);
    expect(service.openCount('p1')).toBe(1);
  });

  it('a refused refine leaves the finding unchanged', async () => {
    const s = setup({ refine: vi.fn(async () => ({ ok: false as const, reason: 'busy' })) });
    await s.service.check('p1', PATH);
    s.adapter.complete(RESULT);
    await s.service.idle();
    const id = s.service.findings('p1', PATH)[0]!.id;
    await expect(s.service.applyFix(id)).resolves.toEqual({ ok: false, reason: 'busy' });
    expect(s.service.findings('p1', PATH)[0]!.fixRunId).toBeNull();
  });
});
