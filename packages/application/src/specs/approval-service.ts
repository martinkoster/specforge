// SPDX-License-Identifier: Apache-2.0
// Human approval of artifacts (US-026, FR-013, UC-007): Approve writes `approval: approved` + `approved_at`; any AI change
// makes the artifact Draft again; generation from Draft inputs needs confirmation.
import type { ArtifactFiles } from '../stories/dependency-service.js';
import { editFrontMatter } from '../stories/front-matter.js';
import { ArtifactAccessError, type ArtifactListIndex, type IndexedArtifact } from './artifact-service.js';

export type GenerationTarget = 'requirements' | 'design' | 'epics' | 'stories' | 'test_concepts';

/** Artifact kinds each generation reads (FR-013: design from requirements, stories from design, …). */
const INPUT_KINDS: Record<GenerationTarget, readonly string[]> = {
  requirements: ['intent', 'feature_intent'],
  design: ['requirements'],
  epics: ['design'],
  stories: ['design', 'epic'],
  test_concepts: ['story'],
};

const TARGET_LABEL: Record<GenerationTarget, string> = {
  requirements: 'requirements',
  design: 'design',
  epics: 'epics',
  stories: 'stories',
  test_concepts: 'test concepts',
};

export function generationInputCheck(
  target: GenerationTarget,
  artifacts: readonly IndexedArtifact[],
): { drafts: string[]; warning: string | null } {
  const drafts = artifacts
    .filter((a) => INPUT_KINDS[target].includes(a.kind) && a.approval === 'draft')
    .map((a) => a.path)
    .sort();
  return {
    drafts,
    warning: drafts.length
      ? `Some inputs are still Draft: ${drafts.join(', ')}. Generated ${TARGET_LABEL[target]} may need rework. Continue anyway?`
      : null,
  };
}

export interface ApprovalServiceDeps {
  index: ArtifactListIndex;
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  now(): string;
}

export class ApprovalService {
  constructor(private readonly deps: ApprovalServiceDeps) {}

  async approve(projectId: string, path: string): Promise<{ ok: true; hash: string }> {
    const hash = await this.edit(projectId, path, (doc) => {
      doc.set('approval', 'approved');
      doc.set('approved_at', this.deps.now());
    });
    if (hash === undefined) throw new ArtifactAccessError(path);
    return { ok: true, hash };
  }

  /** Called with the files a specification run changed (US-027): they need a new human approval. */
  async markDraftAfterAiChange(projectId: string, paths: readonly string[], runId: string): Promise<void> {
    const known = new Set(this.deps.index.artifacts(projectId).map((a) => a.path));
    for (const path of paths.filter((p) => known.has(p))) {
      await this.edit(projectId, path, (doc) => {
        doc.set('approval', 'draft');
        doc.delete('approved_at');
        doc.set('generated_by', runId);
      });
    }
  }

  check(projectId: string, target: GenerationTarget): { drafts: string[]; warning: string | null } {
    return generationInputCheck(target, this.deps.index.artifacts(projectId));
  }

  private async edit(projectId: string, path: string, mutate: Parameters<typeof editFrontMatter>[1]): Promise<string | undefined> {
    if (!this.deps.index.artifacts(projectId).some((a) => a.path === path)) throw new ArtifactAccessError(path);
    const files = this.deps.files(projectId);
    const file = await files.read(path);
    if (!file) return undefined;
    const hash = await files.writeAtomic(path, editFrontMatter(file.content, mutate), { expectedHash: file.hash });
    await this.deps.reindex(projectId, path);
    return hash;
  }
}
