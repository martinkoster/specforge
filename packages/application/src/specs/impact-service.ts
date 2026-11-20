// SPDX-License-Identifier: Apache-2.0
// Feature impact (US-087, UC-044, FR-106, NFR-032): the trace-based impact list from the feature's related epics and
// requirements — specifications, work (epics, stories by state) and code areas (runs, touched files) — edited and
// approved by the user; the confirmed list scopes the delta phases. US-088: a read-only `impact` agent run adds items
// the trace graph cannot see (streamed as `IMPACT {…}` output lines and in the final result block).
import type { BoardStatus, FeatureProgress } from '@specforge/domain';
import { z } from 'zod';
import type { PermissionRunContext } from '../permissions/permission-broker.js';
import type { AgentAdapter, PermissionAnswer, PermissionAsk } from '../ports/agent-adapter.js';
import { runAgent, type AgentRun, type AgentRunDeps } from './agent-run.js';
import type { FeatureReviewRunStore } from './feature-review.js';

export type ImpactCategory =
  'requirement' | 'design' | 'adr' | 'epic' | 'story_not_started' | 'story_in_flight' | 'story_done' | 'run' | 'code_area';

export interface ImpactItemRecord {
  id: string;
  projectId: string;
  featureId: string;
  category: ImpactCategory;
  /** Element ID, story ID, run ID or workspace path. */
  targetRef: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  origin: 'trace' | 'agent' | 'user';
  confirmed: boolean;
}

export interface ImpactView {
  state: FeatureProgress['impact'];
  items: ImpactItemRecord[];
  columns: { specs: ImpactItemRecord[]; work: ImpactItemRecord[]; code: ImpactItemRecord[] };
  /** An `impact` agent run is active (US-088). */
  analysing: boolean;
}

/** The agent part of the impact analysis (US-088); absent without an agent. */
export interface ImpactAgentDeps extends Omit<AgentRunDeps, 'store' | 'permissions'> {
  adapter: AgentAdapter | undefined;
  runs: FeatureReviewRunStore;
  workspace(projectId: string): { root: string; nonGit: boolean };
  /** The feature intent file and the element index lines ("- UC-010: Task data model", stories with their state). */
  context(projectId: string, featureId: string): { featurePath: string; elements: string[] };
  permissions: { ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> };
  aiDisabledReason?(): string | null;
  /** Items changed (→ UI refresh). */
  onUpdated?(projectId: string, featureId: string): void;
}

export interface ImpactServiceDeps {
  element(projectId: string, id: string): { type: string; title: string } | undefined;
  allLinks(projectId: string): { source: string; target: string }[];
  stories(projectId: string): { id: string; status: BoardStatus; epicId: string | null }[];
  storyRuns(projectId: string, storyId: string): { runId: string; status: string }[];
  /** Files the story's runs changed (file_touch). */
  storyFiles(projectId: string, storyId: string): string[];
  store: {
    /** Replaces the trace items of the feature (user and agent items stay). */
    replaceTraceItems(projectId: string, featureId: string, items: ImpactItemRecord[]): void;
    /** Removes the unconfirmed items of one origin (a re-run replaces the earlier agent items). */
    removeOrigin(projectId: string, featureId: string, origin: ImpactItemRecord['origin']): void;
    items(projectId: string, featureId: string): ImpactItemRecord[];
    add(item: ImpactItemRecord): void;
    remove(itemId: string): void;
    confirm(projectId: string, featureId: string): void;
  };
  newId(): string;
  agent?: ImpactAgentDeps;
}

const CATEGORIES = [
  'requirement',
  'design',
  'adr',
  'epic',
  'story_not_started',
  'story_in_flight',
  'story_done',
  'run',
  'code_area',
] as const;
const AgentItem = z.object({
  category: z.enum(CATEGORIES),
  targetRef: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().min(1),
});
type AgentItem = z.infer<typeof AgentItem>;

/** One streamed agent item: a line `IMPACT {"category":…,"targetRef":…,"confidence":…,"reason":…}`. */
export function parseImpactLine(line: string): AgentItem | null {
  if (!line.startsWith('IMPACT ')) return null;
  try {
    const parsed = AgentItem.safeParse(JSON.parse(line.slice('IMPACT '.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseFinalItems(resultText: string): AgentItem[] {
  const last = [...resultText.matchAll(/```specforge-result\s*\n([\s\S]*?)```/g)].at(-1)?.[1];
  if (!last) return [];
  try {
    const parsed = z.object({ items: z.array(AgentItem) }).safeParse(JSON.parse(last));
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

const AGENT_FORMAT = [
  'Do not change any file. Report each impact item as soon as you find it on its own output line:',
  'IMPACT {"category":"requirement|design|adr|epic|story_not_started|story_in_flight|story_done|code_area","targetRef":"FR-012 or src/path.ts","confidence":"high|medium|low","reason":"why"}',
  'Finally repeat all items in a fenced block: ```specforge-result {"items":[…]} ```',
].join('\n');

export class ImpactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpactError';
  }
}

const SPECS: ReadonlySet<ImpactCategory> = new Set(['requirement', 'design', 'adr']);
const CODE: ReadonlySet<ImpactCategory> = new Set(['run', 'code_area']);
const ELEMENT_ID = /^[A-Z]+-\d+$/;

function storyCategory(status: BoardStatus): ImpactCategory {
  if (status === 'done') return 'story_done';
  return status === 'in_progress' || status === 'review' ? 'story_in_flight' : 'story_not_started';
}

export class ImpactService {
  /** Active `impact` runs per project/feature (US-088). */
  private readonly running = new Map<string, AgentRun>();

  constructor(private readonly deps: ImpactServiceDeps) {}

  /** AC-1: everything reachable downstream from the feature's related epics and requirements. */
  trace(projectId: string, featureId: string): ImpactItemRecord[] {
    const { deps } = this;
    const links = deps.allLinks(projectId);
    const sources = new Map<string, string[]>();
    for (const l of links) sources.set(l.target, [...(sources.get(l.target) ?? []), l.source]);
    const stories = new Map(deps.stories(projectId).map((s) => [s.id, s]));
    const byEpic = new Map<string, string[]>();
    for (const s of stories.values()) if (s.epicId) byEpic.set(s.epicId, [...(byEpic.get(s.epicId) ?? []), s.id]);

    const items: ImpactItemRecord[] = [];
    const seen = new Set<string>([featureId]);
    const item = (category: ImpactCategory, targetRef: string, reason: string) =>
      items.push({
        id: deps.newId(),
        projectId,
        featureId,
        category,
        targetRef,
        reason,
        confidence: 'high',
        origin: 'trace',
        confirmed: false,
      });
    const categoryOf = (id: string): ImpactCategory | undefined => {
      const story = stories.get(id);
      if (story) return storyCategory(story.status);
      const type = deps.element(projectId, id)?.type;
      if (!type || type === 'feature_intent' || type === 'idea') return undefined;
      if (type === 'fr' || type === 'nfr' || type === 'con') return 'requirement';
      if (type === 'adr') return 'adr';
      if (type === 'epic') return 'epic';
      return type === 'story' ? 'story_not_started' : 'design';
    };

    const queue: string[] = [];
    const visit = (id: string, reason: string) => {
      if (seen.has(id)) return;
      const category = categoryOf(id);
      if (!category) return;
      seen.add(id);
      item(category, id, reason);
      queue.push(id);
    };
    for (const l of links) {
      if (l.source !== featureId) continue;
      if (/^EP-/.test(l.target)) visit(l.target, `Related epic of ${featureId}`);
      else if (/^(FR|NFR|CON)-/.test(l.target)) visit(l.target, `Related requirement of ${featureId}`);
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      for (const source of sources.get(id) ?? []) visit(source, `References ${id}`);
      for (const story of byEpic.get(id) ?? []) visit(story, `Belongs to ${id}`);
    }

    // Code areas: the runs and touched files of the reached stories.
    const files = new Set<string>();
    for (const reached of items.filter((i) => stories.has(i.targetRef)).map((i) => i.targetRef)) {
      for (const run of deps.storyRuns(projectId, reached)) item('run', run.runId, `Run of ${reached} (${run.status})`);
      for (const path of deps.storyFiles(projectId, reached)) {
        if (files.has(path)) continue;
        files.add(path);
        item('code_area', path, `Changed by ${reached}`);
      }
    }
    return items;
  }

  state(projectId: string, featureId: string): FeatureProgress['impact'] {
    const items = this.deps.store.items(projectId, featureId);
    if (items.some((i) => i.confirmed)) return 'confirmed';
    if (this.running.has(`${projectId}:${featureId}`)) return 'analysing';
    return items.length === 0 ? 'not_started' : 'proposed';
  }

  /** US-088 AC-1: the read-only `impact` run; trace items stay usable meanwhile. */
  async analyse(projectId: string, featureId: string): Promise<{ ok: true; runId: string } | { ok: false; reason: string }> {
    const agent = this.deps.agent;
    const disabled = agent?.aiDisabledReason?.() ?? null;
    if (disabled) return { ok: false, reason: disabled };
    if (!agent?.adapter) return { ok: false, reason: 'No agent adapter is available for the impact analysis.' };
    const key = `${projectId}:${featureId}`;
    if (this.running.has(key)) return { ok: false, reason: 'The impact analysis is still running.' };
    if (this.state(projectId, featureId) === 'confirmed') return { ok: false, reason: `The impact of ${featureId} is already approved.` };
    this.deps.store.removeOrigin(projectId, featureId, 'agent');
    const ctx = agent.context(projectId, featureId);
    const known = this.deps.store.items(projectId, featureId).map((i) => `- ${i.targetRef}: ${i.reason}`);
    const prompt = [
      `Analyse the impact of the feature intent ${ctx.featurePath} on the existing specifications and code.`,
      'Already found from the trace links:',
      ...(known.length ? known : ['- (none)']),
      'Specification elements and stories:',
      ...ctx.elements,
      'Read the specifications and the code; add what the trace links miss: requirements to change, deprecate or add, design elements and ADRs, epics to extend, affected stories (Done stories are rework candidates) and code areas.',
      AGENT_FORMAT,
    ].join('\n');
    const space = agent.workspace(projectId);
    const runId = agent.runs.createRun(projectId, {
      storyId: null,
      kind: 'impact',
      startKind: null,
      trigger: `ImpactAnalysis ${featureId}`,
    });
    agent.runs.setRunStatus(runId, 'running');
    const run = runAgent(
      agent.adapter,
      {
        ...agent,
        store: agent.runs,
        emit: (id, event, seq) => {
          agent.emit?.(id, event, seq);
          if (event.type !== 'output') return;
          for (const line of event.text.split('\n')) {
            const item = parseImpactLine(line.trim());
            if (item) this.addAgentItem(projectId, featureId, item);
          }
        },
      },
      { runId, projectId, kind: 'impact', cwd: space.root, nonGit: space.nonGit, prompt, readOnly: true },
    );
    this.running.set(key, run);
    agent.onUpdated?.(projectId, featureId);
    void run.done
      .then((outcome) => {
        if (outcome.status === 'completed')
          for (const item of parseFinalItems(outcome.resultText)) this.addAgentItem(projectId, featureId, item);
        agent.runs.setRunStatus(runId, outcome.status, outcome.status === 'failed' ? outcome.reason : undefined);
      })
      .catch((e: unknown) => agent.runs.setRunStatus(runId, 'failed', e instanceof Error ? e.message : String(e)))
      .finally(() => {
        this.running.delete(key);
        agent.onUpdated?.(projectId, featureId);
      });
    return { ok: true, runId };
  }

  /** US-088 AC-3: cancels the impact run; the items found so far stay. */
  async cancel(projectId: string, featureId: string): Promise<void> {
    await this.running.get(`${projectId}:${featureId}`)?.cancel();
  }

  /** Duplicates of existing items are merged into the existing item (the trace confidence stays). */
  private addAgentItem(projectId: string, featureId: string, item: AgentItem): void {
    if (this.deps.store.items(projectId, featureId).some((i) => i.targetRef === item.targetRef)) return;
    this.deps.store.add({ id: this.deps.newId(), projectId, featureId, ...item, origin: 'agent', confirmed: false });
    this.deps.agent?.onUpdated?.(projectId, featureId);
  }

  view(projectId: string, featureId: string): ImpactView {
    const items = this.deps.store.items(projectId, featureId);
    return {
      state: this.state(projectId, featureId),
      analysing: this.running.has(`${projectId}:${featureId}`),
      items,
      columns: {
        specs: items.filter((i) => SPECS.has(i.category)),
        work: items.filter((i) => !SPECS.has(i.category) && !CODE.has(i.category)),
        code: items.filter((i) => CODE.has(i.category)),
      },
    };
  }

  /** Proposes the trace items (user additions stay); refused once the list is approved. */
  propose(projectId: string, featureId: string): ImpactView {
    if (this.state(projectId, featureId) === 'confirmed') throw new ImpactError(`The impact of ${featureId} is already approved.`);
    const kept = new Set(
      this.deps.store
        .items(projectId, featureId)
        .filter((i) => i.origin !== 'trace')
        .map((i) => i.targetRef),
    );
    this.deps.store.replaceTraceItems(
      projectId,
      featureId,
      this.trace(projectId, featureId).filter((i) => !kept.has(i.targetRef)),
    );
    return this.view(projectId, featureId);
  }

  /** AC-2: adds an element, story or workspace path. */
  add(projectId: string, featureId: string, ref: string): ImpactItemRecord {
    const target = ref.trim();
    if (target === '') throw new ImpactError('Enter an element or story ID or a path.');
    let category: ImpactCategory = 'code_area';
    if (ELEMENT_ID.test(target)) {
      const story = this.deps.stories(projectId).find((s) => s.id === target);
      const type = this.deps.element(projectId, target)?.type;
      if (!story && !type) throw new ImpactError(`${target} does not exist.`);
      category = story
        ? storyCategory(story.status)
        : type === 'fr' || type === 'nfr' || type === 'con'
          ? 'requirement'
          : type === 'adr'
            ? 'adr'
            : type === 'epic'
              ? 'epic'
              : 'design';
    }
    const item: ImpactItemRecord = {
      id: this.deps.newId(),
      projectId,
      featureId,
      category,
      targetRef: target,
      reason: 'Added by you',
      confidence: 'high',
      origin: 'user',
      confirmed: false,
    };
    this.deps.store.add(item);
    return item;
  }

  remove(_projectId: string, itemId: string): void {
    this.deps.store.remove(itemId);
  }

  /** AC-3: *Approve impact*. */
  approve(projectId: string, featureId: string): ImpactView {
    if (this.deps.store.items(projectId, featureId).length === 0) throw new ImpactError('Keep at least one impact item before approving.');
    this.deps.store.confirm(projectId, featureId);
    return this.view(projectId, featureId);
  }

  /** AC-4: the confirmed list as the scope of the delta generation. */
  scope(projectId: string, featureId: string): string[] {
    return this.deps.store
      .items(projectId, featureId)
      .filter((i) => i.confirmed)
      .map((i) => i.targetRef);
  }
}
