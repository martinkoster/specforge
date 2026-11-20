// SPDX-License-Identifier: Apache-2.0
// Feature wizard (US-082, UC-043, UF-17, ADR-025): resumable drafts stored after every step outside the rebuildable
// index; *Save* writes the feature intent `01_intent/FI-xxx-<slug>.md` (Draft, or approved via the approval flow).
import { nextFeatureId, specLayout } from '@specforge/domain';
import type { ArtifactFiles } from '../stories/dependency-service.js';

export const WIZARD_STEPS = ['describe', 'review', 'clarify', 'save'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardDraft {
  /** "What would you like to add or change?" */
  text: string;
  motivation?: string;
  targetUsers?: string;
  priority?: 'must' | 'should' | 'could';
  epicId?: string;
  title?: string;
  /** The AI review and clarification (US-083); maintained by the core only. */
  review?: FeatureReview;
}

export const DRAFT_SECTIONS = ['problem', 'goal', 'in_scope', 'out_of_scope', 'success', 'constraints', 'assumptions'] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];

/** One part of the enhanced draft: the user's idea or an AI-added part (*Keep / Remove / Edit*). */
export interface DraftPart {
  id: string;
  section: DraftSection;
  text: string;
  /** `user` for the idea and for parts the user edited. */
  origin: 'user' | 'ai';
  removed: boolean;
}

export interface ReviewQuestion {
  id: string;
  text: string;
  why: string;
  options: string[];
  answer: string | null;
  /** *Answer later*. */
  deferred: boolean;
}

export interface FeatureReview {
  state: 'running' | 'ready' | 'failed';
  runId: string;
  reason: string | null;
  parts: DraftPart[];
  overlaps: { ref: string; text: string }[];
  conflicts: { ref: string; text: string }[];
  suggestedEpic: { id: string; reason: string } | null;
  covered: { ref: string; text: string; dismissed: boolean } | null;
  questions: ReviewQuestion[];
  /** The agent has no further questions. */
  done: boolean;
}

export interface WizardRecord {
  id: string;
  projectId: string;
  step: WizardStep;
  draft: WizardDraft;
  sessionId: string | null;
  sourceIdea: string | null;
  /** Set on save. */
  featureId: string | null;
  updatedAt: string;
}

export interface FeatureWizardDeps {
  store: {
    save(row: WizardRecord): void;
    get(id: string): WizardRecord | undefined;
    /** Newest first. */
    list(projectId: string): WizardRecord[];
    remove(id: string): void;
  };
  /** IDs of the indexed feature intents. */
  featureIds(projectId: string): string[];
  specRoot(projectId: string): string;
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  /** The approval flow of all artifacts (approved_at, Draft → Approved). */
  approve(projectId: string, path: string): Promise<unknown>;
  newId(): string;
  now(): string;
}

export interface WizardPreview {
  featureId: string;
  title: string;
  path: string;
  content: string;
}

export class FeatureWizardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureWizardError';
  }
}

const TITLE_MAX = 60;

/** A title from the first line of the idea (without a trailing full stop), shortened at a word boundary. */
export function titleFromIdea(text: string): string {
  const line = (text.trim().split('\n')[0] ?? '').trim().replace(/[.!?]+$/, '');
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : TITLE_MAX).trim();
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '') || 'feature';

/** The feature intent file for a wizard draft (data_model.md §1.5). */
export function featureIntentFile({ id, title, draft }: { id: string; title: string; draft: WizardDraft }): string {
  const front = [
    '---',
    'specforge: 1',
    'kind: feature_intent',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    'approval: draft',
    'status: draft',
    ...(draft.priority ? [`priority: ${draft.priority}`] : []),
    ...(draft.epicId ? [`related_epics: [${draft.epicId}]`] : []),
    '---',
  ];
  const review = draft.review;
  const kept = (section: DraftSection) =>
    (review?.parts ?? []).filter((p) => p.section === section && !p.removed).map((p) => p.text.trim());
  const paragraphs = (section: DraftSection) => kept(section).flatMap((t, i) => (i === 0 ? [t] : ['', t]));
  const bullets = (section: DraftSection) => kept(section).map((t) => `- ${t}`);
  const motivation = draft.motivation?.trim() ? ['', draft.motivation.trim()] : [];
  // Without a review the idea is the problem; with one, the user part of the problem section holds it.
  const reviewed = paragraphs('problem');
  const problem = review ? [...reviewed.slice(0, 1), ...motivation, ...reviewed.slice(1)] : [draft.text.trim(), ...motivation];
  const assumptions = [...(draft.targetUsers?.trim() ? [`Target users: ${draft.targetUsers.trim()}`] : []), ...bullets('assumptions')];
  const questions = review?.questions ?? [];
  const decisions = questions.filter((q) => q.answer !== null).map((q, i) => `| ${i + 1} | ${cell(q.text)} | ${cell(q.answer!)} |`);
  const open = [
    ...questions.filter((q) => q.answer === null).map((q) => `- ${q.text}`),
    ...(review?.conflicts ?? []).map((c) => `- ${c.ref}: ${c.text}`),
  ];
  return [
    ...front,
    '## Problem',
    ...problem,
    '',
    '## Goal',
    ...paragraphs('goal'),
    '',
    '## Scope',
    '### In scope',
    ...bullets('in_scope'),
    '',
    '### Out of scope',
    ...bullets('out_of_scope'),
    '',
    '## Success criteria',
    ...bullets('success'),
    '',
    '## Constraints',
    ...bullets('constraints'),
    '',
    '## Assumptions',
    ...assumptions,
    '',
    '## Clarified decisions',
    '| # | Question | Decision |',
    '|---|---|---|',
    ...decisions,
    '',
    ...(open.length ? ['## Open questions', ...open, ''] : []),
  ].join('\n');
}

/** A table cell: no pipes, one line. */
const cell = (text: string) => text.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

export class FeatureWizardService {
  constructor(private readonly deps: FeatureWizardDeps) {}

  create(projectId: string, draft: WizardDraft, options: { sourceIdea?: string } = {}): WizardRecord {
    const row: WizardRecord = {
      id: this.deps.newId(),
      projectId,
      step: 'describe',
      draft,
      sessionId: null,
      sourceIdea: options.sourceIdea ?? null,
      featureId: null,
      updatedAt: this.deps.now(),
    };
    this.deps.store.save(row);
    return row;
  }

  get(wizardId: string): WizardRecord | undefined {
    return this.deps.store.get(wizardId);
  }

  /** Stores the state of a step (AC-4). */
  update(wizardId: string, change: { step: WizardStep; draft: WizardDraft }): WizardRecord {
    const stored = this.require(wizardId);
    // The review is maintained by the core (US-083); a client copy never overwrites it.
    const { review: _client, ...fields } = change.draft;
    const draft: WizardDraft = { ...fields, ...(stored.draft.review ? { review: stored.draft.review } : {}) };
    const row = { ...stored, step: change.step, draft, updatedAt: this.deps.now() };
    this.deps.store.save(row);
    return row;
  }

  discard(wizardId: string): void {
    this.deps.store.remove(wizardId);
  }

  /** Unsaved drafts ("Draft feature: <title> — resume"), newest first. */
  drafts(projectId: string): { id: string; title: string; step: WizardStep; updatedAt: string }[] {
    return this.deps.store
      .list(projectId)
      .filter((r) => r.featureId === null)
      .map((r) => ({
        id: r.id,
        title: r.draft.title?.trim() || titleFromIdea(r.draft.text) || 'Untitled feature',
        step: r.step,
        updatedAt: r.updatedAt,
      }));
  }

  preview(wizardId: string, title?: string): WizardPreview {
    const row = this.require(wizardId);
    const featureId = row.featureId ?? nextFeatureId(this.deps.featureIds(row.projectId));
    const finalTitle = (title ?? row.draft.title ?? titleFromIdea(row.draft.text)).trim();
    const path = `${specLayout(this.deps.specRoot(row.projectId)).folders.intent}/${featureId}-${slugOf(finalTitle)}.md`;
    return { featureId, title: finalTitle, path, content: featureIntentFile({ id: featureId, title: finalTitle, draft: row.draft }) };
  }

  /** Writes the feature intent (AC-3); approving removes the draft (ADR-025), a Draft keeps it linked to the feature. */
  async save(wizardId: string, options: { title: string; approve: boolean }): Promise<{ featureId: string; path: string }> {
    const row = this.require(wizardId);
    if (row.draft.text.trim() === '') throw new FeatureWizardError('Describe the feature before saving it.');
    if (options.title.trim() === '') throw new FeatureWizardError('The feature needs a title.');
    const preview = this.preview(wizardId, options.title);
    await this.deps.files(row.projectId).writeAtomic(preview.path, preview.content, { expectedHash: null });
    await this.deps.reindex(row.projectId, preview.path);
    if (options.approve) {
      await this.deps.approve(row.projectId, preview.path);
      this.deps.store.remove(wizardId);
    } else {
      this.deps.store.save({
        ...row,
        step: 'save',
        featureId: preview.featureId,
        draft: { ...row.draft, title: preview.title },
        updatedAt: this.deps.now(),
      });
    }
    return { featureId: preview.featureId, path: preview.path };
  }

  private require(wizardId: string): WizardRecord {
    const row = this.deps.store.get(wizardId);
    if (!row) throw new FeatureWizardError(`Unknown feature draft ${wizardId}.`);
    return row;
  }
}
