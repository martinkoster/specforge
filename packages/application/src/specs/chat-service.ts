// SPDX-License-Identifier: Apache-2.0
// Read-only project chat (US-062, UC-035, ADR-016, FR-089/FR-092): each thread is a resumable `chat` agent session
// in the main workspace with project context; writes are denied by the built-in policy; proposed story transitions or
// run starts are only shown as recommendation cards.
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
}

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
  workspace(projectId: string): { root: string; nonGit: boolean };
  aiDisabledReason?(): string | null;
  newId(): string;
  /** A thread got a new message (UI refresh). */
  onMessage?(message: ChatMessage, projectId: string): void;
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

const CONTEXT = [
  'You are the SpecForge project assistant. The current directory is the project workspace: specifications in spec/',
  '(intent, requirements, design, user stories and epics), code elsewhere. This chat is read-only: do not change files or run',
  'shell commands (such requests are denied). You cannot move stories or start runs; if you recommend one, add a final block:',
  '```specforge-result',
  '{"recommendations":[{"type":"start_story|approve_story|reject_story|other","storyId":"US-001","text":"…"}]}',
  '```',
].join('\n');

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

  messages(threadId: string): ChatMessage[] {
    return this.deps.store.messages(threadId);
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
        prompt: resume ? text : `${CONTEXT}\n\n${text}`,
        ...(resume ? { resumeSessionId: resume } : {}),
      },
    );
    const toolLines = () => toolUses.map((t) => (t.denied ? `${t.text} — denied` : t.text));
    const withDenials = (content: string) =>
      denials.length === 0
        ? content
        : `${content}\n\nSpecForge denied ${denials.length} request${denials.length === 1 ? '' : 's'}: ${[...new Set(denials)].join(' ')}`;
    const done = run.done
      .then((outcome) => {
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
