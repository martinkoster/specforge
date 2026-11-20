// SPDX-License-Identifier: Apache-2.0
// Feature intents (US-081, FR-104, ADR-021): list and detail with the derived lifecycle and the typed trace links; the
// status in the file is written by SpecForge only (Withdrawn is a user decision, US-094).
import {
  featureNextStep,
  featurePhases,
  featureStatus,
  nextFeatureId,
  type BoardStatus,
  type FeaturePhase,
  type FeaturePhaseStatus,
  type FeatureProgress,
  type FeatureStatus,
} from '@specforge/domain';
import type { ArtifactFiles } from '../stories/dependency-service.js';
import type { ImpactView } from './impact-service.js';
import { editFrontMatter } from '../stories/front-matter.js';

export interface FeatureRecord {
  id: string;
  title: string;
  approval: 'draft' | 'approved';
  /** Status recorded in the file. */
  status: FeatureStatus;
  sourceIdea: string | null;
  baseline: string | null;
  path: string;
}

export interface FeatureLink {
  id: string;
  /** `introduces`, `changes`, `reworks` or `references`. */
  type: string;
}

export interface FeatureView extends Omit<FeatureRecord, 'status'> {
  status: FeatureStatus;
  storyCount: number;
  /** Feature-scoped stepper (US-084) — the mini stepper of the dashboard (US-085). */
  phases: FeaturePhaseStatus[];
  current: FeaturePhase;
  /** The feature's next step, or null when it needs nothing (US-085). */
  nextStep: string | null;
  /** Linked stories Done / total. */
  progress: { done: number; total: number };
}

/** A status change of a feature (US-094 AC-3): shown in the activity feed and on the feature page. */
export interface FeatureEvent {
  projectId: string;
  featureId: string;
  status: FeatureStatus;
  note: string | null;
  at: string;
}

/** What *Withdraw* would do (US-094 AC-2). */
export interface WithdrawPreview {
  /** Phases with an open change set (discarded on withdrawal). */
  openChangeSets: string[];
  /** Elements the feature introduced or changed: they stay and can be deprecated. */
  appliedChanges: string[];
  /** Linked stories in Backlog or Ready: the user keeps or deletes each one. */
  notStartedStories: string[];
  /** Why the feature cannot be withdrawn now, or null. */
  blockedBy: string | null;
}

export class FeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureError';
  }
}

export interface FeatureDetail extends FeatureView {
  links: FeatureLink[];
  /** The impact list (US-087); the confirmed items scope the delta phases. */
  impact: ImpactView | null;
  /** In-flight decisions (US-091), newest first. */
  decisions: { storyId: string; decision: 'continue' | 'cancel' | 'apply_in_corrections'; decidedAt: string }[];
  /** Status changes (US-094 AC-3), newest first. */
  events: FeatureEvent[];
}

export interface FeatureServiceDeps {
  index: {
    features(projectId: string): FeatureRecord[];
    featureStories(projectId: string, featureId: string): { id: string; status: BoardStatus; approval?: 'draft' | 'approved' }[];
    linkSources(projectId: string, id: string): string[];
    linkType(projectId: string, source: string, target: string): string | undefined;
  };
  /** A delta change set of the feature was accepted (Release 2 delta application, US-087); false until then. */
  acceptedDelta?(projectId: string, featureId: string): boolean;
  /** Impact analysis state (US-085); not started until then. */
  impact?(projectId: string, featureId: string): FeatureProgress['impact'];
  /** Delta change set state per phase (US-087/US-088); none until then. */
  delta?(projectId: string, featureId: string, phase: 'requirements' | 'design' | 'stories'): FeatureProgress['requirementsDelta'];
  /** The feature's epic review is decided (US-091). */
  epicReviewed?(projectId: string, featureId: string): boolean;
  /** The impact list of the feature (US-087). */
  impactView?(projectId: string, featureId: string): ImpactView;
  /** In-flight decisions of the feature (US-091). */
  decisions?(projectId: string, featureId: string): FeatureDetail['decisions'];
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  /** Records a status change (US-094 AC-3). */
  recordEvent?(event: FeatureEvent): void;
  /** Status changes of a feature, newest first. */
  events?(projectId: string, featureId: string): FeatureEvent[];
  /** Change sets of the feature that are open or still generating; discard closes the open ones (US-094 AC-2). */
  changeSets?: {
    open(projectId: string, featureId: string): { phase: string; state: 'open' | 'running' }[];
    discard(projectId: string, featureId: string): string[];
  };
  storyPath?(projectId: string, storyId: string): string | undefined;
  removeFile?(projectId: string, path: string): Promise<void>;
  now?(): string;
}

const NOT_STARTED: ReadonlySet<BoardStatus> = new Set(['backlog', 'ready']);

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class FeatureService {
  constructor(private readonly deps: FeatureServiceDeps) {}

  list(projectId: string): FeatureView[] {
    return this.deps.index.features(projectId).map((f) => this.view(projectId, f));
  }

  get(projectId: string, featureId: string): FeatureDetail | undefined {
    const record = this.deps.index.features(projectId).find((f) => f.id === featureId);
    if (!record) return undefined;
    const links = this.deps.index
      .linkSources(projectId, featureId)
      .map((id) => ({ id, type: this.deps.index.linkType(projectId, id, featureId) ?? 'references' }))
      .sort(byId);
    return {
      ...this.view(projectId, record),
      links,
      impact: this.deps.impactView?.(projectId, featureId) ?? null,
      decisions: this.deps.decisions?.(projectId, featureId) ?? [],
      events: this.deps.events?.(projectId, featureId) ?? [],
    };
  }

  /** US-094 AC-2: what withdrawing the feature would discard, keep and ask about. */
  withdrawPreview(projectId: string, featureId: string): WithdrawPreview {
    const record = this.record(projectId, featureId);
    const status = this.derived(projectId, record);
    const sets = this.deps.changeSets?.open(projectId, featureId) ?? [];
    const running = sets.filter((s) => s.state === 'running').map((s) => s.phase);
    return {
      openChangeSets: sets.filter((s) => s.state === 'open').map((s) => s.phase),
      appliedChanges: this.deps.index
        .linkSources(projectId, featureId)
        .filter(
          (id) => !id.startsWith('US-') && ['introduces', 'changes'].includes(this.deps.index.linkType(projectId, id, featureId) ?? ''),
        )
        .sort(),
      notStartedStories: this.deps.index
        .featureStories(projectId, featureId)
        .filter((s) => NOT_STARTED.has(s.status))
        .map((s) => s.id)
        .sort(),
      blockedBy:
        status === 'withdrawn'
          ? `${featureId} is already withdrawn.`
          : status === 'done'
            ? `${featureId} is Done; Done features are not withdrawn.`
            : running.length > 0
              ? `A ${running.join(', ')} generation of ${featureId} is running — wait until it finishes.`
              : null,
    };
  }

  /**
   * US-094 AC-2: *Withdraw* — discards open change sets, keeps applied changes, deletes the chosen not-started stories and
   * writes the terminal status Withdrawn.
   */
  async withdraw(
    projectId: string,
    featureId: string,
    options: { deleteStories: readonly string[] },
  ): Promise<{ discarded: string[]; deleted: string[]; kept: string[] }> {
    const record = this.record(projectId, featureId);
    const preview = this.withdrawPreview(projectId, featureId);
    if (preview.blockedBy) throw new FeatureError(preview.blockedBy);
    const invalid = options.deleteStories.filter((id) => !preview.notStartedStories.includes(id));
    if (invalid.length > 0) throw new FeatureError(`${invalid.join(', ')}: only not-started stories of ${featureId} can be deleted.`);
    const discarded = this.deps.changeSets?.discard(projectId, featureId) ?? [];
    const deleted: string[] = [];
    for (const id of options.deleteStories) {
      const path = this.deps.storyPath?.(projectId, id);
      if (!path || !this.deps.removeFile) continue;
      await this.deps.removeFile(projectId, path);
      await this.deps.reindex(projectId, path);
      deleted.push(id);
    }
    const kept = preview.notStartedStories.filter((id) => !deleted.includes(id));
    await this.writeStatus(projectId, record, 'withdrawn');
    const parts = [
      deleted.length ? `Deleted ${deleted.join(', ')}` : '',
      kept.length ? `${deleted.length ? 'kept' : 'Kept'} ${kept.join(', ')}` : '',
    ];
    const note = parts.filter(Boolean).join('; ');
    this.recordEvent(projectId, featureId, 'withdrawn', note ? `${note}.` : null);
    return { discarded, deleted, kept };
  }

  private record(projectId: string, featureId: string): FeatureRecord {
    const record = this.deps.index.features(projectId).find((f) => f.id === featureId);
    if (!record) throw new FeatureError(`Unknown feature ${featureId}.`);
    return record;
  }

  private recordEvent(projectId: string, featureId: string, status: FeatureStatus, note: string | null): void {
    this.deps.recordEvent?.({ projectId, featureId, status, note, at: this.deps.now?.() ?? new Date().toISOString() });
  }

  private async writeStatus(projectId: string, record: FeatureRecord, status: FeatureStatus): Promise<boolean> {
    const files = this.deps.files(projectId);
    const file = await files.read(record.path);
    if (!file) return false;
    try {
      await files.writeAtomic(
        record.path,
        editFrontMatter(file.content, (doc) => doc.set('status', status)),
        { expectedHash: file.hash },
      );
    } catch {
      return false;
    }
    await this.deps.reindex(projectId, record.path);
    return true;
  }

  /** Progress of the features that are not done or withdrawn (next-step engine, US-084 AC-5). */
  progress(projectId: string): FeatureProgress[] {
    return this.deps.index
      .features(projectId)
      .map((f) => this.progressOf(projectId, f))
      .filter((p) => p.status !== 'done' && p.status !== 'withdrawn');
  }

  private progressOf(projectId: string, record: FeatureRecord): FeatureProgress {
    const { deps } = this;
    return {
      id: record.id,
      title: record.title,
      approval: record.approval,
      status: this.derived(projectId, record),
      impact: deps.impact?.(projectId, record.id) ?? 'not_started',
      requirementsDelta: deps.delta?.(projectId, record.id, 'requirements') ?? 'none',
      designDelta: deps.delta?.(projectId, record.id, 'design') ?? 'none',
      storiesDelta: deps.delta?.(projectId, record.id, 'stories') ?? 'none',
      stories: deps.index.featureStories(projectId, record.id).map((s) => ({ status: s.status, approval: s.approval ?? 'draft' })),
      epicReviewed: deps.epicReviewed?.(projectId, record.id) ?? false,
    };
  }

  /** Next free feature intent ID (AC-2). */
  nextId(projectId: string): string {
    return nextFeatureId(this.deps.index.features(projectId).map((f) => f.id));
  }

  /** Writes the derived status of every feature whose file records another one; returns the updated IDs. */
  async sync(projectId: string): Promise<string[]> {
    const updated: string[] = [];
    for (const record of this.deps.index.features(projectId)) {
      const status = this.derived(projectId, record);
      if (status === record.status) continue;
      if (!(await this.writeStatus(projectId, record, status))) continue;
      this.recordEvent(projectId, record.id, status, null);
      updated.push(record.id);
    }
    return updated;
  }

  private view(projectId: string, record: FeatureRecord): FeatureView {
    const progress = this.progressOf(projectId, record);
    const { phases, current } = featurePhases(progress);
    return {
      ...record,
      status: progress.status,
      storyCount: progress.stories.length,
      phases,
      current,
      nextStep: featureNextStep(progress)?.label ?? null,
      progress: { done: progress.stories.filter((s) => s.status === 'done').length, total: progress.stories.length },
    };
  }

  private derived(projectId: string, record: FeatureRecord): FeatureStatus {
    return featureStatus({
      approval: record.approval,
      recorded: record.status,
      linkedStories: this.deps.index.featureStories(projectId, record.id).map((s) => s.status),
      acceptedDelta: this.deps.acceptedDelta?.(projectId, record.id) ?? false,
    });
  }
}
