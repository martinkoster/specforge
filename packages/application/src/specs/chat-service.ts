// SPDX-License-Identifier: Apache-2.0
// Project chat (US-062, UC-035, ADR-016, FR-089/FR-091/FR-092): each thread is a resumable `chat` agent session in the
// main workspace with project context; writes go through the permission relay (US-097); proposed story transitions or
// run starts are only shown as recommendation cards.
import { specLayout } from '@specforge/domain';
import { z } from 'zod';
import type { AgentAdapter, AgentEvent } from '../ports/agent-adapter.js';
import type { NewRun, RunStatus } from '../scheduling/ports.js';
import { runAgent, type AgentRunDeps, type AgentRunStore } from './agent-run.js';

export interface ChatThread {
  id: string;
  projectId: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRecommendation {
  type: string;
  storyId?: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  runId: string | null;
  toolUses: string[];
  recommendations: ChatRecommendation[];
  error: boolean;
  createdAt: string;
  /** Workspace baseline before the agent turn (US-098, ADR-026): git tree SHA or snapshot id. */
  baselineRef?: string | null;
  /** Files a write tool changed that are not tracked (ignored by Git or excluded from snapshots). */
  untracked?: string[];
}

/** A file the chat changed in one agent turn (US-098, data_model chat_change). */
export interface ChatChangeRecord {
  id: string;
  projectId: string;
  threadId: string;
  runId: string;
  path: string;
  change: 'A' | 'M' | 'D';
  /** Content in the baseline (git blob / snapshot object); null for added files. */
  beforeRef: string | null;
  /** Content after the turn; null for deleted files. */
  afterRef: string | null;
  /** Specification content (spec root or .specforge). */
  isSpec: boolean;
  revertedAt: string | null;
  createdAt: string;
}

/** Workspace baselines for chat changes (ADR-026): git temporary-index trees or non-git snapshots. */
export interface WorkspaceBaselines {
  capture(projectId: string): Promise<string>;
  changes(
    projectId: string,
    baseline: string,
  ): Promise<{ path: string; change: 'A' | 'M' | 'D'; beforeRef: string | null; afterRef: string | null }[]>;
  content(projectId: string, ref: string): Promise<Buffer | undefined>;
  /** The paths that are not tracked (ignored / excluded). */
  ignored(projectId: string, paths: readonly string[]): Promise<string[]>;
}

export type ChatMessageView = ChatMessage & { changes: ChatChangeRecord[] };

export interface ChatStore extends AgentRunStore {
  createRun(projectId: string, run: NewRun): string;
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
  saveThread(thread: ChatThread): void;
  thread(id: string): ChatThread | undefined;
  threads(projectId: string): ChatThread[];
  addMessage(message: ChatMessage): void;
  messages(threadId: string): ChatMessage[];
}

export interface ChatDeps extends Omit<AgentRunDeps, 'store'> {
  store: ChatStore;
  adapter: AgentAdapter | undefined;
  workspace(projectId: string): { root: string; nonGit: boolean; specRoot?: string };
  aiDisabledReason?(): string | null;
  newId(): string;
  /** A thread got a new message (UI refresh). */
  onMessage?(message: ChatMessage, projectId: string): void;
  /** US-098: baselines before write-capable turns; without them changes are not tracked. */
  baselines?: WorkspaceBaselines;
  changes?: {
    save(records: ChatChangeRecord[]): void;
    byRun(runId: string): ChatChangeRecord[];
    get(id: string): ChatChangeRecord | undefined;
    /** US-099 AC-3: the change was reverted. */
    setReverted?(id: string, at: string): void;
  };
  /** Workspace files for reverts (US-099). */
  files?(projectId: string): {
    read(path: string): Promise<{ content: string; hash: string } | undefined>;
    writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string>;
    remove(path: string): Promise<void>;
  };
  /** US-099 AC-3: reverted files are re-indexed and appear in the activity feed. */
  onReverted?(projectId: string, records: readonly ChatChangeRecord[]): Promise<void>;
  /** US-098 AC-4: changed spec files become Draft and re-index (impact flags); code changes go to the activity feed. */
  onChanges?(projectId: string, records: readonly ChatChangeRecord[], runId: string): Promise<void>;
}

const Recommendations = z.object({
  recommendations: z.array(z.object({ type: z.string().min(1), storyId: z.string().optional(), text: z.string().min(1) })).default([]),
});

/** Separates the visible answer from the fenced `specforge-result` block with recommendations. */
export function splitChatAnswer(text: string): { content: string; recommendations: ChatRecommendation[] } {
  const blocks = [...text.matchAll(/```specforge-result\s*\n([\s\S]*?)```/g)];
  const content = text.replace(/```specforge-result\s*\n[\s\S]*?```/g, '').trim();
  const last = blocks.at(-1)?.[1];
  if (!last) return { content, recommendations: [] };
  try {
    const parsed = Recommendations.safeParse(JSON.parse(last));
    return { content, recommendations: parsed.success ? parsed.data.recommendations : [] };
  } catch {
    return { content, recommendations: [] };
  }
}

const context = (specRoot: string): string =>
  [
    `You are the SpecForge project assistant. The current directory is the project workspace: specifications in ${specRoot}/`,
    '(intent, requirements, design, user stories and epics), code elsewhere. You may change specifications and code: every file',
    "change and shell command needs the user's approval in SpecForge, and changed specifications become Draft. You cannot move",
    'stories, change story status or start runs; if you recommend one, add a final block:',
    '```specforge-result',
    '{"recommendations":[{"type":"start_story|approve_story|reject_story|other","storyId":"US-001","text":"…"}]}',
    '```',
    'If the conversation describes new functionality that is not specified yet, recommend a feature intent with a short',
    'summary of it: {"type":"feature","text":"<summary>"} (the user decides whether to create it).',
  ].join('\n');

/** Workspace-relative POSIX path of a tool's file argument. */
function relativePath(root: string, path: string): string {
  const p = path.replace(/\\/g, '/');
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '');
  return p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : p.replace(/^\.\//, '');
}

export class ChatService {
  private readonly active = new Map<string, Promise<void>>();

  constructor(private readonly deps: ChatDeps) {}

  createThread(projectId: string, title: string): ChatThread {
    const now = this.deps.now();
    const thread: ChatThread = {
      id: this.deps.newId(),
      projectId,
      title: title.trim() || 'New thread',
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.deps.store.saveThread(thread);
    return thread;
  }

  threads(projectId: string): ChatThread[] {
    return this.deps.store.threads(projectId).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  messages(threadId: string): ChatMessageView[] {
    return this.deps.store
      .messages(threadId)
      .map((m) => ({ ...m, changes: m.runId && m.role === 'assistant' ? (this.deps.changes?.byRun(m.runId) ?? []) : [] }));
  }

  /**
   * US-099: restores the baseline content of a message's changes (`runId`) or of one file (`changeId`): modified and
   * deleted files are rewritten, added files removed. Files changed since the message need `confirm` (AC-2).
   */
  async revert(
    target: { runId: string; confirm?: boolean } | { changeId: string; confirm?: boolean },
  ): Promise<
    { reverted: string[] } | { needsConfirmation: { changeId: string; path: string; baseline: string; chat: string; current: string }[] }
  > {
    const { changes, baselines, files } = this.deps;
    if (!changes || !baselines || !files) throw new Error('Chat changes cannot be reverted here.');
    const selected =
      'runId' in target
        ? changes.byRun(target.runId)
        : [changes.get(target.changeId)].filter((c): c is ChatChangeRecord => c !== undefined);
    if ('changeId' in target && selected.length === 0) throw new Error(`Unknown chat change ${target.changeId}.`);
    const open = selected.filter((c) => c.revertedAt === null);
    if (open.length === 0) return { reverted: [] };
    const projectId = open[0]!.projectId;
    const workspace = files(projectId);
    const text = async (ref: string | null) =>
      ref === null ? null : ((await baselines.content(projectId, ref))?.toString('utf8') ?? null);
    const plan = [];
    for (const change of open) {
      const current = await workspace.read(change.path);
      plan.push({ change, current, before: await text(change.beforeRef), after: await text(change.afterRef) });
    }
    const changedSince = plan.filter((p) => (p.current?.content ?? null) !== p.after);
    if (changedSince.length > 0 && !target.confirm) {
      return {
        needsConfirmation: changedSince.map((p) => ({
          changeId: p.change.id,
          path: p.change.path,
          baseline: p.before ?? '',
          chat: p.after ?? '',
          current: p.current?.content ?? '',
        })),
      };
    }
    const at = this.deps.now();
    for (const p of plan) {
      if (p.before === null) {
        if (p.current) await workspace.remove(p.change.path);
      } else {
        await workspace.writeAtomic(p.change.path, p.before, { expectedHash: p.current?.hash ?? null });
      }
      changes.setReverted?.(p.change.id, at);
    }
    await this.deps.onReverted?.(projectId, open);
    return { reverted: open.map((c) => c.path) };
  }

  /** US-098 AC-3: the baseline and the new content of one changed file. */
  async changeDiff(changeId: string): Promise<{ path: string; before: string | null; after: string | null }> {
    const change = this.deps.changes?.get(changeId);
    const baselines = this.deps.baselines;
    if (!change || !baselines) throw new Error(`Unknown chat change ${changeId}.`);
    const read = async (ref: string | null) =>
      ref === null ? null : ((await baselines.content(change.projectId, ref))?.toString('utf8') ?? null);
    return { path: change.path, before: await read(change.beforeRef), after: await read(change.afterRef) };
  }

  async send(threadId: string, text: string): Promise<{ ok: true; runId: string } | { ok: false; reason: string }> {
    const { deps } = this;
    const disabled = deps.aiDisabledReason?.() ?? null;
    if (disabled) return { ok: false, reason: disabled };
    const adapter = deps.adapter;
    if (!adapter) return { ok: false, reason: 'No agent adapter is available for the chat yet.' };
    const thread = deps.store.thread(threadId);
    if (!thread) return { ok: false, reason: `Unknown chat thread ${threadId}.` };
    if (this.active.has(threadId)) return { ok: false, reason: 'The agent is still answering in this thread.' };

    this.add(thread, { role: 'user', content: text, runId: null, toolUses: [], recommendations: [], error: false });
    const space = deps.workspace(thread.projectId);
    // US-098 AC-1: the workspace before the turn (a failed capture means the turn's changes are not tracked).
    this.active.set(threadId, Promise.resolve());
    const baselineRef = deps.baselines ? await deps.baselines.capture(thread.projectId).catch(() => null) : null;
    /** Files allowed write tools targeted (ignored ones are reported as not tracked). */
    const written = new Set<string>();
    const runId = deps.store.createRun(thread.projectId, { storyId: null, kind: 'chat', startKind: null, trigger: `Chat ${threadId}` });
    deps.store.setRunStatus(runId, 'running');
    const toolUses: Array<{ id: string; text: string; denied: boolean }> = [];
    /** AC-3: why requests were denied (shown with the answer). */
    const denials: string[] = [];
    const resume = thread.sessionId && adapter.capabilities().resume ? thread.sessionId : null;
    const run = runAgent(
      adapter,
      {
        ...deps,
        emit: (id: string, event: AgentEvent, seq: number) => {
          if (event.type === 'tool_use') {
            toolUses.push({ id: event.toolUseId, text: `${event.toolName} ${JSON.stringify(event.input ?? {})}`, denied: false });
          }
          deps.emit?.(id, event, seq);
        },
        permissions: {
          ask: async (context, ask) => {
            const answer = await deps.permissions.ask(context, ask);
            const target = ask.input.file_path ?? ask.input.notebook_path;
            if (answer.behavior === 'allow' && typeof target === 'string') written.add(relativePath(space.root, target));
            if (answer.behavior === 'deny') {
              denials.push(answer.message);
              for (const use of toolUses) if (use.id === ask.toolUseId) use.denied = true;
            }
            return answer;
          },
        },
      },
      {
        runId,
        projectId: thread.projectId,
        kind: 'chat',
        cwd: space.root,
        nonGit: space.nonGit,
        prompt: resume ? text : `${context(specLayout(space.specRoot).root)}\n\n${text}`,
        ...(resume ? { resumeSessionId: resume } : {}),
      },
    );
    const toolLines = () => toolUses.map((t) => (t.denied ? `${t.text} — denied` : t.text));
    const withDenials = (content: string) =>
      denials.length === 0
        ? content
        : `${content}\n\nSpecForge denied ${denials.length} request${denials.length === 1 ? '' : 's'}: ${[...new Set(denials)].join(' ')}`;
    const track = async (): Promise<{ baselineRef: string | null; untracked: string[] }> => {
      if (!baselineRef || !deps.baselines) return { baselineRef, untracked: [] };
      const projectId = thread.projectId;
      const changed = await deps.baselines.changes(projectId, baselineRef);
      const paths = new Set(changed.map((c) => c.path));
      const untracked = await deps.baselines.ignored(
        projectId,
        [...written].filter((p) => !paths.has(p)),
      );
      if (changed.length > 0) {
        const layout = specLayout(space.specRoot);
        const records: ChatChangeRecord[] = changed.map((c) => ({
          ...c,
          id: deps.newId(),
          projectId,
          threadId,
          runId,
          isSpec: layout.isSpecPath(c.path),
          revertedAt: null,
          createdAt: deps.now(),
        }));
        deps.changes?.save(records);
        await deps.onChanges?.(projectId, records, runId);
      }
      return { baselineRef, untracked };
    };
    const done = run.done
      .then(async (outcome) => {
        const tracked = await track().catch(() => ({ baselineRef, untracked: [] as string[] }));
        const latest = deps.store.thread(threadId) ?? thread;
        if (outcome.status === 'completed') {
          deps.store.setRunStatus(runId, 'completed');
          const { content, recommendations } = splitChatAnswer(outcome.resultText);
          deps.store.saveThread({ ...latest, sessionId: outcome.sessionId, updatedAt: deps.now() });
          this.add(latest, {
            role: 'assistant',
            content: withDenials(content),
            runId,
            toolUses: toolLines(),
            recommendations,
            error: false,
            ...tracked,
          });
          return;
        }
        const reason = outcome.status === 'failed' ? outcome.reason : 'The answer was cancelled.';
        deps.store.setRunStatus(runId, outcome.status === 'failed' ? 'failed' : 'cancelled', reason);
        this.add(latest, {
          role: 'assistant',
          content: withDenials(`The agent could not answer: ${reason}`),
          runId,
          toolUses: toolLines(),
          recommendations: [],
          error: true,
          ...tracked,
        });
      })
      .catch((e: unknown) => deps.store.setRunStatus(runId, 'failed', e instanceof Error ? e.message : String(e)))
      .finally(() => this.active.delete(threadId));
    this.active.set(threadId, done);
    return { ok: true, runId };
  }

  /** The agent is answering in this thread. */
  isAnswering(threadId: string): boolean {
    return this.active.has(threadId);
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.active.values()]);
  }

  private add(thread: ChatThread, message: Omit<ChatMessage, 'id' | 'threadId' | 'createdAt'>): void {
    const full: ChatMessage = { ...message, id: this.deps.newId(), threadId: thread.id, createdAt: this.deps.now() };
    this.deps.store.addMessage(full);
    this.deps.onMessage?.(full, thread.projectId);
  }
}
