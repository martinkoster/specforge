// SPDX-License-Identifier: Apache-2.0
// ContextAssembler (US-050, FR-037, FR-068, FR-099): the prompt of an implementation or correction run — story with
// acceptance criteria, project instructions, predecessors, epic goal and siblings, linked specification elements,
// concurrently running stories, scope rule and result schema — deterministically truncated to a size budget.
import type { BoardStatus, StartKind } from '@specforge/domain';
import { RESULT_INSTRUCTION } from './result-parser.js';

export interface StoryInfo {
  id: string;
  title: string;
  status: BoardStatus;
  summary: string | null;
  changedFiles: string[];
}

export interface ContextInput {
  story: { id: string; title: string; content: string };
  startKind: StartKind;
  /** Review feedback for corrections. */
  feedback?: string;
  /** Summary of the run being corrected, when the correction starts a fresh agent session (US-059 AC-3). */
  previousSummary?: string;
  instructions: string | null;
  linked: { id: string; title: string; path: string; text: string | null }[];
  epic: { id: string; title: string; goal: string | null; siblings: StoryInfo[] } | null;
  predecessors: StoryInfo[];
  concurrent: { id: string; title: string; touchedFiles: string[] }[];
  /** Maximum prompt size in characters. */
  budget: number;
}

export interface AssembledContext {
  prompt: string;
  systemAppend: string;
  /** Some linked elements were reduced to their titles. */
  truncated: boolean;
}

export const DEFAULT_CONTEXT_BUDGET = 60_000;

const STATUS: Record<BoardStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

const SYSTEM_APPEND = [
  'You are working on one user story in an isolated workspace managed by SpecForge.',
  'Implement only this story. Do not modify files in spec/ or .specforge/; report missing specification changes or missing dependencies in your final message.',
  'Run the project tests before you finish and summarise what you changed.',
  RESULT_INSTRUCTION,
].join('\n');

function stripFrontMatter(content: string): string {
  const text = content.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return text.trim();
  const end = text.indexOf('\n---', 4);
  if (end < 0) return text.trim();
  return text.slice(text.indexOf('\n', end + 1) + 1).trim();
}

const storyLine = (s: StoryInfo): string =>
  [
    `- ${s.id} ${s.title} (${STATUS[s.status]})${s.summary ? `: ${s.summary}` : ''}`,
    ...(s.changedFiles.length ? [`  Changed files: ${s.changedFiles.join(', ')}`] : []),
  ].join('\n');

/** The Markdown section of an element (from its heading to the next heading of the same or a higher level). */
export function extractElementSection(markdown: string, elementId: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${elementId}\\b`).test(l));
  if (start < 0) return null;
  const level = /^(#+)/.exec(lines[start]!)![1]!.length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const heading = /^(#+)\s/.exec(lines[i]!);
    if (heading && heading[1]!.length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

export function assembleContext(input: ContextInput): AssembledContext {
  const TASK: Record<StartKind, string> = {
    implement: `Implement user story ${input.story.id}: ${input.story.title}.`,
    correct: `Corrections were requested for user story ${input.story.id}: ${input.story.title}. Review your previous changes on this branch and fix them.`,
    resume: `Continue the work on user story ${input.story.id}: ${input.story.title}. The previous run stopped before it finished; check the current state of the working copy and complete the story.`,
    retry: `Implement user story ${input.story.id}: ${input.story.title}. An earlier run of this story failed; start over and avoid its mistakes.`,
  };
  const task = TASK[input.startKind];
  const fixed: string[] = [task, '', '## Story', stripFrontMatter(input.story.content)];
  if (input.feedback) fixed.push('', '## Review feedback', input.feedback.trim());
  if (input.previousSummary) fixed.push('', '## Summary of the previous run', input.previousSummary.trim());
  if (input.instructions?.trim()) fixed.push('', '## Project instructions & conventions', input.instructions.trim());
  if (input.predecessors.length) fixed.push('', '## Blocking predecessors', ...input.predecessors.map(storyLine));
  if (input.epic) {
    fixed.push('', `## Epic ${input.epic.id}: ${input.epic.title}`);
    if (input.epic.goal) fixed.push(`Goal: ${input.epic.goal}`);
    const siblings = input.epic.siblings.filter((s) => s.id !== input.story.id);
    if (siblings.length) fixed.push('Other stories of the epic:', ...siblings.map(storyLine));
  }
  if (input.concurrent.length) {
    fixed.push(
      '',
      '## Stories running at the same time',
      ...input.concurrent.map((c) => `- ${c.id} ${c.title}${c.touchedFiles.length ? ` — touching ${c.touchedFiles.join(', ')}` : ''}`),
    );
  }

  // Linked elements fill the remaining budget in ID order: full text while it fits, otherwise a reference.
  let used = fixed.join('\n').length;
  let truncated = false;
  const linked: string[] = [];
  for (const element of [...input.linked].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const full = element.text ?? `${element.id}: ${element.title} (${element.path})`;
    if (used + full.length + 2 <= input.budget) {
      linked.push(full);
      used += full.length + 2;
    } else {
      const reference = `${element.id}: ${element.title} (${element.path}) — not included in full (context budget)`;
      linked.push(reference);
      used += reference.length + 2;
      truncated = true;
    }
  }
  const prompt = [...fixed, ...(linked.length ? ['', '## Linked specification', ...linked.flatMap((l) => [l, ''])] : [])]
    .join('\n')
    .trimEnd();
  return { prompt, systemAppend: SYSTEM_APPEND, truncated };
}
