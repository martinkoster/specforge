// SPDX-License-Identifier: Apache-2.0
// Epic & stories phase of a feature (US-093, UC-045, FR-108, FR-109): the run's story and epic files become change items
// per file — new epics/stories, rework stories (`reworks:`), adjusted not-started stories — validated (FR-063) and
// applied with the feature link.
import { createTwoFilesPatch } from 'diff';
import { ArtifactParseError, parseArtifact } from '../indexing/parse-artifact.js';
import { editFrontMatter } from '../stories/front-matter.js';
import type { DeltaItem } from './delta.js';
import type { SpecValidationIssue } from './spec-validation.js';

/** The user's approved epic choice for a feature (US-093 AC-1). */
export interface EpicChoice {
  projectId: string;
  featureId: string;
  mode: 'new' | 'extend';
  /** The new epic's ID, or the epics to extend. */
  epicIds: string[];
  /** Title of a new epic. */
  title: string | null;
  decidedAt: string;
}

export interface EpicProposal {
  /** Default: a new epic for the feature. */
  newEpic: { id: string; title: string };
  /** Epics of the confirmed impact list that could be extended instead. */
  extend: { id: string; title: string; reason: string }[];
  choice: EpicChoice | null;
}

/** Validation issues that make a stories change set unusable (FR-063: dependencies and rework targets). */
export const BLOCKING_STORY_ISSUES: ReadonlySet<SpecValidationIssue['kind']> = new Set([
  'front_matter',
  'duplicate_id',
  'unknown_dependency',
  'dependency_cycle',
  'invalid_rework',
]);

const normalise = (text: string) => text.replace(/\r\n/g, '\n');

function primaryId(path: string, content: string): string | null {
  try {
    const parsed = parseArtifact(path, content);
    return parsed.story?.id ?? parsed.epic?.id ?? null;
  } catch (e) {
    if (e instanceof ArtifactParseError) return null;
    throw e;
  }
}

/** One change item per changed file of the stories folder; Done stories must not be changed (→ rework stories). */
export function splitStoryFile(input: { path: string; before: string | null; after: string | null; doneStories: ReadonlySet<string> }): {
  items: DeltaItem[];
  issues: string[];
} {
  const { path } = input;
  if (input.after === null) return { items: [], issues: input.before === null ? [] : [`${path}: the file was deleted.`] };
  const before = input.before === null ? null : normalise(input.before);
  const after = normalise(input.after);
  if (before === after) return { items: [], issues: [] };
  const elementId = primaryId(path, after) ?? (before === null ? null : primaryId(path, before));
  if (before !== null && elementId && input.doneStories.has(elementId)) {
    return {
      items: [],
      issues: [`${path}: ${elementId} is Done — propose a rework story (reworks: [${elementId}]) instead of changing it.`],
    };
  }
  const patch = createTwoFilesPatch(path, path, before ?? '', after, '', '', { context: 3 });
  return { items: [{ path, elementId, kind: before === null ? 'new' : 'modified', before, after, patch }], issues: [] };
}

/**
 * The file content after applying one stories item, or null on a conflict (a new file that exists by now, or a file that
 * changed since the generation). New epics and stories link to the feature and start in Backlog; adjusted files say
 * `Changed by FI-x.`.
 */
export function applyStoryFile(
  current: string | null,
  item: Pick<DeltaItem, 'path' | 'kind' | 'before' | 'after'>,
  featureId: string,
): string | null {
  if (item.kind === 'new') {
    if (current !== null) return null;
    const kind = parseArtifact(item.path, item.after).kind;
    return editFrontMatter(item.after, (doc) => {
      doc.set('feature', featureId);
      if (kind === 'story') doc.set('status', 'backlog');
    });
  }
  if (current === null || item.before === null || normalise(current) !== normalise(item.before)) return null;
  const after = normalise(item.after);
  return new RegExp(`Changed by ${featureId}\\b`).test(after) ? after : `${after.replace(/\n*$/, '\n')}\nChanged by ${featureId}.\n`;
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

/** The prompt of the stories generation run. */
export function storiesPrompt(input: {
  featureId: string;
  featurePath: string;
  choice: EpicChoice;
  epicsFolder: string;
  storiesFolder: string;
  scope: { targetRef: string; reason: string }[];
  element(id: string): { title: string; path: string } | undefined;
  storyStatus(id: string): string | undefined;
  nextIds: string[];
}): string {
  const { featureId, choice } = input;
  const epicLine =
    choice.mode === 'new'
      ? `Create the new epic ${choice.epicIds[0]} "${choice.title ?? featureId}" as ${input.epicsFolder}/${choice.epicIds[0]}.md (front-matter kind: epic, id, title, feature: ${featureId}, requirements; sections ## Goal, ## Value, ## Acceptance criteria).`
      : choice.epicIds
          .map((id) => {
            const e = input.element(id);
            return `Extend the existing epic ${id} "${e?.title ?? id}" (${e?.path ?? input.epicsFolder}): add the new stories to it.`;
          })
          .join('\n');
  const done = input.scope.map((s) => s.targetRef).filter((id) => input.storyStatus(id) === 'done');
  return [
    `Plan the epic and user stories for the feature intent ${input.featurePath} (${featureId}).`,
    epicLine,
    'Scope — the confirmed impact:',
    ...input.scope.map((s) => {
      const e = input.element(s.targetRef);
      const status = input.storyStatus(s.targetRef);
      if (status)
        return `- ${s.targetRef} "${e?.title ?? s.targetRef}" (${STATUS_LABEL[status] ?? status}${e ? `, ${e.path}` : ''}): ${s.reason}`;
      return `- ${s.targetRef}${e ? ` "${e.title}" (${e.path})` : ''}: ${s.reason}`;
    }),
    `Next free IDs: ${input.nextIds.join(', ')}.`,
    `New stories: one file per story in ${input.storiesFolder}/ named US-xxx-<slug>.md with front-matter kind: story, id, title, status: backlog, epic, feature: ${featureId}, requirements; sections ## Description and ## Acceptance criteria.`,
    'Stories in the scope that are not started (Backlog, Ready) may be adjusted in place in their own file.',
    `Done stories are never changed: for each affected Done story write a new rework story with "reworks: [${done[0] ?? 'US-xxx'}]" describing the change.`,
    'Propose dependencies with depends_on / related_to entries ({ id, rationale }); existing stories, including Done ones, are allowed; no cycles.',
    `Write only files inside ${input.storiesFolder}/ (other writes and shell commands are denied).`,
    'SpecForge turns your files into a change set the user reviews item by item.',
  ].join('\n');
}
