// SPDX-License-Identifier: Apache-2.0
// AI review and clarification in the feature wizard (US-083, UC-043, FR-103): a read-only `feature_review` run with the
// idea and the project context returns an enhanced draft, overlaps, conflicts, a suggested epic, "already covered" and
// questions; answers resume the same session and update the draft in place.
import { z } from 'zod';
import type { AgentAdapter } from '../ports/agent-adapter.js';
import type { NewRun, RunStatus } from '../scheduling/ports.js';
import type { ArtifactFiles } from '../stories/dependency-service.js';
import { editFrontMatter } from '../stories/front-matter.js';
import { runAgent, type AgentRunDeps, type AgentRunStore } from './agent-run.js';
import {
  FeatureWizardError,
  type DraftPart,
  type DraftSection,
  type FeatureReview,
  type FeatureWizardDeps,
  type ReviewQuestion,
  type WizardRecord,
} from './feature-wizard.js';

const Ref = z.object({ ref: z.string().min(1), text: z.string() });
const strings = z.array(z.string()).default([]);
const ResultSchema = z.object({
  title: z.string().optional(),
  draft: z
    .object({
      problem: z.string().optional(),
      goal: z.string().optional(),
      inScope: strings,
      outOfScope: strings,
      successCriteria: strings,
      constraints: strings,
      assumptions: strings,
    })
    .default({ inScope: [], outOfScope: [], successCriteria: [], constraints: [], assumptions: [] }),
  overlaps: z.array(Ref).default([]),
  conflicts: z.array(Ref).default([]),
  suggestedEpic: z
    .object({ id: z.string().min(1), reason: z.string() })
    .nullable()
    .default(null),
  covered: Ref.nullable().default(null),
  questions: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1), why: z.string().default(''), options: strings }))
    .default([]),
  done: z.boolean().default(false),
});
export type FeatureReviewResult = z.infer<typeof ResultSchema>;

export function parseFeatureReview(resultText: string): FeatureReviewResult | null {
  const last = [...resultText.matchAll(/```specforge-result\s*\n([\s\S]*?)```/g)].at(-1)?.[1];
  if (!last) return null;
  try {
    const parsed = ResultSchema.safeParse(JSON.parse(last));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const FORMAT = [
  'Do not change any file. Report in a final fenced block:',
  '```specforge-result',
  '{"title":"short feature title","draft":{"problem":"…","goal":"…","inScope":["…"],"outOfScope":["…"],"successCriteria":["…"],"constraints":["…"],"assumptions":["…"]},',
  ' "overlaps":[{"ref":"FR-034","text":"why it overlaps"}],"conflicts":[{"ref":"ADR-005","text":"what conflicts"}],',
  ' "suggestedEpic":{"id":"EP-002","reason":"…"},"covered":null,',
  ' "questions":[{"id":"q1","text":"…","why":"why it matters","options":["…"]}],"done":false}',
  '```',
  'Set "covered" to {"ref":"FI-…|FR-…|EP-…","text":"…"} only if the idea is already fully covered. Set "done": true when nothing important is left open.',
].join('\n');

export interface FeatureReviewContext {
  intentPath: string;
  requirements: { id: string; title: string }[];
  epics: { id: string; title: string }[];
  adrs: { id: string; title: string }[];
  features: { id: string; title: string; path: string }[];
}

export interface FeatureReviewRunStore extends AgentRunStore {
  createRun(projectId: string, run: NewRun): string;
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
}

export interface FeatureReviewDeps extends Omit<AgentRunDeps, 'store'> {
  wizards: FeatureWizardDeps['store'];
  runs: FeatureReviewRunStore;
  adapter: AgentAdapter | undefined;
  workspace(projectId: string): { root: string; nonGit: boolean };
  context(projectId: string): FeatureReviewContext;
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  aiDisabledReason?(): string | null;
  /** The draft changed (→ UI refresh). */
  onUpdated?(wizard: WizardRecord): void;
}

type Result = { ok: true; runId: string } | { ok: false; reason: string };

const SECTION_FIELDS: readonly [DraftSection, (d: FeatureReviewResult['draft']) => string[]][] = [
  ['problem', (d) => (d.problem ? [d.problem] : [])],
  ['goal', (d) => (d.goal ? [d.goal] : [])],
  ['in_scope', (d) => d.inScope],
  ['out_of_scope', (d) => d.outOfScope],
  ['success', (d) => d.successCriteria],
  ['constraints', (d) => d.constraints],
  ['assumptions', (d) => d.assumptions],
];

const list = (items: readonly { id: string; title: string }[]) =>
  items.length ? items.map((i) => `- ${i.id}: ${i.title}`).join('\n') : '- (none)';

/** The enhanced draft as parts; the idea is the user part of the problem; edits and removals of earlier rounds survive. */
function mergeParts(idea: string, previous: readonly DraftPart[], draft: FeatureReviewResult['draft']): DraftPart[] {
  const old = new Map(previous.map((p) => [p.id, p]));
  const parts: DraftPart[] = [{ id: 'problem-0', section: 'problem', text: idea.trim(), origin: 'user', removed: false }];
  for (const [section, texts] of SECTION_FIELDS) {
    const offset = section === 'problem' ? 1 : 0;
    texts(draft).forEach((text, i) => {
      const id = `${section}-${i + offset}`;
      const before = old.get(id);
      if (before?.origin === 'user') parts.push(before);
      else parts.push({ id, section, text, origin: 'ai', removed: before !== undefined && before.removed && before.text === text });
    });
  }
  return parts;
}

function mergeQuestions(previous: readonly ReviewQuestion[], next: FeatureReviewResult['questions']): ReviewQuestion[] {
  const known = new Set(previous.map((q) => q.id));
  return [...previous, ...next.filter((q) => !known.has(q.id)).map((q) => ({ ...q, answer: null, deferred: false }))];
}

export class FeatureReviewService {
  private readonly rounds = new Set<Promise<void>>();

  constructor(private readonly deps: FeatureReviewDeps) {}

  state(wizardId: string): FeatureReview | undefined {
    return this.deps.wizards.get(wizardId)?.draft.review;
  }

  /** *Review with AI* (AC-1). */
  async review(wizardId: string): Promise<Result> {
    const wizard = this.deps.wizards.get(wizardId);
    if (!wizard) return { ok: false, reason: `Unknown feature draft ${wizardId}.` };
    const refused = this.refusal(wizard);
    if (refused) return { ok: false, reason: refused };
    if (wizard.draft.text.trim() === '') return { ok: false, reason: 'Describe the feature before the AI review.' };
    const ctx = this.deps.context(wizard.projectId);
    const d = wizard.draft;
    const prompt = [
      'Review this feature idea for an existing project and turn it into a complete feature intent.',
      `Idea: ${d.text.trim()}`,
      ...(d.motivation ? [`Motivation: ${d.motivation}`] : []),
      ...(d.targetUsers ? [`Target users: ${d.targetUsers}`] : []),
      ...(d.priority ? [`Priority: ${d.priority}`] : []),
      ...(d.epicId ? [`Related epic: ${d.epicId}`] : []),
      '',
      `Read the main intent ${ctx.intentPath}. Existing requirements:`,
      list(ctx.requirements),
      'Epics:',
      list(ctx.epics),
      'Architecture decisions:',
      list(ctx.adrs),
      'Feature intents:',
      list(ctx.features),
      '',
      'Find overlaps with existing requirements, conflicts with requirements or ADRs, the epic it fits, and questions the product owner must answer.',
      FORMAT,
    ].join('\n');
    return this.round(wizard, 'review', prompt, null);
  }

  /** *Send answers*: the same session continues (AC-4). */
  async answer(wizardId: string, answers: Record<string, string>): Promise<Result> {
    const wizard = this.deps.wizards.get(wizardId);
    const review = wizard?.draft.review;
    if (!wizard || !review) return { ok: false, reason: `There is no AI review of ${wizardId} to answer.` };
    const refused = this.refusal(wizard);
    if (refused) return { ok: false, reason: refused };
    const given = Object.entries(answers).filter(([, a]) => a.trim() !== '');
    if (given.length === 0) return { ok: false, reason: 'Answer at least one question.' };
    const questions = review.questions.map((q) => (answers[q.id]?.trim() ? { ...q, answer: answers[q.id]!.trim(), deferred: false } : q));
    const lines = questions.filter((q) => answers[q.id]?.trim()).map((q) => `- ${q.text} → ${q.answer}`);
    const updated = { ...wizard, draft: { ...wizard.draft, review: { ...review, questions } } };
    const prompt = [
      'The product owner answered:',
      ...lines,
      '',
      'Update the draft accordingly; ask follow-up questions only where needed.',
      FORMAT,
    ].join('\n');
    return this.round(updated, 'clarify', prompt, wizard.sessionId);
  }

  /** *Keep / Remove / Edit* of a draft part (AC-2); an edited part becomes the user's. */
  editPart(wizardId: string, partId: string, change: { removed?: boolean; text?: string }): FeatureReview {
    return this.change(wizardId, (review) => {
      if (!review.parts.some((p) => p.id === partId)) throw new FeatureWizardError(`Unknown part ${partId}.`);
      const parts = review.parts.map((p) =>
        p.id !== partId
          ? p
          : {
              ...p,
              ...(change.removed !== undefined ? { removed: change.removed } : {}),
              ...(change.text !== undefined ? { text: change.text, origin: 'user' as const } : {}),
            },
      );
      return { ...review, parts };
    });
  }

  /** *Answer later* (AC-4). */
  deferQuestion(wizardId: string, questionId: string): FeatureReview {
    return this.change(wizardId, (review) => ({
      ...review,
      questions: review.questions.map((q) => (q.id === questionId ? { ...q, deferred: true } : q)),
    }));
  }

  /** *Continue* despite "already covered" (AC-3). */
  dismissCovered(wizardId: string): FeatureReview {
    return this.change(wizardId, (review) => ({ ...review, covered: review.covered ? { ...review.covered, dismissed: true } : null }));
  }

  /** *Withdraw* (AC-3): the draft is dropped. */
  withdraw(wizardId: string): void {
    this.deps.wizards.remove(wizardId);
  }

  /** *Merge into FI-x* (AC-3): the idea is appended to that feature intent and the draft is dropped. */
  async mergeInto(wizardId: string, featureId: string): Promise<{ path: string }> {
    const wizard = this.require(wizardId);
    const feature = this.deps.context(wizard.projectId).features.find((f) => f.id === featureId);
    if (!feature) throw new FeatureWizardError(`Unknown feature intent ${featureId}.`);
    const files = this.deps.files(wizard.projectId);
    const file = await files.read(feature.path);
    if (!file) throw new FeatureWizardError(`${feature.path} no longer exists.`);
    const entry = `- ${wizard.draft.text.trim().replace(/\s*\n\s*/g, ' ')} (${this.deps.now().slice(0, 10)})`;
    const body = file.content.replace(/\s*$/, '');
    const content = body.includes('\n## Merged ideas\n') ? `${body}\n${entry}\n` : `${body}\n\n## Merged ideas\n${entry}\n`;
    // Touching the front-matter validates that the file is still a feature intent with front-matter.
    await files.writeAtomic(
      feature.path,
      editFrontMatter(content, () => undefined),
      { expectedHash: file.hash },
    );
    await this.deps.reindex(wizard.projectId, feature.path);
    this.deps.wizards.remove(wizardId);
    return { path: feature.path };
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.rounds]);
  }

  private refusal(wizard: WizardRecord): string | null {
    const disabled = this.deps.aiDisabledReason?.() ?? null;
    if (disabled) return disabled;
    if (!this.deps.adapter) return 'No agent adapter is available for the AI review.';
    if (wizard.draft.review?.state === 'running') return 'The AI review is still running.';
    return null;
  }

  private require(wizardId: string): WizardRecord {
    const wizard = this.deps.wizards.get(wizardId);
    if (!wizard) throw new FeatureWizardError(`Unknown feature draft ${wizardId}.`);
    return wizard;
  }

  private change(wizardId: string, fn: (review: FeatureReview) => FeatureReview): FeatureReview {
    const wizard = this.require(wizardId);
    if (!wizard.draft.review) throw new FeatureWizardError('There is no AI review yet.');
    const review = fn(wizard.draft.review);
    this.save({ ...wizard, draft: { ...wizard.draft, review }, updatedAt: this.deps.now() });
    return review;
  }

  private save(wizard: WizardRecord): void {
    this.deps.wizards.save(wizard);
    this.deps.onUpdated?.(wizard);
  }

  private round(wizard: WizardRecord, step: 'review' | 'clarify', prompt: string, resumeSessionId: string | null): Result {
    const { deps } = this;
    const adapter = deps.adapter!;
    const space = deps.workspace(wizard.projectId);
    const runId = deps.runs.createRun(wizard.projectId, {
      storyId: null,
      kind: 'feature_review',
      startKind: null,
      trigger: `FeatureReview ${wizard.id}`,
    });
    deps.runs.setRunStatus(runId, 'running');
    const previous: FeatureReview = wizard.draft.review ?? {
      state: 'running',
      runId,
      reason: null,
      parts: [],
      overlaps: [],
      conflicts: [],
      suggestedEpic: null,
      covered: null,
      questions: [],
      done: false,
    };
    this.save({
      ...wizard,
      step,
      draft: { ...wizard.draft, review: { ...previous, state: 'running', runId, reason: null } },
      updatedAt: deps.now(),
    });
    const run = runAgent(
      adapter,
      { ...deps, store: deps.runs },
      {
        runId,
        projectId: wizard.projectId,
        kind: 'feature_review',
        cwd: space.root,
        nonGit: space.nonGit,
        prompt,
        readOnly: true,
        ...(resumeSessionId && adapter.capabilities().resume ? { resumeSessionId } : {}),
      },
    );
    const done = run.done
      .then((outcome) => {
        const latest = deps.wizards.get(wizard.id);
        if (!latest?.draft.review) return;
        const current = latest.draft.review;
        if (outcome.status !== 'completed') {
          const reason = outcome.status === 'failed' ? outcome.reason : 'The AI review was cancelled.';
          deps.runs.setRunStatus(runId, outcome.status, reason);
          this.save({ ...latest, draft: { ...latest.draft, review: { ...current, state: 'failed', reason } } });
          return;
        }
        const parsed = parseFeatureReview(outcome.resultText);
        if (!parsed) {
          const reason = 'The agent returned no valid review block.';
          deps.runs.setRunStatus(runId, 'completed_no_result', reason);
          this.save({ ...latest, draft: { ...latest.draft, review: { ...current, state: 'failed', reason } } });
          return;
        }
        deps.runs.setRunStatus(runId, 'completed');
        const review: FeatureReview = {
          state: 'ready',
          runId,
          reason: null,
          parts: mergeParts(latest.draft.text, current.parts, parsed.draft),
          overlaps: parsed.overlaps,
          conflicts: parsed.conflicts,
          suggestedEpic: parsed.suggestedEpic,
          covered: parsed.covered ? { ...parsed.covered, dismissed: current.covered?.dismissed ?? false } : null,
          questions: mergeQuestions(current.questions, parsed.questions),
          done: parsed.done,
        };
        const title = latest.draft.title ?? parsed.title;
        this.save({
          ...latest,
          sessionId: outcome.sessionId,
          draft: { ...latest.draft, ...(title ? { title } : {}), review },
          updatedAt: deps.now(),
        });
      })
      .catch((e: unknown) => deps.runs.setRunStatus(runId, 'failed', e instanceof Error ? e.message : String(e)))
      .finally(() => this.rounds.delete(done));
    this.rounds.add(done);
    return { ok: true, runId };
  }
}
