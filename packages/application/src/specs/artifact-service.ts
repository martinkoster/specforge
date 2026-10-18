// SPDX-License-Identifier: Apache-2.0
// View and edit artifacts (US-025, FR-012): list by type, read, save atomically with optimistic concurrency;
// a save over an externally changed file returns the disk version for the conflict dialog (US-021).
import { createTwoFilesPatch } from 'diff';
import type { ArtifactFiles } from '../stories/dependency-service.js';

/** Raised by `ArtifactFiles.writeAtomic` when the file changed since it was read (expected hash differs). */
export class ArtifactConflictError extends Error {
  constructor(readonly path: string) {
    super(`${path} was changed since it was read; reload before saving.`);
    this.name = 'ArtifactConflictError';
  }
}

export class ArtifactAccessError extends Error {
  readonly code = 'NOT_AN_ARTIFACT';
  constructor(path: string) {
    super(`${path} is not a specification artifact of this project.`);
    this.name = 'ArtifactAccessError';
  }
}

export interface IndexedArtifact {
  path: string;
  kind: string;
  approval: 'draft' | 'approved';
  parseState: 'ok' | 'invalid';
  parseError: string | null;
}

export interface ArtifactListIndex {
  artifacts(projectId: string): IndexedArtifact[];
}

export interface ArtifactGroup {
  kind: string;
  label: string;
  artifacts: { path: string; approval: 'draft' | 'approved'; invalid: string | null }[];
}

export type SaveResult = { ok: true; hash: string } | { ok: false; conflict: { theirs: string; theirsHash: string; diff: string } };

export interface ArtifactServiceDeps {
  index: ArtifactListIndex;
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
}

/** Specification order of artifact kinds (data_model.md §1.2). */
const KINDS: readonly [string, string][] = [
  ['intent', 'Intent'],
  ['feature_intent', 'Feature intents'],
  ['requirements', 'Requirements'],
  ['design', 'Design'],
  ['adr', 'ADRs'],
  ['epic', 'Epics'],
  ['story', 'Stories'],
  ['test_concept', 'Test concepts'],
  ['other', 'Other'],
];

export class ArtifactService {
  constructor(private readonly deps: ArtifactServiceDeps) {}

  list(projectId: string): ArtifactGroup[] {
    const artifacts = this.deps.index.artifacts(projectId);
    const known = new Set(KINDS.map(([k]) => k));
    return KINDS.flatMap(([kind, label]) => {
      const members = artifacts
        .filter((a) => (known.has(a.kind) ? a.kind : 'other') === kind)
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((a) => ({ path: a.path, approval: a.approval, invalid: a.parseState === 'invalid' ? (a.parseError ?? 'Invalid') : null }));
      return members.length > 0 ? [{ kind, label, artifacts: members }] : [];
    });
  }

  async read(projectId: string, path: string): Promise<{ content: string; hash: string }> {
    this.requireArtifact(projectId, path);
    const file = await this.deps.files(projectId).read(path);
    if (!file) throw new ArtifactAccessError(path);
    return file;
  }

  async save(projectId: string, path: string, content: string, expectedHash: string | null): Promise<SaveResult> {
    this.requireArtifact(projectId, path);
    const files = this.deps.files(projectId);
    try {
      const hash = await files.writeAtomic(path, content, { expectedHash });
      await this.deps.reindex(projectId, path);
      return { ok: true, hash };
    } catch (e) {
      if (!(e instanceof ArtifactConflictError)) throw e;
      const theirs = await files.read(path);
      const theirsContent = theirs?.content ?? '';
      return {
        ok: false,
        conflict: {
          theirs: theirsContent,
          theirsHash: theirs?.hash ?? '',
          diff: createTwoFilesPatch(`${path} (on disk)`, `${path} (your changes)`, theirsContent, content),
        },
      };
    }
  }

  private requireArtifact(projectId: string, path: string): void {
    if (!this.deps.index.artifacts(projectId).some((a) => a.path === path)) throw new ArtifactAccessError(path);
  }
}
