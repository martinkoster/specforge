// SPDX-License-Identifier: Apache-2.0
// Delta generation (US-089, UC-045, FR-107, ADR-021): a `generate` run writes into the target spec folder, which is
// snapshotted first; SpecForge splits the changes per element into a change set, restores the folder and lets the user
// accept or discard each item; US-090 applies the accepted items per file with optimistic concurrency, feature links and
// a changelog entry. Impact flagging is suppressed for the folder while the run's temporary changes are on disk.
import type { AgentAdapter, PermissionAnswer, PermissionAsk } from '../ports/agent-adapter.js';
import type { PermissionRunContext } from '../permissions/permission-broker.js';
import { specLayout } from '@specforge/domain';
import { runAgent, type AgentRunDeps } from './agent-run.js';
import { elementSections, nextFreeIds, splitDelta, type DeltaItem } from './delta.js';
import type { FeatureReviewRunStore } from './feature-review.js';
import type { SpecSnapshots } from './spec-run-service.js';

export type DeltaPhase = 'requirements' | 'design';

export interface ChangeSetRecord {
  id: string;
  projectId: string;
  featureId: string;
  phase: DeltaPhase;
  runId: string;
  state: 'running' | 'open' | 'failed' | 'discarded' | 'applied';
  reason: string | null;
  createdAt: string;
}

export interface ChangeItemRecord extends DeltaItem {
  id: string;
  changeSetId: string;
  state: 'open' | 'accepted' | 'discarded' | 'applied';
}

export interface ChangeSetView extends ChangeSetRecord {
  items: ChangeItemRecord[];
}

export interface DeltaServiceDeps extends Omit<AgentRunDeps, 'store' | 'permissions'> {
  store: {
    saveSet(set: ChangeSetRecord): void;
    set(id: string): ChangeSetRecord | undefined;
    latest(projectId: string, featureId: string, phase: DeltaPhase): ChangeSetRecord | undefined;
    saveItems(items: ChangeItemRecord[]): void;
    items(changeSetId: string): ChangeItemRecord[];
    item(id: string): ChangeItemRecord | undefined;
    setItemState(id: string, state: ChangeItemRecord['state']): void;
  };
  adapter: AgentAdapter | undefined;
  runs: FeatureReviewRunStore;
  workspace(projectId: string): { root: string; nonGit: boolean; specRoot: string };
  /** The confirmed impact items (US-087). */
  scope(projectId: string, featureId: string): { targetRef: string; reason: string }[];
  featurePath(projectId: string, featureId: string): string;
  /** All indexed elements with their artifact and title. */
  elements(projectId: string): { id: string; path: string; title: string }[];
  /** Artifacts below a folder. */
  folderFiles(projectId: string, folder: string): string[];
  files(projectId: string): {
    read(path: string): Promise<{ content: string; hash: string } | undefined>;
    writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string>;
  };
  /** Changed artifacts need a new approval (Draft, `generated_by`) — US-090 AC-3. */
  markDraft(projectId: string, paths: readonly string[], runId: string): Promise<void>;
  artifactApproval(projectId: string, path: string): 'draft' | 'approved' | undefined;
  /** US-091: in-flight protection — stories reached from the changed elements, decisions and their effects. */
  inFlight?: {
    links(projectId: string): { source: string; target: string }[];
    stories(projectId: string): { id: string; title: string; status: string; subState: string }[];
    save(decision: InFlightDecisionRecord): void;
    /** *Continue unchanged*: the story is flagged *Potentially impacted*. */
    flag(projectId: string, storyId: string, sourceRef: string, reason: string): void;
    /** *Cancel / dequeue*: the story returns to Ready (its run is cancelled or it leaves the queue). */
    moveToReady(projectId: string, storyId: string): Promise<void>;
  };
  snapshots: SpecSnapshots;
  reindex(projectId: string, path: string): Promise<unknown>;
  /** Impact flagging off/on for a folder while a delta run's temporary changes are on disk. */
  suppress(projectId: string, folder: string, active: boolean): void;
  permissions: { ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> };
  aiDisabledReason?(): string | null;
  onUpdated?(projectId: string, featureId: string): void;
  newId(): string;
}

export type InFlightChoice = 'continue' | 'cancel' | 'apply_in_corrections';

/** A story in flight that an accepted change reaches (US-091). */
export interface AffectedStory {
  storyId: string;
  title: string;
  status: string;
  subState: string;
  /** The accepted changes that reach the story, e.g. "changed FR-034". */
  changes: string[];
}

export interface InFlightDecisionRecord {
  id: string;
  projectId: string;
  storyId: string;
  featureId: string;
  changeSetId: string;
  decision: InFlightChoice;
  /** *Apply in corrections*: pre-filled into *Request corrections* when the story is — or reaches — Review. */
  pendingFeedback: string | null;
  decidedAt: string;
}

const IN_FLIGHT: ReadonlySet<string> = new Set(['in_progress', 'review']);
const changeLabel = (i: ChangeItemRecord) =>
  `${i.kind === 'new' ? 'new' : i.kind === 'deprecated' ? 'deprecated' : 'changed'} ${i.elementId}`;

export class DeltaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeltaError';
  }
}

const PREFIXES: Record<DeltaPhase, readonly string[]> = { requirements: ['FR', 'NFR', 'CON'], design: ['UC', 'BP', 'UF', 'ADR'] };

export class DeltaService {
  private readonly active = new Set<Promise<void>>();

  constructor(private readonly deps: DeltaServiceDeps) {}

  view(projectId: string, featureId: string, phase: DeltaPhase): ChangeSetView | undefined {
    const set = this.deps.store.latest(projectId, featureId, phase);
    return set ? { ...set, items: this.deps.store.items(set.id) } : undefined;
  }

  /**
   * Phase state for the feature stepper (US-084): none, open (change set in review, or applied artifacts not approved
   * again yet — US-090 AC-4), or applied.
   */
  state(projectId: string, featureId: string, phase: DeltaPhase): 'none' | 'open' | 'applied' {
    const set = this.deps.store.latest(projectId, featureId, phase);
    if (set?.state === 'applied') {
      const paths = new Set(
        this.deps.store
          .items(set.id)
          .filter((i) => i.state === 'applied')
          .map((i) => i.path),
      );
      return [...paths].some((p) => this.deps.artifactApproval(projectId, p) === 'draft') ? 'open' : 'applied';
    }
    return set?.state === 'open' || set?.state === 'running' ? 'open' : 'none';
  }

  /** A delta of the feature was applied (→ feature *In delivery*, FR-104). */
  acceptedDelta(projectId: string, featureId: string): boolean {
    return (['requirements', 'design'] as const).some((phase) => this.deps.store.latest(projectId, featureId, phase)?.state === 'applied');
  }

  /**
   * US-090: writes the accepted items per file. A file whose affected sections changed since the generation is a conflict
   * and nothing of it is applied (optimistic concurrency); new elements carry `**Feature**: FI-x`, changed ones
   * `Changed by FI-x.`; each file gets a changelog entry; changed artifacts become Draft and are re-indexed (impact flags).
   */
  async apply(
    changeSetId: string,
    decisions: Readonly<Record<string, InFlightChoice>> = {},
  ): Promise<{ applied: string[]; conflicts: string[] } | { needsDecision: AffectedStory[] }> {
    const { deps } = this;
    const set = deps.store.set(changeSetId);
    if (!set) throw new DeltaError(`Unknown change set ${changeSetId}.`);
    if (set.state !== 'open') throw new DeltaError(`The change set is not open (${set.state}).`);
    const items = deps.store.items(changeSetId);
    if (items.some((i) => i.state === 'open')) throw new DeltaError('Accept or discard every change before applying.');
    const accepted = items.filter((i) => i.state === 'accepted');
    // US-091 AC-1: every affected in-flight story needs a decision before anything is applied.
    const affected = this.affected(set.projectId, accepted);
    if (affected.some((a) => decisions[a.storyId] === undefined)) return { needsDecision: affected };
    const files = deps.files(set.projectId);
    const applied: string[] = [];
    const conflicts: string[] = [];
    for (const path of [...new Set(accepted.map((i) => i.path))]) {
      const fileItems = accepted.filter((i) => i.path === path);
      const current = await files.read(path);
      const content = applyItems(current?.content ?? null, fileItems, set.featureId, deps.now().slice(0, 10));
      if (content === null) {
        conflicts.push(path);
        continue;
      }
      try {
        await files.writeAtomic(path, content, { expectedHash: current?.hash ?? null });
      } catch {
        conflicts.push(path);
        continue;
      }
      await deps.reindex(set.projectId, path);
      for (const item of fileItems) deps.store.setItemState(item.id, 'applied');
      applied.push(path);
    }
    if (applied.length > 0) await deps.markDraft(set.projectId, applied, set.runId);
    if (applied.length > 0) await this.decide91(set, affected, decisions);
    deps.store.saveSet(
      conflicts.length === 0
        ? { ...set, state: 'applied', reason: null }
        : {
            ...set,
            reason: `Changed since the generation — not applied: ${conflicts.join(', ')}. Discard the change set and generate again.`,
          },
    );
    deps.onUpdated?.(set.projectId, set.featureId);
    return { applied, conflicts };
  }

  /** AC-1: *Generate delta*. */
  async generate(
    projectId: string,
    featureId: string,
    phase: DeltaPhase,
  ): Promise<{ ok: true; runId: string } | { ok: false; reason: string }> {
    const { deps } = this;
    const disabled = deps.aiDisabledReason?.() ?? null;
    if (disabled) return { ok: false, reason: disabled };
    if (!deps.adapter) return { ok: false, reason: 'No agent adapter is available for the delta generation.' };
    const scope = deps.scope(projectId, featureId);
    if (scope.length === 0) return { ok: false, reason: `Approve the impact of ${featureId} first; it scopes the delta.` };
    const latest = deps.store.latest(projectId, featureId, phase);
    if (latest && (latest.state === 'running' || latest.state === 'open')) {
      return { ok: false, reason: `A ${phase} change set of ${featureId} is still open — accept or discard its items first.` };
    }
    const space = deps.workspace(projectId);
    const folder = specLayout(space.specRoot).folders[phase];
    const elements = deps.elements(projectId);
    const byId = new Map(elements.map((e) => [e.id, e]));
    const before = new Map<string, string>();
    for (const path of deps.folderFiles(projectId, folder)) {
      const file = await deps.files(projectId).read(path);
      if (file) before.set(path, file.content);
    }
    const next = nextFreeIds(
      elements.map((e) => e.id),
      PREFIXES[phase],
    );
    const snapshotId = await deps.snapshots.capture(projectId, folder);
    deps.suppress(projectId, folder, true);
    const runId = deps.runs.createRun(projectId, {
      storyId: null,
      kind: 'generate',
      startKind: null,
      trigger: `FeatureDelta ${featureId} ${phase}`,
    });
    deps.runs.setRunStatus(runId, 'running');
    const set: ChangeSetRecord = {
      id: deps.newId(),
      projectId,
      featureId,
      phase,
      runId,
      state: 'running',
      reason: null,
      createdAt: deps.now(),
    };
    deps.store.saveSet(set);
    deps.onUpdated?.(projectId, featureId);

    const prompt = [
      `Generate the delta ${phase} for the feature intent ${deps.featurePath(projectId, featureId)} (${featureId}).`,
      'Scope — the confirmed impact; change only these elements unless a new element is needed:',
      ...scope.map((s) => {
        const e = byId.get(s.targetRef);
        return `- ${s.targetRef}${e ? ` "${e.title}" (${e.path})` : ''}: ${s.reason}`;
      }),
      `Next free IDs: ${Object.values(next).join(', ')}.`,
      `New elements use the next free IDs and carry a line "**Feature**: ${featureId}".`,
      `Change existing elements in place and add a line "Changed by ${featureId}: <what changed>".`,
      'Deprecate instead of deleting: put "[DEPRECATED] <reason>" into the heading. Never delete or renumber elements or files.',
      ...(phase === 'design' ? ['New architecture decisions: "### ADR-0xx: Title" with "**Status**: Proposed".'] : []),
      'Update changelogs or summary tables of the changed documents with an entry referencing the feature.',
      `Write only files inside ${folder}/ (other writes and shell commands are denied).`,
      'SpecForge turns your changes into a change set the user reviews item by item.',
    ].join('\n');
    const run = runAgent(
      deps.adapter,
      { ...deps, store: deps.runs },
      {
        runId,
        projectId,
        kind: 'generate',
        cwd: space.root,
        nonGit: space.nonGit,
        prompt,
        writeScope: folder,
      },
    );
    const done = run.done
      .then(async (outcome) => {
        const changed = await deps.snapshots.changes(projectId, folder, snapshotId).catch(() => []);
        const items: ChangeItemRecord[] = [];
        const issues: string[] = [];
        if (outcome.status === 'completed') {
          for (const change of changed) {
            const after = change.change === 'D' ? null : ((await deps.files(projectId).read(change.path))?.content ?? null);
            const elsewhere = elements.filter((e) => e.path !== change.path).map((e) => e.id);
            const split = splitDelta({ path: change.path, before: before.get(change.path) ?? null, after, existingIds: elsewhere });
            issues.push(...split.issues);
            items.push(...split.items.map((i) => ({ ...i, id: deps.newId(), changeSetId: set.id, state: 'open' as const })));
          }
        }
        await deps.snapshots.restore(projectId, folder, snapshotId);
        for (const change of changed) await deps.reindex(projectId, change.path);
        deps.suppress(projectId, folder, false);
        const reason =
          outcome.status === 'failed'
            ? outcome.reason
            : outcome.status === 'cancelled'
              ? 'The delta generation was cancelled.'
              : issues.length > 0
                ? issues.join(' ')
                : items.length === 0
                  ? 'The agent proposed no changes.'
                  : null;
        if (reason === null) deps.store.saveItems(items);
        deps.store.saveSet({ ...set, state: reason === null ? 'open' : 'failed', reason });
        deps.runs.setRunStatus(runId, outcome.status === 'completed' ? 'completed' : outcome.status, reason ?? undefined);
      })
      .catch(async (e: unknown) => {
        deps.suppress(projectId, folder, false);
        deps.store.saveSet({ ...set, state: 'failed', reason: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        this.active.delete(done);
        deps.onUpdated?.(projectId, featureId);
      });
    this.active.add(done);
    return { ok: true, runId };
  }

  /** AC-3: *Accept* / *Discard* one item; discarding every item closes the change set (AC-5). */
  decide(itemId: string, decision: 'accept' | 'discard'): ChangeSetView {
    const item = this.deps.store.item(itemId);
    if (!item) throw new DeltaError(`Unknown change ${itemId}.`);
    this.deps.store.setItemState(itemId, decision === 'accept' ? 'accepted' : 'discarded');
    return this.afterDecision(item.changeSetId);
  }

  /** *Accept all*. */
  acceptAll(changeSetId: string): ChangeSetView {
    for (const item of this.deps.store.items(changeSetId)) if (item.state === 'open') this.deps.store.setItemState(item.id, 'accepted');
    return this.afterDecision(changeSetId);
  }

  /** Stories in flight (queued, running, in Review) reached downstream from the accepted elements (US-091). */
  private affected(projectId: string, accepted: readonly ChangeItemRecord[]): AffectedStory[] {
    const inFlight = this.deps.inFlight;
    if (!inFlight) return [];
    const sources = new Map<string, string[]>();
    for (const l of inFlight.links(projectId)) sources.set(l.target, [...(sources.get(l.target) ?? []), l.source]);
    const stories = new Map(inFlight.stories(projectId).map((s) => [s.id, s]));
    const reached = new Map<string, Set<string>>();
    for (const item of accepted.filter((i) => i.elementId !== null)) {
      const seen = new Set<string>([item.elementId!]);
      const queue = [item.elementId!];
      for (let i = 0; i < queue.length; i++) {
        for (const source of sources.get(queue[i]!) ?? []) {
          if (seen.has(source)) continue;
          seen.add(source);
          queue.push(source);
          const story = stories.get(source);
          if (story && IN_FLIGHT.has(story.status)) reached.set(source, (reached.get(source) ?? new Set()).add(changeLabel(item)));
        }
      }
    }
    return [...reached]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, changes]) => {
        const s = stories.get(id)!;
        return { storyId: id, title: s.title, status: s.status, subState: s.subState, changes: [...changes] };
      });
  }

  /** Records and carries out the in-flight decisions (US-091 AC-2..AC-5). */
  private async decide91(set: ChangeSetRecord, affected: readonly AffectedStory[], decisions: Readonly<Record<string, InFlightChoice>>) {
    const inFlight = this.deps.inFlight;
    if (!inFlight) return;
    for (const story of affected) {
      const decision = decisions[story.storyId]!;
      const summary = story.changes.join(', ');
      if (decision === 'continue') {
        inFlight.flag(
          set.projectId,
          story.storyId,
          set.featureId,
          `${set.featureId} ${summary} while ${story.storyId} was in flight (decision: continue unchanged).`,
        );
      } else if (decision === 'cancel') {
        await inFlight.moveToReady(set.projectId, story.storyId);
      }
      inFlight.save({
        id: this.deps.newId(),
        projectId: set.projectId,
        storyId: story.storyId,
        featureId: set.featureId,
        changeSetId: set.id,
        decision,
        pendingFeedback:
          decision === 'apply_in_corrections'
            ? `${set.featureId} changed the specifications: ${summary}. Update the implementation of ${story.storyId} accordingly.`
            : null,
        decidedAt: this.deps.now(),
      });
    }
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.active]);
  }

  private afterDecision(changeSetId: string): ChangeSetView {
    const set = this.deps.store.set(changeSetId);
    if (!set) throw new DeltaError(`Unknown change set ${changeSetId}.`);
    const items = this.deps.store.items(changeSetId);
    const closed = items.length > 0 && items.every((i) => i.state === 'discarded') ? { ...set, state: 'discarded' as const } : set;
    if (closed !== set) this.deps.store.saveSet(closed);
    this.deps.onUpdated?.(set.projectId, set.featureId);
    return { ...closed, items };
  }
}

/** Adds a line right after the heading of a section unless the section already contains `marker`. */
function withLine(section: string, marker: RegExp, line: string): string {
  if (marker.test(section)) return section;
  const [heading, ...rest] = section.split('\n');
  return [heading, line, ...rest].join('\n');
}

/**
 * The file content with the accepted items applied, or null on a conflict: a section that is not as it was when the
 * change set was generated, an element that exists already, or an existing file for a new file.
 */
function applyItems(current: string | null, items: readonly ChangeItemRecord[], featureId: string, date: string): string | null {
  const fileItem = items.find((i) => i.elementId === null);
  let content: string;
  if (current === null) {
    if (fileItem?.kind !== 'new') return null;
    content = fileItem.after;
  } else {
    if (fileItem?.kind === 'new') return null;
    content = current.replace(/\r\n/g, '\n');
  }
  const feature = new RegExp(`\\*\\*Feature\\*\\*:\\s*${featureId}\\b`);
  const changed = new RegExp(`Changed by ${featureId}\\b`);
  const summary: string[] = [];
  for (const item of items) {
    const { preamble, sections } = elementSections(content);
    if (item.elementId === null) {
      if (item.kind === 'new') continue;
      if (preamble !== item.before) return null;
      content = content.replace(preamble.replace(/\n$/, ''), item.after.replace(/\n$/, ''));
      continue;
    }
    if (item.kind === 'new') {
      if (sections.has(item.elementId)) return null;
      content = `${content.replace(/\n*$/, '\n')}${withLine(item.after, feature, `**Feature**: ${featureId}`)}`;
      summary.push(`new ${item.elementId}`);
      continue;
    }
    const section = sections.get(item.elementId);
    if (section === undefined || section !== item.before) return null;
    const next = withLine(item.after, changed, `Changed by ${featureId}.`);
    content = content.replace(section.replace(/\n$/, ''), next.replace(/\n$/, ''));
    summary.push(`${item.kind === 'deprecated' ? 'deprecated' : 'changed'} ${item.elementId}`);
  }
  if (summary.length === 0) return content;
  const entry = `- ${date}: ${featureId} — ${summary.join('; ')}`;
  const trimmed = content.replace(/\n*$/, '');
  return /\n## Changelog\n/.test(`\n${trimmed}`) ? `${trimmed}\n${entry}\n` : `${trimmed}\n\n## Changelog\n${entry}\n`;
}
