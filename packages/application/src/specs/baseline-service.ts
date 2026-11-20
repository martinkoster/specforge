// SPDX-License-Identifier: Apache-2.0
// Spec baselines (US-096, FR-112, UC-048): an annotated Git tag (`spec-vX.Y`, editable) on the base-branch commit with
// notes listing the feature intents and epics completed since the previous baseline; indexed in `baseline`; artifacts
// can be compared with a baseline. Git mode only; uncommitted spec changes are committed first (FR-072).
import type { FeatureStatus } from '@specforge/domain';
import type { ArtifactFiles } from '../stories/dependency-service.js';

export interface BaselineRecord {
  projectId: string;
  tag: string;
  commit: string;
  createdAt: string;
  featureIds: string[];
  epicIds: string[];
  notes: string;
}

export interface BaselineOffer {
  /** Baselines need git mode (AC-4). */
  available: boolean;
  reason: string | null;
  /** Uncommitted specification files: *Commit spec changes* first (AC-2). */
  uncommitted: string[];
  nextTag: string;
  /** Done feature intents not included in a previous baseline, and their epics. */
  features: { id: string; title: string }[];
  epics: { id: string; title: string }[];
}

export interface BaselineServiceDeps {
  vcsMode(projectId: string): 'git' | 'none';
  /** The project's base branch (the tag goes on its commit); null = the current HEAD. */
  baseBranch(projectId: string): Promise<string | null> | string | null;
  uncommittedSpecFiles(projectId: string): Promise<string[]>;
  git: {
    create(projectId: string, input: { tag: string; ref: string; notes: string }): Promise<{ commit: string }>;
    fileAt(projectId: string, tag: string, path: string): Promise<string | null>;
  };
  store: { save(record: BaselineRecord): void; list(projectId: string): BaselineRecord[] };
  /** Feature intents with their derived status. */
  features(projectId: string): { id: string; title: string; status: FeatureStatus }[];
  epics(projectId: string): { id: string; title: string; featureId: string | null }[];
  files(projectId: string): Pick<ArtifactFiles, 'read'>;
  now(): string;
}

export class BaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaselineError';
  }
}

const NO_GIT = 'Spec baselines are Git tags — this project has no Git repository.';
const VERSION = /^spec-v(\d+)\.(\d+)$/;

/** The next `spec-vX.Y` after the highest existing one (minor + 1); the first baseline is `spec-v1.0`. */
export function nextBaselineTag(existing: readonly string[]): string {
  let best: [number, number] | null = null;
  for (const tag of existing) {
    const m = VERSION.exec(tag);
    if (!m) continue;
    const v: [number, number] = [Number(m[1]), Number(m[2])];
    if (!best || v[0] > best[0] || (v[0] === best[0] && v[1] > best[1])) best = v;
  }
  return best ? `spec-v${best[0]}.${best[1] + 1}` : 'spec-v1.0';
}

export class BaselineService {
  constructor(private readonly deps: BaselineServiceDeps) {}

  list(projectId: string): BaselineRecord[] {
    return this.deps.store.list(projectId);
  }

  /** AC-1/AC-2: the proposed tag and notes, or why a baseline is not possible now. */
  async offer(projectId: string): Promise<BaselineOffer> {
    const { features, epics } = this.included(projectId);
    const nextTag = nextBaselineTag(this.list(projectId).map((b) => b.tag));
    if (this.deps.vcsMode(projectId) !== 'git') return { available: false, reason: NO_GIT, uncommitted: [], nextTag, features, epics };
    return { available: true, reason: null, uncommitted: await this.deps.uncommittedSpecFiles(projectId), nextTag, features, epics };
  }

  /** AC-2: creates the annotated tag on the base branch and indexes it. */
  async create(projectId: string, tag: string): Promise<BaselineRecord> {
    if (this.deps.vcsMode(projectId) !== 'git') throw new BaselineError(NO_GIT);
    const uncommitted = await this.deps.uncommittedSpecFiles(projectId);
    if (uncommitted.length > 0) throw new BaselineError(`Commit spec changes first: ${uncommitted.join(', ')}.`);
    const name = tag.trim();
    if (this.list(projectId).some((b) => b.tag === name)) throw new BaselineError(`The baseline ${name} exists already.`);
    const { features, epics } = this.included(projectId);
    const notes = [
      `Spec baseline ${name}`,
      '',
      ...(features.length === 0
        ? ['No new feature intents since the previous baseline.']
        : [
            'Feature intents:',
            ...features.map((f) => `- ${f.id} ${f.title}`),
            ...(epics.length ? ['', 'Epics:', ...epics.map((e) => `- ${e.id} ${e.title}`)] : []),
          ]),
    ].join('\n');
    let commit: string;
    try {
      const ref = (await this.deps.baseBranch(projectId)) ?? 'HEAD';
      ({ commit } = await this.deps.git.create(projectId, { tag: name, ref, notes }));
    } catch (e) {
      throw new BaselineError(e instanceof Error ? e.message : String(e));
    }
    const record: BaselineRecord = {
      projectId,
      tag: name,
      commit,
      createdAt: this.deps.now(),
      featureIds: features.map((f) => f.id),
      epicIds: epics.map((e) => e.id),
      notes,
    };
    this.deps.store.save(record);
    return record;
  }

  /** AC-3: the file at the baseline and its current content (null where it does not exist). */
  async compare(projectId: string, tag: string, path: string): Promise<{ before: string | null; after: string | null }> {
    if (!this.list(projectId).some((b) => b.tag === tag)) throw new BaselineError(`Unknown baseline ${tag}.`);
    const before = await this.deps.git.fileAt(projectId, tag, path);
    const after = (await this.deps.files(projectId).read(path))?.content ?? null;
    return { before, after };
  }

  private included(projectId: string): Pick<BaselineOffer, 'features' | 'epics'> {
    const baselined = new Set(this.list(projectId).flatMap((b) => b.featureIds));
    const features = this.deps
      .features(projectId)
      .filter((f) => f.status === 'done' && !baselined.has(f.id))
      .map((f) => ({ id: f.id, title: f.title }));
    const ids = new Set(features.map((f) => f.id));
    const epics = this.deps
      .epics(projectId)
      .filter((e) => e.featureId !== null && ids.has(e.featureId))
      .map((e) => ({ id: e.id, title: e.title }));
    return { features, epics };
  }
}
