// SPDX-License-Identifier: Apache-2.0
// Intent clarification (US-028, UC-005, FR-005/FR-006): a read-only `clarify` run returns questions, ambiguities,
// alternatives and assumptions; answers resume the same agent session (multi-turn); finishing proposes a
// "Clarified decisions" section of the intent as a reviewable change; cancelling keeps the answers as a draft.
import { z } from 'zod';
import type { AgentAdapter } from '../ports/agent-adapter.js';
import type { NewRun, RunStatus } from '../scheduling/ports.js';
import { runAgent, type AgentRun, type AgentRunDeps, type AgentRunStore } from './agent-run.js';
import type { RefineRequest, StartResult } from './spec-run-service.js';

export const INTENT_TEMPLATE = [
  '---',
  'kind: intent',
  'approval: draft',
  '---',
  '# Intent',
  '',
  '## Vision',
  'What should exist when this project succeeds?',
  '',
  '## Problem',
  'Which problem does it solve, and for whom?',
  '',
  '## Users and stakeholders',
  '',
  '## Scope',
  '### In scope',
  '### Out of scope',
  '',
  '## Success criteria',
  '',
  '## Constraints',
  'Technology, budget, deadlines, regulations.',
  '',
  '## Open questions',
  '',
].join('\n');

export type ClarificationItemType = 'question' | 'ambiguity' | 'alternative' | 'assumption';
export type ClarificationState = 'running' | 'awaiting_answers' | 'complete' | 'failed' | 'cancelled' | 'finished';

export interface ClarificationItem {
  id: string;
  type: ClarificationItemType;
  text: string;
  options: string[];
  /** The user's answer; for assumptions "accepted" / "rejected". */
  answer: string | null;
}

export interface ClarificationRecord {
  id: string;
  projectId: string;
  intentPath: string;
  state: ClarificationState;
  sessionId: string | null;
  items: ClarificationItem[];
  lastRunId: string | null;
  proposalRunId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ClarificationStore extends AgentRunStore {
  createRun(projectId: string, run: NewRun): string;
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
  saveClarification(record: ClarificationRecord): void;
  clarification(id: string): ClarificationRecord | undefined;
  latestClarification(projectId: string, intentPath: string): ClarificationRecord | undefined;
}

export interface ClarificationDeps extends Omit<AgentRunDeps, 'store'> {
  store: ClarificationStore;
  adapter: AgentAdapter | undefined;
  workspace(projectId: string): { root: string; nonGit: boolean };
  refine(request: RefineRequest): Promise<StartResult>;
  aiDisabledReason?(): string | null;
  newId(): string;
  onUpdated?(record: ClarificationRecord): void;
}

const ResultSchema = z.object({
  done: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['question', 'ambiguity', 'alternative', 'assumption']),
        text: z.string().min(1),
        options: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export function parseClarification(resultText: string): z.infer<typeof ResultSchema> | null {
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
  'Report in a final fenced block (do not change any file):',
  '```specforge-result',
  '{"done":false,"items":[{"id":"q1","type":"question|ambiguity|alternative|assumption","text":"…","options":["…"]}]}',
  '```',
  'Set "done": true when nothing important is left open.',
].join('\n');

const answered = (items: readonly ClarificationItem[]) => items.filter((i) => i.answer !== null).map((i) => `- ${i.text} → ${i.answer}`);

export class ClarificationService {
  private readonly active = new Map<string, AgentRun>();
  private readonly rounds = new Map<string, Promise<void>>();

  constructor(private readonly deps: ClarificationDeps) {}

  current(projectId: string, intentPath: string): ClarificationRecord | undefined {
    return this.deps.store.latestClarification(projectId, intentPath);
  }

  /** *Analyse intent*: a new clarification dialogue. */
  async start(projectId: string, intentPath: string): Promise<{ ok: true; clarificationId: string } | { ok: false; reason: string }> {
    const refused = this.refusal();
    if (refused) return { ok: false, reason: refused };
    const record: ClarificationRecord = {
      id: this.deps.newId(),
      projectId,
      intentPath,
      state: 'running',
      sessionId: null,
      items: [],
      lastRunId: null,
      proposalRunId: null,
      reason: null,
      createdAt: this.deps.now(),
    };
    const prompt = [
      `Analyse the intent ${intentPath}. Identify open questions, ambiguities, alternatives the product owner must choose between, and assumptions you would make.`,
      FORMAT,
    ].join('\n\n');
    this.round(record, prompt, null);
    return { ok: true, clarificationId: record.id };
  }

  /** Submits answers; the agent continues in the same session (multi-turn). */
  async answer(id: string, answers: Record<string, string>): Promise<{ ok: true } | { ok: false; reason: string }> {
    const record = this.deps.store.clarification(id);
    if (!record) return { ok: false, reason: `Unknown clarification ${id}.` };
    if (record.state === 'running') return { ok: false, reason: 'The agent is still working on the previous answers.' };
    const refused = this.refusal();
    if (refused) return { ok: false, reason: refused };
    const next = { ...record, items: this.withAnswers(record.items, answers) };
    const given = next.items.filter((i) => answers[i.id] !== undefined).map((i) => `- ${i.text} → ${i.answer}`);
    const prompt = ['The product owner answered:', ...given, '', 'Ask follow-up questions only where needed.', FORMAT].join('\n');
    this.round({ ...next, state: 'running' }, prompt, record.sessionId);
    return { ok: true };
  }

  /** Keeps answers without asking the agent (draft, e.g. after cancelling). */
  async saveDraft(id: string, answers: Record<string, string>): Promise<{ ok: true } | { ok: false; reason: string }> {
    const record = this.deps.store.clarification(id);
    if (!record) return { ok: false, reason: `Unknown clarification ${id}.` };
    this.save({ ...record, items: this.withAnswers(record.items, answers) });
    return { ok: true };
  }

  /** Writes the answers as a "Clarified decisions" section of the intent, proposed for review (UC-008). */
  async finish(id: string): Promise<StartResult> {
    const record = this.deps.store.clarification(id);
    if (!record) return { ok: false, reason: `Unknown clarification ${id}.` };
    if (record.state === 'running') return { ok: false, reason: 'The agent is still working on the previous answers.' };
    const lines = answered(record.items);
    if (lines.length === 0) return { ok: false, reason: 'Answer at least one item first.' };
    const started = await this.deps.refine({
      projectId: record.projectId,
      path: record.intentPath,
      instruction: [
        'Add or update the section "## Clarified decisions" at the end of the intent with these clarified decisions and assumptions (one bullet each, concise, in the intent\'s language):',
        ...lines,
      ].join('\n'),
    });
    if (started.ok) this.save({ ...record, state: 'finished', proposalRunId: started.runId });
    return started;
  }

  /** Cancels the dialogue; the answers given so far are kept as a draft. */
  async cancel(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const record = this.deps.store.clarification(id);
    if (!record) return { ok: false, reason: `Unknown clarification ${id}.` };
    const run = this.active.get(id);
    this.save({ ...record, state: 'cancelled' });
    await run?.cancel();
    return { ok: true };
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.rounds.values()]);
  }

  private refusal(): string | null {
    const disabled = this.deps.aiDisabledReason?.() ?? null;
    if (disabled) return disabled;
    return this.deps.adapter ? null : 'No agent adapter is available to clarify the intent yet.';
  }

  private withAnswers(items: readonly ClarificationItem[], answers: Record<string, string>): ClarificationItem[] {
    return items.map((i) => (answers[i.id] !== undefined ? { ...i, answer: answers[i.id]!.trim() || null } : i));
  }

  private save(record: ClarificationRecord): void {
    this.deps.store.saveClarification(record);
    this.deps.onUpdated?.(record);
  }

  /** One agent turn; its items are added to the dialogue. */
  private round(record: ClarificationRecord, prompt: string, resumeSessionId: string | null): void {
    const { deps } = this;
    const adapter = deps.adapter!;
    const space = deps.workspace(record.projectId);
    const runId = deps.store.createRun(record.projectId, {
      storyId: null,
      kind: 'clarify',
      startKind: null,
      trigger: `Clarify ${record.intentPath}`,
    });
    deps.store.setRunStatus(runId, 'running');
    this.save({ ...record, lastRunId: runId, reason: null });
    const run = runAgent(adapter, deps, {
      runId,
      projectId: record.projectId,
      kind: 'clarify',
      cwd: space.root,
      nonGit: space.nonGit,
      prompt,
      readOnly: true,
      ...(resumeSessionId && adapter.capabilities().resume ? { resumeSessionId } : {}),
    });
    this.active.set(record.id, run);
    const done = run.done
      .then((outcome) => {
        const latest = deps.store.clarification(record.id) ?? record;
        if (latest.state === 'cancelled' || outcome.status === 'cancelled') {
          deps.store.setRunStatus(runId, 'cancelled');
          return;
        }
        if (outcome.status === 'failed') {
          deps.store.setRunStatus(runId, 'failed', outcome.reason);
          this.save({ ...latest, state: 'failed', reason: outcome.reason });
          return;
        }
        const parsed = parseClarification(outcome.resultText);
        if (!parsed) {
          deps.store.setRunStatus(runId, 'completed_no_result', 'The agent returned no valid clarification block.');
          this.save({ ...latest, state: 'failed', reason: 'The agent returned no valid clarification block.' });
          return;
        }
        deps.store.setRunStatus(runId, 'completed');
        const known = new Set(latest.items.map((i) => i.id));
        const items = [...latest.items, ...parsed.items.filter((i) => !known.has(i.id)).map((i) => ({ ...i, answer: null }))];
        this.save({ ...latest, items, sessionId: outcome.sessionId, state: parsed.done ? 'complete' : 'awaiting_answers' });
      })
      .catch((e: unknown) => {
        deps.store.setRunStatus(runId, 'failed', e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        this.active.delete(record.id);
        this.rounds.delete(runId);
      });
    this.rounds.set(runId, done);
  }
}
