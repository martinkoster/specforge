// SPDX-License-Identifier: Apache-2.0
// Keeps the database index consistent with the workspace artifacts (ADR-004, FR-016, FR-018).
import { ArtifactParseError, parseArtifact, type ParsedArtifact } from './parse-artifact.js';

/** Port: workspace files (main workspace only, FR-116a). */
export interface ArtifactSource {
  /** Relative POSIX paths of all indexable artifacts. */
  list(): Promise<string[]>;
  read(path: string): Promise<{ content: string; hash: string } | undefined>;
}

/** Port: index persistence. Synchronous so a full index runs in one fast transaction. */
export interface IndexStore {
  save(projectId: string, path: string, hash: string, artifact: ParsedArtifact): void;
  markInvalid(projectId: string, path: string, hash: string, error: string): void;
  remove(projectId: string, path: string): void;
  paths(projectId: string): string[];
  transaction<T>(fn: () => T): T;
}

export interface IndexAllResult {
  indexed: number;
  invalid: number;
  removed: number;
}

export type ReindexResult = { status: 'indexed' } | { status: 'invalid'; error: string } | { status: 'removed' };

type Parsed = { path: string; hash: string } & ({ ok: true; artifact: ParsedArtifact } | { ok: false; error: string });

function parse(path: string, content: string, hash: string): Parsed {
  try {
    return { path, hash, ok: true, artifact: parseArtifact(path, content) };
  } catch (e) {
    if (e instanceof ArtifactParseError) return { path, hash, ok: false, error: e.message };
    throw e;
  }
}

export class WorkspaceIndexer {
  constructor(
    private readonly source: ArtifactSource,
    private readonly store: IndexStore,
  ) {}

  async indexAll(projectId: string): Promise<IndexAllResult> {
    const paths = await this.source.list();
    const files = await Promise.all(paths.map(async (path) => ({ path, file: await this.source.read(path) })));
    const parsed = files.flatMap(({ path, file }) => (file ? [parse(path, file.content, file.hash)] : []));
    const present = new Set(parsed.map((p) => p.path));
    return this.store.transaction(() => {
      let invalid = 0;
      for (const p of parsed) {
        if (p.ok) this.store.save(projectId, p.path, p.hash, p.artifact);
        else {
          invalid += 1;
          this.store.markInvalid(projectId, p.path, p.hash, p.error);
        }
      }
      const stale = this.store.paths(projectId).filter((path) => !present.has(path));
      for (const path of stale) this.store.remove(projectId, path);
      return { indexed: parsed.length - invalid, invalid, removed: stale.length };
    });
  }

  async reindex(projectId: string, path: string): Promise<ReindexResult> {
    const file = await this.source.read(path);
    if (!file) {
      this.store.transaction(() => this.store.remove(projectId, path));
      return { status: 'removed' };
    }
    const p = parse(path, file.content, file.hash);
    return this.store.transaction(() => {
      if (p.ok) {
        this.store.save(projectId, path, p.hash, p.artifact);
        return { status: 'indexed' } as const;
      }
      this.store.markInvalid(projectId, path, p.hash, p.error);
      return { status: 'invalid', error: p.error } as const;
    });
  }
}
