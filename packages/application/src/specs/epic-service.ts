// SPDX-License-Identifier: Apache-2.0
// Epics in the user-stories phase (US-035, UC-040, FR-093/FR-094): create, merge, split, reorder, delete (stories move
// to "No epic"), approve the epic structure, and Must-have requirements not covered by any epic.
import type { Document } from 'yaml';
import { editFrontMatter } from '../stories/front-matter.js';

export interface EpicSummary {
  id: string;
  title: string;
  approval: 'draft' | 'approved';
  path: string;
  laneOrder: number | null;
  /** Stored epic-review outcome (`epic_review.outcome`), if any. */
  reviewOutcome?: string | null;
}

export interface EpicDeps {
  index: {
    epics(projectId: string): EpicSummary[];
    epicStoryIds(projectId: string, epicId: string): string[];
    storyPath(projectId: string, storyId: string): string | undefined;
    /** Requirements an epic links (front-matter `requirements`). */
    epicRequirements(projectId: string, epicId: string): string[];
    setLaneOrder(projectId: string, epicId: string, order: number): void;
  };
  files(projectId: string): {
    read(path: string): Promise<{ content: string; hash: string } | undefined>;
    writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string>;
    remove(path: string): Promise<void>;
  };
  reindex(projectId: string, path: string): Promise<unknown>;
  /** Approval of an artifact (US-026). */
  approve(projectId: string, path: string): Promise<unknown>;
}

const EPIC_FOLDER = 'spec/04_user_stories/epics';
const HEADING = /^#{1,6}\s+((?:FR|NFR)-\d{1,4}):/;
const MUST = /\*\*Priority\*\*\s*:\s*Must Have/i;

/** IDs of the requirements marked **Priority**: Must Have in a requirements document. */
export function mustHaveRequirementIds(content: string): string[] {
  const ids: string[] = [];
  let current: string | null = null;
  for (const line of content.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) current = heading[1]!;
    else if (/^#{1,6}\s/.test(line)) current = null;
    else if (current && MUST.test(line)) {
      ids.push(current);
      current = null;
    }
  }
  return ids;
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);

function epicTemplate(id: string, title: string): string {
  return [
    '---',
    'kind: epic',
    `id: ${id}`,
    `title: ${title}`,
    'approval: draft',
    'requirements: []',
    '---',
    `# ${id}: ${title}`,
    '',
    '## Goal',
    '',
    '## Value',
    '',
    '## Acceptance criteria',
    '- [ ] ',
    '',
  ].join('\n');
}

export class EpicService {
  constructor(private readonly deps: EpicDeps) {}

  /** Must-have requirements (of `mustHaves`) that no epic links (coverage strip, AC-2). */
  uncovered(projectId: string, mustHaves: readonly string[]): string[] {
    const covered = new Set(this.deps.index.epics(projectId).flatMap((e) => this.deps.index.epicRequirements(projectId, e.id)));
    return mustHaves.filter((id) => !covered.has(id));
  }

  async create(projectId: string, input: { title: string }): Promise<{ id: string; path: string }> {
    const numbers = this.deps.index.epics(projectId).map((e) => Number(e.id.slice(3)));
    const id = `EP-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
    const path = `${EPIC_FOLDER}/${id}-${slug(input.title) || 'epic'}.md`;
    await this.deps.files(projectId).writeAtomic(path, epicTemplate(id, input.title.trim()), { expectedHash: null });
    await this.deps.reindex(projectId, path);
    return { id, path };
  }

  /** Merge `sourceId` into `targetId`: its stories and requirements move, the source epic is deleted. */
  async merge(projectId: string, sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) throw new Error('An epic cannot be merged into itself.');
    const source = this.epic(projectId, sourceId);
    const target = this.epic(projectId, targetId);
    const requirements = [
      ...new Set([...this.deps.index.epicRequirements(projectId, targetId), ...this.deps.index.epicRequirements(projectId, sourceId)]),
    ];
    await this.moveStories(projectId, this.deps.index.epicStoryIds(projectId, sourceId), targetId);
    await this.edit(projectId, target.path, (doc) => doc.set('requirements', requirements));
    await this.removeFile(projectId, source.path);
  }

  /** Split: the given stories of an epic move to a new epic. */
  async split(projectId: string, epicId: string, storyIds: readonly string[], title: string): Promise<{ id: string; path: string }> {
    this.epic(projectId, epicId);
    const members = new Set(this.deps.index.epicStoryIds(projectId, epicId));
    const foreign = storyIds.find((s) => !members.has(s));
    if (foreign) throw new Error(`${foreign} does not belong to ${epicId}.`);
    const created = await this.create(projectId, { title });
    await this.moveStories(projectId, storyIds, created.id);
    return created;
  }

  reorder(projectId: string, epicIds: readonly string[]): void {
    epicIds.forEach((id, i) => this.deps.index.setLaneOrder(projectId, id, i));
  }

  /** The stories that would move to "No epic" (confirmation before deleting). */
  deletePreview(projectId: string, epicId: string): { stories: string[] } {
    this.epic(projectId, epicId);
    return { stories: this.deps.index.epicStoryIds(projectId, epicId) };
  }

  async delete(projectId: string, epicId: string): Promise<void> {
    const epic = this.epic(projectId, epicId);
    await this.moveStories(projectId, this.deps.index.epicStoryIds(projectId, epicId), null);
    await this.removeFile(projectId, epic.path);
  }

  /**
   * Moves a story to another epic (or "No epic"; board lane drag, US-039 AC-3). Adding a story to an epic whose review
   * is confirmed or skipped clears that outcome: the epic is In progress again (FR-095).
   */
  async assign(projectId: string, storyId: string, epicId: string | null): Promise<void> {
    if (epicId) this.epic(projectId, epicId);
    await this.moveStories(projectId, [storyId], epicId);
  }

  /** New stories (kept generation run, new story file) reopen their epic if its review was confirmed (FR-095). */
  async storiesAdded(projectId: string, storyIds: readonly string[]): Promise<void> {
    const added = new Set(storyIds);
    for (const epic of this.deps.index.epics(projectId)) {
      if (epic.reviewOutcome && this.deps.index.epicStoryIds(projectId, epic.id).some((id) => added.has(id))) {
        await this.reopen(projectId, epic);
      }
    }
  }

  /** *Approve epic structure* (AC-4): every Draft epic is approved. */
  async approveAll(projectId: string): Promise<{ approved: string[] }> {
    const drafts = this.deps.index.epics(projectId).filter((e) => e.approval === 'draft');
    for (const e of drafts) await this.deps.approve(projectId, e.path);
    return { approved: drafts.map((e) => e.id) };
  }

  private epic(projectId: string, epicId: string): EpicSummary {
    const epic = this.deps.index.epics(projectId).find((e) => e.id === epicId);
    if (!epic) throw new Error(`Unknown epic ${epicId}.`);
    return epic;
  }

  /** Adding stories to an epic whose review is confirmed or skipped clears that outcome: In progress again (FR-095). */
  private async moveStories(projectId: string, storyIds: readonly string[], epicId: string | null): Promise<void> {
    const target = epicId ? this.deps.index.epics(projectId).find((e) => e.id === epicId) : undefined;
    for (const storyId of storyIds) {
      const path = this.deps.index.storyPath(projectId, storyId);
      if (!path) continue;
      await this.edit(projectId, path, (doc) => (epicId ? doc.set('epic', epicId) : doc.delete('epic')));
    }
    if (target && storyIds.length > 0) await this.reopen(projectId, target);
  }

  private async reopen(projectId: string, epic: EpicSummary): Promise<void> {
    if (epic.reviewOutcome) await this.edit(projectId, epic.path, (doc) => doc.delete('epic_review'));
  }

  private async edit(projectId: string, path: string, mutate: (doc: Document) => void): Promise<void> {
    const files = this.deps.files(projectId);
    const file = await files.read(path);
    if (!file) throw new Error(`${path} does not exist.`);
    await files.writeAtomic(path, editFrontMatter(file.content, mutate), { expectedHash: file.hash });
    await this.deps.reindex(projectId, path);
  }

  private async removeFile(projectId: string, path: string): Promise<void> {
    await this.deps.files(projectId).remove(path);
    await this.deps.reindex(projectId, path);
  }
}
