// SPDX-License-Identifier: Apache-2.0
// AI quality check (US-029, UC-032, FR-082): a read-only `quality_check` run with phase-specific criteria returns
// findings; *Apply fix* becomes a refine proposal (applied once kept), *Dismiss* records a reason.
import { z } from 'zod';
import type { RunStatus, NewRun } from '../scheduling/ports.js';
import type { AgentAdapter } from '../ports/agent-adapter.js';
import { runAgent, type AgentRunDeps, type AgentRunStore } from './agent-run.js';
import type { RefineRequest, StartResult } from './spec-run-service.js';

export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';
export type FindingState = 'open' | 'applied' | 'dismissed';

export interface QualityFinding {
  id: string;
  projectId: string;
  runId: string;
  artifactPath: string;
  elementId: string | null;
  severity: FindingSeverity;
  category: string;
  explanation: string;
  suggestedFix: string;
  state: FindingState;
  dismissReason: string | null;
  fixRunId: string | null;
}

export interface QualityStore extends AgentRunStore {
  createRun(projectId: string, run: NewRun): string;
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
  /** Replaces the open findings of the artifact with the new ones (applied/dismissed findings stay as history). */
  replaceFindings(projectId: string, artifactPath: string, findings: QualityFinding[]): void;
  findings(projectId: string, artifactPath?: string): QualityFinding[];
  finding(id: string): QualityFinding | undefined;
  /** Findings whose *Apply fix* proposal is the given refine run. */
  findingsFixedBy(runId: string): QualityFinding[];
  updateFinding(id: string, patch: Partial<Pick<QualityFinding, 'state' | 'dismissReason' | 'fixRunId'>>): void;
}

export interface QualityDeps extends Omit<AgentRunDeps, 'store'> {
  store: QualityStore;
  adapter: AgentAdapter | undefined;
  workspace(projectId: string): { root: string; nonGit: boolean };
  refine(request: RefineRequest): Promise<StartResult>;
  aiDisabledReason?(): string | null;
  newId(): string;
  /** The check ended (findings stored or the run failed). */
  onChecked?(projectId: string, artifactPath: string, runId: string): void;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2, info: 3 };

const ResultSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'major', 'minor', 'info']),
      element: z.string().optional(),
      category: z.string().default('general'),
      explanation: z.string().min(1),
      suggestedFix: z.string().default(''),
    }),
  ),
});

/** Phase-specific review criteria (FR-082). */
export function qualityCriteria(artifactPath: string): string[] {
  const folder = artifactPath.split('/')[1] ?? '';
  const common = ['Clarity and unambiguous wording', 'Consistency with upstream artifacts and with itself', 'Completeness'];
  const specific: Record<string, string[]> = {
    '01_intent': [
      'Problem, goals and scope are stated',
      'Stakeholders and success criteria are named',
      'Open questions and assumptions are explicit',
    ],
    '02_requirements': [
      'Each requirement is testable with an acceptance criterion',
      'Priority (MoSCoW) and release are set',
      'Every requirement traces to the intent',
      'No duplicates or contradictions',
    ],
    '03_design': [
      'Every requirement is addressed by a design element',
      'Decisions are recorded as ADRs with alternatives',
      'Domain and data model are aligned',
    ],
    '04_user_stories': [
      'Stories satisfy INVEST',
      'Acceptance criteria are verifiable',
      'Dependencies are explicit and acyclic',
      'Every story traces to requirements',
    ],
  };
  return [...(specific[folder] ?? []), ...common];
}

/** Findings in the last fenced specforge-result block, sorted by severity; null if missing or invalid. */
export function parseFindings(resultText: string): z.infer<typeof ResultSchema>['findings'] | null {
  const blocks = [...resultText.matchAll(/```specforge-result\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  if (!last) return null;
  try {
    const parsed = ResultSchema.safeParse(JSON.parse(last));
    return parsed.success ? [...parsed.data.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) : null;
  } catch {
    return null;
  }
}

export class QualityService {
  private readonly active = new Map<string, Promise<void>>();

  constructor(private readonly deps: QualityDeps) {}

  async check(projectId: string, artifactPath: string): Promise<StartResult> {
    const { deps } = this;
    const disabled = deps.aiDisabledReason?.() ?? null;
    if (disabled) return { ok: false, reason: disabled };
    const adapter = deps.adapter;
    if (!adapter) return { ok: false, reason: 'No agent adapter is available to run quality checks yet.' };
    const space = deps.workspace(projectId);
    const runId = deps.store.createRun(projectId, {
      storyId: null,
      kind: 'quality_check',
      startKind: null,
      trigger: `QualityCheck ${artifactPath}`,
    });
    deps.store.setRunStatus(runId, 'running');
    const prompt = [
      `Review ${artifactPath} for quality. Do not change any file.`,
      '',
      'Criteria:',
      ...qualityCriteria(artifactPath).map((c) => `- ${c}`),
      '',
      'Report every finding in a final fenced block:',
      '```specforge-result',
      '{"findings":[{"severity":"critical|major|minor|info","element":"FR-003 (optional heading ID)","category":"…","explanation":"…","suggestedFix":"…"}]}',
      '```',
    ].join('\n');
    const run = runAgent(adapter, deps, {
      runId,
      projectId,
      kind: 'quality_check',
      cwd: space.root,
      nonGit: space.nonGit,
      prompt,
      readOnly: true,
    });
    const done = run.done
      .then((outcome) => {
        if (outcome.status !== 'completed') {
          deps.store.setRunStatus(
            runId,
            outcome.status === 'failed' ? 'failed' : 'cancelled',
            outcome.status === 'failed' ? outcome.reason : undefined,
          );
          return;
        }
        const findings = parseFindings(outcome.resultText);
        if (!findings) {
          deps.store.setRunStatus(runId, 'completed_no_result', 'The quality check returned no valid findings block.');
          return;
        }
        deps.store.replaceFindings(
          projectId,
          artifactPath,
          findings.map((f) => ({
            id: deps.newId(),
            projectId,
            runId,
            artifactPath,
            elementId: f.element ?? null,
            severity: f.severity,
            category: f.category,
            explanation: f.explanation,
            suggestedFix: f.suggestedFix,
            state: 'open' as const,
            dismissReason: null,
            fixRunId: null,
          })),
        );
        deps.store.setRunStatus(runId, 'completed');
      })
      .catch((e: unknown) => deps.store.setRunStatus(runId, 'failed', e instanceof Error ? e.message : String(e)))
      .finally(() => {
        this.active.delete(runId);
        deps.onChecked?.(projectId, artifactPath, runId);
      });
    this.active.set(runId, done);
    return { ok: true, runId };
  }

  /** Findings sorted by severity (open first). */
  findings(projectId: string, artifactPath?: string): QualityFinding[] {
    const stateOrder: Record<FindingState, number> = { open: 0, applied: 1, dismissed: 2 };
    return this.deps.store
      .findings(projectId, artifactPath)
      .sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  openCount(projectId: string, artifactPath?: string): number {
    return this.deps.store.findings(projectId, artifactPath).filter((f) => f.state === 'open').length;
  }

  /** Apply fix: a refine proposal of the finding's artifact (section); the finding is applied once the proposal is kept. */
  async applyFix(id: string): Promise<StartResult> {
    const finding = this.deps.store.finding(id);
    if (!finding) return { ok: false, reason: `Unknown finding ${id}.` };
    if (finding.state !== 'open') return { ok: false, reason: 'This finding is no longer open.' };
    const started = await this.deps.refine({
      projectId: finding.projectId,
      path: finding.artifactPath,
      ...(finding.elementId ? { section: finding.elementId } : {}),
      instruction: `Fix this quality finding (${finding.severity}, ${finding.category}): ${finding.explanation}\nSuggested fix: ${finding.suggestedFix}`,
    });
    if (started.ok) this.deps.store.updateFinding(id, { fixRunId: started.runId });
    return started;
  }

  /** A refine proposal was kept: its findings are applied. */
  proposalKept(runId: string): void {
    for (const f of this.deps.store.findingsFixedBy(runId))
      if (f.state === 'open') this.deps.store.updateFinding(f.id, { state: 'applied' });
  }

  dismiss(id: string, reason: string): { ok: true } | { ok: false; reason: string } {
    const finding = this.deps.store.finding(id);
    if (!finding) return { ok: false, reason: `Unknown finding ${id}.` };
    if (!reason.trim()) return { ok: false, reason: 'Give a reason for dismissing the finding.' };
    this.deps.store.updateFinding(id, { state: 'dismissed', dismissReason: reason.trim() });
    return { ok: true };
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.active.values()]);
  }
}
