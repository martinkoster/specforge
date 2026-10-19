// SPDX-License-Identifier: Apache-2.0
// Adds and removes story dependencies (FR-062, FR-063): validated against the graph, written to the story front-matter.
import { DependencyGraph, type StoryDependency } from '@specforge/domain';
import { isMap, isScalar, isSeq, type Document } from 'yaml';
import type { ArtifactSource, WorkspaceIndexer } from '../indexing/workspace-indexer.js';
import { editFrontMatter } from './front-matter.js';

/** Port: workspace files that can also be written (optimistic concurrency via content hash). */
export interface ArtifactFiles extends ArtifactSource {
  writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string>;
}

/** Port: read access to indexed stories and dependencies. */
export interface DependencyIndex {
  storyIds(projectId: string): string[];
  storyPath(projectId: string, storyId: string): string | undefined;
  dependencies(projectId: string): StoryDependency[];
}

export type DependencyChange = { ok: true } | { ok: false; reason: string };

const KEY: Record<StoryDependency['type'], string> = { blocking: 'depends_on', related: 'related_to' };

function entryId(item: unknown): string | undefined {
  if (isScalar(item)) return String(item.value);
  if (isMap(item)) return String(item.get('id'));
  return undefined;
}

export class StoryDependencyService {
  constructor(
    private readonly files: ArtifactFiles,
    private readonly index: DependencyIndex,
    private readonly indexer: WorkspaceIndexer,
  ) {}

  async add(projectId: string, dependency: StoryDependency & { rationale?: string }): Promise<DependencyChange> {
    const graph = new DependencyGraph(this.index.storyIds(projectId), this.index.dependencies(projectId));
    const validation = graph.validate(dependency);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    return this.edit(projectId, dependency.from, (doc) => {
      const value =
        dependency.type === 'blocking' && dependency.rationale ? { id: dependency.to, rationale: dependency.rationale } : dependency.to;
      const key = KEY[dependency.type];
      const seq = doc.get(key, true);
      if (isSeq(seq)) seq.items.push(doc.createNode(value));
      else doc.set(key, doc.createNode([value]));
    });
  }

  async remove(projectId: string, dependency: StoryDependency): Promise<DependencyChange> {
    const exists = this.index
      .dependencies(projectId)
      .some((d) => d.from === dependency.from && d.to === dependency.to && d.type === dependency.type);
    if (!exists) return { ok: false, reason: `${dependency.from} does not depend on ${dependency.to}.` };
    return this.edit(projectId, dependency.from, (doc) => {
      const key = KEY[dependency.type];
      const seq = doc.get(key, true);
      if (!isSeq(seq)) return;
      seq.items = seq.items.filter((item) => entryId(item) !== dependency.to);
      if (seq.items.length === 0) doc.delete(key);
    });
  }

  private async edit(projectId: string, storyId: string, mutate: (doc: Document) => void): Promise<DependencyChange> {
    const path = this.index.storyPath(projectId, storyId);
    if (!path) return { ok: false, reason: `Unknown story ${storyId}.` };
    const file = await this.files.read(path);
    if (!file) return { ok: false, reason: `The file of ${storyId} no longer exists.` };
    await this.files.writeAtomic(path, editFrontMatter(file.content, mutate), { expectedHash: file.hash });
    await this.indexer.reindex(projectId, path);
    return { ok: true };
  }
}
