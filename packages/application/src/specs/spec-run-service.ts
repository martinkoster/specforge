// SPDX-License-Identifier: Apache-2.0
// Specification runs (US-027, ADR-014): the agent works in the main workspace with writes restricted to the target spec
// folder; the folder is snapshotted before the run, produced files are validated afterwards and the user keeps or
// discards the changes (Discard restores the snapshot).
import type { RunConfig, RunEventRecord } from '../execution/execution-service.js';
import type { PermissionRunContext } from '../permissions/permission-broker.js';
import type { AgentAdapter, AgentEvent, PermissionAnswer, PermissionAsk, RunKind } from '../ports/agent-adapter.js';
import type { NewRun, RunStatus } from '../scheduling/ports.js';
import type { GenerationTarget } from './approval-service.js';
import { runAgent } from './agent-run.js';
import { validateSpecFiles, type SpecIndexView, type SpecValidationIssue } from './spec-validation.js';

/** Folder each generation writes (data_model.md §1). */
export const SPEC_TARGET_FOLDERS: Readonly<Record<GenerationTarget, string>> = {
  requirements: 'spec/02_requirements',
  design: 'spec/03_design',
  epics: 'spec/04_user_stories/epics',
  stories: 'spec/04_user_stories',
  test_concepts: 'spec/05_test_concepts',
};

export type SpecReviewState = 'running' | 'open' | 'failed' | 'cancelled' | 'kept' | 'discarded' | 'superseded';

export interface SpecFileChange {
  /** Workspace-relative POSIX path. */
  path: string;
  change: 'A' | 'M' | 'D';
  /** Unified diff for text files. */
  patch?: string;
}

export interface SpecReviewRecord {
  runId: string;
  projectId: string;
  /** Target folder, e.g. `spec/02_requirements`. */
  target: string;
  kind: RunKind;
  instruction: string;
  snapshotId: string;
  /** The run whose review this follow-up ("Ask agent to fix") replaced. */
  parentRunId: string | null;
  state: SpecReviewState;
  files: SpecFileChange[];
  issues: SpecValidationIssue[];
  /** Why the run failed or was cancelled. */
  reason: string | null;
  createdAt: string;
}

export interface SpecRunStore {
  createRun(projectId: string, run: NewRun): string;
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
  markStarted(runId: string, at: string): void;
  setSessionId(runId: string, sessionId: string): void;
  appendEvents(runId: string, events: RunEventRecord[]): void;
  saveSpecReview(review: SpecReviewRecord): void;
  specReview(runId: string): SpecReviewRecord | undefined;
  /** A review of the target folder that is running or not yet kept/discarded. */
  openSpecReview(projectId: string, target: string): SpecReviewRecord | undefined;
  /** All runs of the project that are running or not yet kept/discarded. */
  openSpecReviews(projectId: string): SpecReviewRecord[];
}

/** Target-folder snapshots (SnapshotStore, ADR-014). */
export interface SpecSnapshots {
  capture(projectId: string, folder: string): Promise<string>;
  changes(projectId: string, folder: string, snapshotId: string): Promise<SpecFileChange[]>;
  restore(projectId: string, folder: string, snapshotId: string): Promise<void>;
}

export interface SpecRunDeps {
  store: SpecRunStore;
  snapshots: SpecSnapshots;
  files: { read(projectId: string, path: string): Promise<string | null> };
  index(projectId: string): SpecIndexView;
  adapter: AgentAdapter | undefined;
  workspace(projectId: string): { root: string; nonGit: boolean };
  implementationActive(projectId: string): boolean;
  /** Epics of the project (story generation runs for approved epics only, US-036). */
  epics?(projectId: string): ReadonlyArray<{ id: string; approval: 'draft' | 'approved' }>;
  env(projectId: string): Promise<{ env: Record<string, string>; secrets: string[] }>;
  config(projectId: string): RunConfig;
  permissions: { ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> };
  approvals: { markDraftAfterAiChange(projectId: string, paths: readonly string[], runId: string): Promise<void> };
  reindex(projectId: string, paths: readonly string[]): Promise<void>;
  /** A workspace writer started or ended (→ Scheduler `WorkspaceWriterChanged`, FR-116b). */
  onWritersChanged(projectId: string): void;
  /** The changes of a run were kept (e.g. an *Apply fix* proposal, US-029). */
  onKept?(review: SpecReviewRecord): void;
  /** The review is ready (or the run failed). */
  onReviewReady?(review: SpecReviewRecord): void;
  emit?(runId: string, event: AgentEvent, seq: number): void;
  now(): string;
  /** Why AI actions are disabled (capability gating, US-013), or null. */
  aiDisabledReason?(): string | null;
}

export interface SpecRunRequest {
  projectId: string;
  target: GenerationTarget;
  instruction: string;
  kind?: Extract<RunKind, 'generate' | 'refine'>;
  /** Story generation for these approved epics only (US-036); all approved epics when absent. */
  epicIds?: readonly string[];
}

export interface RefineRequest {
  projectId: string;
  /** The artifact to refine: a Markdown file below spec/. */
  path: string;
  /** Heading of the section to refine; the whole artifact when absent. */
  section?: string;
  instruction: string;
}

export type StartResult = { ok: true; runId: string } | { ok: false; reason: string };

/** Folder snapshotted for a run: the target folder, or the folder of a refined artifact. */
const snapshotFolder = (target: string): string => (target.endsWith('.md') ? target.slice(0, target.lastIndexOf('/')) : target);
const overlapping = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
export type ReviewResult = { ok: true } | { ok: false; reason: string };

const REVIEWABLE: ReadonlySet<SpecReviewState> = new Set(['open', 'failed', 'cancelled']);
const NO_ADAPTER = 'No agent adapter is available to run specification generation yet.';

export class SpecRunService {
  private readonly active = new Map<string, Promise<void>>();

  constructor(private readonly deps: SpecRunDeps) {}

  start(request: SpecRunRequest): Promise<StartResult> {
    const folder = SPEC_TARGET_FOLDERS[request.target];
    const selection = request.target === 'stories' ? this.epicSelection(request) : { ok: true as const, epicIds: [] };
    if (!selection.ok) return Promise.resolve(selection);
    const epics = selection.epicIds.length ? `\n\nGenerate stories only for the epics ${selection.epicIds.join(', ')}.` : '';
    return this.launch({
      projectId: request.projectId,
      target: folder,
      kind: request.kind ?? 'generate',
      instruction: `${request.instruction}${epics}`,
      parent: null,
    });
  }

  /** US-036 AC-1: stories are generated for all or selected approved epics; projects without epics generate without. */
  private epicSelection(request: SpecRunRequest): { ok: true; epicIds: readonly string[] } | { ok: false; reason: string } {
    const epics = this.deps.epics?.(request.projectId) ?? [];
    if (epics.length === 0) return { ok: true, epicIds: [] };
    const approved = new Set(epics.filter((e) => e.approval === 'approved').map((e) => e.id));
    if (request.epicIds === undefined) {
      if (approved.size === 0) return { ok: false, reason: 'Approve the epic structure before generating stories.' };
      return { ok: true, epicIds: [...approved] };
    }
    if (request.epicIds.length === 0) return { ok: false, reason: 'Select at least one approved epic.' };
    const refused = request.epicIds.filter((id) => !approved.has(id));
    if (refused.length) return { ok: false, reason: `Stories are generated for approved epics only: ${refused.join(', ')}.` };
    return { ok: true, epicIds: request.epicIds };
  }

  /** Refine with AI (US-030, UC-008): a `refine` run that may change only this artifact; reviewed like generations. */
  refine(request: RefineRequest): Promise<StartResult> {
    const { path, section } = request;
    if (!/^spec\/(?:[^/]+\/)*[^/]+\.md$/.test(path) || path.split('/').includes('..')) {
      return Promise.resolve({ ok: false, reason: 'Only specification artifacts (spec/**/*.md) can be refined.' });
    }
    const scope = section ? `Change only the section "${section}" of ${path}; keep the rest of the file unchanged.` : `Refine ${path}.`;
    return this.launch({
      projectId: request.projectId,
      target: path,
      kind: 'refine',
      instruction: `${scope}\n\n${request.instruction}`,
      parent: null,
    });
  }

  review(runId: string): SpecReviewRecord | undefined {
    return this.deps.store.specReview(runId);
  }

  /** Keep: the changed artifacts are re-indexed and need a new human approval (Draft, `generated_by`). */
  async keep(runId: string): Promise<ReviewResult> {
    const review = this.reviewable(runId);
    if (!review.ok) return review;
    const paths = review.record.files.filter((f) => f.change !== 'D').map((f) => f.path);
    await this.deps.reindex(
      review.record.projectId,
      review.record.files.map((f) => f.path),
    );
    await this.deps.approvals.markDraftAfterAiChange(review.record.projectId, paths, runId);
    this.save({ ...review.record, state: 'kept' });
    this.deps.onKept?.(review.record);
    return { ok: true };
  }

  /** Discard: the target folder is restored from the pre-run snapshot. */
  async discard(runId: string): Promise<ReviewResult> {
    const review = this.reviewable(runId);
    if (!review.ok) return review;
    const { projectId, target, snapshotId, files } = review.record;
    await this.deps.snapshots.restore(projectId, snapshotFolder(target), snapshotId);
    await this.deps.reindex(
      projectId,
      files.map((f) => f.path),
    );
    this.save({ ...review.record, state: 'discarded' });
    return { ok: true };
  }

  /** Ask agent to fix: a follow-up run gets the issues; its review covers all changes since the original snapshot. */
  async fix(runId: string): Promise<StartResult> {
    const review = this.reviewable(runId);
    if (!review.ok) return review;
    const { record } = review;
    if (record.issues.length === 0) return { ok: false, reason: 'There are no validation issues to fix.' };
    this.save({ ...record, state: 'superseded' });
    const issues = record.issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
    const started = await this.launch({
      projectId: record.projectId,
      target: record.target,
      kind: record.kind === 'refine' ? 'refine' : 'generate',
      instruction: `${record.instruction}\n\nThe files you produced have validation issues. Fix them:\n${issues}`,
      parent: record,
    });
    if (!started.ok) this.save({ ...record });
    return started;
  }

  /** Waits for the active runs (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.active.values()]);
  }

  private reviewable(runId: string): { ok: true; record: SpecReviewRecord } | { ok: false; reason: string } {
    const record = this.deps.store.specReview(runId);
    if (!record) return { ok: false, reason: `Unknown specification run ${runId}.` };
    if (record.state === 'running') return { ok: false, reason: 'The run is still active.' };
    if (!REVIEWABLE.has(record.state)) return { ok: false, reason: 'This review is already closed.' };
    return { ok: true, record };
  }

  private save(record: SpecReviewRecord): void {
    this.deps.store.saveSpecReview(record);
  }

  private async launch(r: {
    projectId: string;
    /** Target folder, or the artifact of a refine run (write scope). */
    target: string;
    kind: Extract<RunKind, 'generate' | 'refine'>;
    instruction: string;
    parent: SpecReviewRecord | null;
  }): Promise<StartResult> {
    const { deps } = this;
    const disabled = deps.aiDisabledReason?.() ?? null;
    if (disabled) return { ok: false, reason: disabled };
    const adapter = deps.adapter;
    if (!adapter) return { ok: false, reason: NO_ADAPTER };
    const space = deps.workspace(r.projectId);
    if (space.nonGit && deps.implementationActive(r.projectId)) {
      return {
        ok: false,
        reason: 'An implementation run is changing the shared workspace (no Git); start the specification run after it finishes.',
      };
    }
    // Runs whose targets overlap would restore each other's snapshots: one undecided run per area at a time.
    const open = deps.store.openSpecReviews(r.projectId).find((o) => o.runId !== r.parent?.runId && overlapping(o.target, r.target));
    if (open) {
      return { ok: false, reason: `A specification run for ${open.target} is still running or awaiting review.` };
    }

    const runId = deps.store.createRun(r.projectId, {
      storyId: null,
      kind: r.kind,
      startKind: null,
      trigger: r.parent ? `FixRequested ${r.parent.runId}` : `${r.kind === 'refine' ? 'SpecRefinement' : 'SpecGeneration'} ${r.target}`,
      ...(r.parent ? { parentRunId: r.parent.runId } : {}),
    });
    const snapshotId = r.parent?.snapshotId ?? (await deps.snapshots.capture(r.projectId, snapshotFolder(r.target)));
    const record: SpecReviewRecord = {
      runId,
      projectId: r.projectId,
      target: r.target,
      kind: r.kind,
      instruction: r.instruction,
      snapshotId,
      parentRunId: r.parent?.runId ?? null,
      state: 'running',
      files: [],
      issues: [],
      reason: null,
      createdAt: deps.now(),
    };
    this.save(record);
    deps.store.setRunStatus(runId, 'running');
    deps.onWritersChanged(r.projectId);

    const done = this.execute(adapter, record, space)
      .catch((e: unknown) => this.finish(record, 'failed', e instanceof Error ? e.message : String(e)))
      .finally(() => {
        this.active.delete(runId);
        deps.onWritersChanged(r.projectId);
      });
    this.active.set(runId, done);
    return { ok: true, runId };
  }

  private async execute(adapter: AgentAdapter, record: SpecReviewRecord, space: { root: string; nonGit: boolean }): Promise<void> {
    const outcome = await runAgent(adapter, this.deps, {
      runId: record.runId,
      projectId: record.projectId,
      kind: record.kind,
      cwd: space.root,
      nonGit: space.nonGit,
      prompt: specPrompt(record),
      writeScope: record.target,
    }).done;
    if (outcome.status === 'completed') return this.finish(record, 'open', null);
    if (outcome.status === 'failed') return this.finish(record, 'failed', outcome.reason);
    return this.finish(record, 'cancelled', 'The run was cancelled.');
  }

  /** Computes the changes since the snapshot and validates them; the review becomes available. */
  private async finish(record: SpecReviewRecord, state: 'open' | 'failed' | 'cancelled', reason: string | null): Promise<void> {
    const { deps } = this;
    const files = await deps.snapshots.changes(record.projectId, snapshotFolder(record.target), record.snapshotId).catch(() => []);
    const contents = await Promise.all(
      files.map(async (f) => ({ path: f.path, content: f.change === 'D' ? null : await deps.files.read(record.projectId, f.path) })),
    );
    const issues = validateSpecFiles(contents, deps.index(record.projectId));
    const review: SpecReviewRecord = { ...record, state, files, issues, reason };
    this.save(review);
    deps.store.setRunStatus(record.runId, state === 'open' ? 'completed' : state, reason ?? undefined);
    deps.onReviewReady?.(review);
  }
}

/** Phase-specific conventions of the generated artifacts (US-031, US-032; spec conventions of data_model.md §1). */
const TARGET_GUIDANCE: Readonly<Record<string, readonly string[]>> = {
  [SPEC_TARGET_FOLDERS.requirements]: [
    'Write functional_requirements.md, non_functional_requirements.md and constraints.md (front-matter `kind: requirements`).',
    'Functional requirements: "### FR-001: Title", non-functional: "### NFR-001: Title", constraints: "### CON-001: Title" — numbered without gaps, continuing after existing IDs.',
    "Every FR/NFR has **Description**, **Source** (the intent passage), **Priority** (MoSCoW: Must/Should/Could/Won't Have), **Release** and **Acceptance**.",
  ],
  [SPEC_TARGET_FOLDERS.stories]: [
    'Write one file per story: spec/04_user_stories/US-001-<slug>.md (IDs continue after existing stories); do not change existing stories.',
    'Front-matter: kind: story, id, title, status: backlog, approval: draft, size (XS/S/M/L), epic: EP-…, requirements: [FR-…].',
    'Dependencies: depends_on: [{ id: US-…, rationale: why it must come first }] and related_to: [{ id: US-…, rationale: how they relate }]; only existing or newly written story IDs; keep them acyclic.',
    'Sections: ## Description ("As a … I want … so that …") and ## Acceptance criteria (checklist, each verifiable).',
  ],
  [SPEC_TARGET_FOLDERS.epics]: [
    'Write one file per epic: spec/04_user_stories/epics/EP-001-<slug>.md (IDs continue after existing epics).',
    'Front-matter: kind: epic, id, title, approval: draft, requirements: [FR-001, …] (the requirements the epic covers).',
    'Sections: ## Goal, ## Value and ## Acceptance criteria (checklist). Every Must-have requirement belongs to at least one epic.',
  ],
  [SPEC_TARGET_FOLDERS.design]: [
    'Write functional_design/ (use cases "### UC-001: …", business processes, domain model, user flows) and technical_design/ (architecture, data model, technical decisions); front-matter `kind: design`.',
    'Reference the requirement IDs (FR-/NFR-/CON-) every design element addresses.',
    'Record each architectural decision that is needed as "### ADR-001: Title" with **Context**, **Decision**, **Alternatives** and **Consequences**.',
  ],
};

function specPrompt(record: SpecReviewRecord): string {
  return [
    record.instruction,
    '',
    record.target.endsWith('.md')
      ? `Edit only ${record.target} (other writes and shell commands are denied).`
      : `Write only files inside ${record.target}/ (other writes and shell commands are denied).`,
    ...(TARGET_GUIDANCE[record.target] ?? []),
    'Every artifact starts with YAML front-matter; element headings use stable IDs ("### FR-001: Title"); never reuse an existing ID;',
    'references must point to existing IDs; story dependencies (depends_on) must stay acyclic.',
    'SpecForge validates the files after the run and the user keeps or discards the changes.',
  ].join('\n');
}
