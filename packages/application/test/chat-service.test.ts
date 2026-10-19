// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ChatService,
  splitChatAnswer,
  type AgentAdapter,
  type AgentOutcome,
  type ChatDeps,
  type ChatMessage,
  type ChatThread,
  type PermissionRunContext,
  type RunHooks,
  type RunRequest,
} from '../src/index.js';

class ScriptedAdapter implements AgentAdapter {
  readonly type = 'scripted';
  requests: RunRequest[] = [];
  hooks!: RunHooks;
  private finish!: (outcome: AgentOutcome) => void;
  capabilities() {
    return { resume: true, permissionRelay: true, structuredResult: true, models: [] };
  }
  async detect() {
    return { found: true };
  }
  async verify() {
    return { ok: true };
  }
  start(request: RunRequest, hooks: RunHooks) {
    this.requests.push(request);
    this.hooks = hooks;
    const done = new Promise<AgentOutcome>((resolve) => (this.finish = resolve));
    return { sessionId: Promise.resolve('chat-session'), done, cancel: async () => this.finish({ status: 'cancelled' }) };
  }
  answer(text: string) {
    this.finish({ status: 'completed', sessionId: 'chat-session', resultText: text });
  }
}

function setup(overrides: Partial<ChatDeps> = {}) {
  const adapter = new ScriptedAdapter();
  const threads = new Map<string, ChatThread>();
  const messages: ChatMessage[] = [];
  const asked: PermissionRunContext[] = [];
  const emitted: string[] = [];
  let ids = 0;
  let runs = 0;
  const deps: ChatDeps = {
    store: {
      createRun: () => `run-${++runs}`,
      setRunStatus: () => undefined,
      markStarted: () => undefined,
      setSessionId: () => undefined,
      appendEvents: () => undefined,
      saveThread: (t) => void threads.set(t.id, { ...t }),
      thread: (id) => threads.get(id),
      threads: (projectId) => [...threads.values()].filter((t) => t.projectId === projectId),
      addMessage: (m) => void messages.push({ ...m }),
      messages: (threadId) => messages.filter((m) => m.threadId === threadId),
    },
    adapter,
    workspace: () => ({ root: '/ws', nonGit: false }),
    env: async () => ({ env: {}, secrets: [] }),
    config: () => ({ maxRunDurationS: 3600, idleTimeoutS: 600, agent: {} }),
    permissions: {
      ask: async (run) => {
        asked.push(run);
        return { behavior: 'deny', message: 'The project chat is read-only in this release.' };
      },
    },
    implementationActive: () => false,
    emit: (_runId, event) => void emitted.push(event.type === 'output' ? event.text : event.type),
    newId: () => `id${++ids}`,
    now: () => `2026-10-16T10:00:0${ids}.000Z`,
    ...overrides,
  };
  return { service: new ChatService(deps), adapter, threads, messages, asked, emitted };
}

describe('US-062 AC-1/AC-2: threads as resumable agent sessions', () => {
  it('creates threads, sends a message as a chat run in the main workspace with project context and stores the answer', async () => {
    const { service, adapter, asked, emitted } = setup();
    const thread = service.createThread('p1', 'Architecture questions');
    expect(service.threads('p1')).toEqual([expect.objectContaining({ id: thread.id, title: 'Architecture questions', sessionId: null })]);

    await expect(service.send(thread.id, 'Which stories touch the login?')).resolves.toEqual({ ok: true, runId: 'run-1' });
    expect(adapter.requests[0]).toMatchObject({ kind: 'chat', cwd: '/ws' });
    expect(adapter.requests[0]!.prompt).toContain('Which stories touch the login?');
    expect(adapter.requests[0]!.prompt).toMatch(/read-only/);
    expect(adapter.requests[0]!.resumeSessionId).toBeUndefined();

    adapter.hooks.onEvent({ type: 'output', text: 'US-001 and US-004.' });
    adapter.hooks.onEvent({ type: 'tool_use', toolUseId: 't1', toolName: 'Grep', input: { pattern: 'login' } });
    await adapter.hooks.onPermission({ toolUseId: 't2', toolName: 'Write', input: { file_path: 'x' }, cwd: '/ws' });
    adapter.answer('US-001 and US-004.');
    await service.idle();

    expect(asked[0]).toMatchObject({ runKind: 'chat' });
    expect(emitted).toContain('US-001 and US-004.');
    expect(service.messages(thread.id)).toEqual([
      expect.objectContaining({ role: 'user', content: 'Which stories touch the login?' }),
      expect.objectContaining({
        role: 'assistant',
        content: 'US-001 and US-004.\n\nSpecForge denied 1 request: The project chat is read-only in this release.',
        toolUses: ['Grep {"pattern":"login"}'],
        recommendations: [],
        runId: 'run-1',
      }),
    ]);
    expect(service.threads('p1')[0]!.sessionId).toBe('chat-session');
  });

  it('later messages resume the thread session', async () => {
    const { service, adapter } = setup();
    const thread = service.createThread('p1', 'T');
    await service.send(thread.id, 'First');
    adapter.answer('One.');
    await service.idle();
    await service.send(thread.id, 'Second');
    expect(adapter.requests[1]!.resumeSessionId).toBe('chat-session');
    await expect(service.send(thread.id, 'Third')).resolves.toEqual({ ok: false, reason: 'The agent is still answering in this thread.' });
  });
});

describe('US-062 AC-3: proposed transitions only as recommendation cards', () => {
  it('splits recommendations from the answer', () => {
    expect(
      splitChatAnswer(
        'Start US-002 next.\n```specforge-result\n{"recommendations":[{"type":"start_story","storyId":"US-002","text":"Move US-002 to In Progress"}]}\n```\n',
      ),
    ).toEqual({
      content: 'Start US-002 next.',
      recommendations: [{ type: 'start_story', storyId: 'US-002', text: 'Move US-002 to In Progress' }],
    });
    expect(splitChatAnswer('Plain answer.')).toEqual({ content: 'Plain answer.', recommendations: [] });
    expect(splitChatAnswer('Bad.\n```specforge-result\n{nope}\n```')).toEqual({ content: 'Bad.', recommendations: [] });
  });

  it('stores recommendations with the answer (nothing is executed)', async () => {
    const { service, adapter } = setup();
    const thread = service.createThread('p1', 'T');
    await service.send(thread.id, 'What next?');
    adapter.answer(
      'Approve US-003.\n```specforge-result\n{"recommendations":[{"type":"approve_story","storyId":"US-003","text":"Approve US-003"}]}\n```',
    );
    await service.idle();
    expect(service.messages(thread.id).at(-1)).toMatchObject({ content: 'Approve US-003.', recommendations: [{ storyId: 'US-003' }] });
  });

  it('denied write requests are explained in the answer and marked in the tool uses', async () => {
    const { service, adapter } = setup();
    const thread = service.createThread('p1', 'T');
    await service.send(thread.id, 'Fix the typo in FR-001.');
    adapter.hooks.onEvent({ type: 'tool_use', toolUseId: 't1', toolName: 'Edit', input: { file_path: 'spec/fr.md' } });
    await adapter.hooks.onPermission({ toolUseId: 't1', toolName: 'Edit', input: { file_path: 'spec/fr.md' }, cwd: '/ws' });
    adapter.answer('I could not change the file.');
    await service.idle();
    const answer = service.messages(thread.id).at(-1)!;
    expect(answer.content).toBe(
      'I could not change the file.\n\nSpecForge denied 1 request: The project chat is read-only in this release.',
    );
    expect(answer.toolUses).toEqual(['Edit {"file_path":"spec/fr.md"} — denied']);
  });
});

describe('US-062 AC-4: limited mode', () => {
  it('refuses messages while AI functions are disabled or without an adapter; unknown threads are refused', async () => {
    const limited = setup({ aiDisabledReason: () => 'AI functions are disabled.' });
    const thread = limited.service.createThread('p1', 'T');
    await expect(limited.service.send(thread.id, 'Hi')).resolves.toEqual({ ok: false, reason: 'AI functions are disabled.' });
    await expect(setup({ adapter: undefined }).service.send('x', 'Hi')).resolves.toMatchObject({ ok: false });
    await expect(setup().service.send('nope', 'Hi')).resolves.toEqual({ ok: false, reason: 'Unknown chat thread nope.' });
  });

  it('a failed answer is stored as an error message', async () => {
    const { service, adapter } = setup();
    const thread = service.createThread('p1', 'T');
    await service.send(thread.id, 'Hi');
    (adapter as unknown as { finish: (o: AgentOutcome) => void }).finish({ status: 'failed', reason: 'Agent crashed' });
    await service.idle();
    expect(service.messages(thread.id).at(-1)).toMatchObject({
      role: 'assistant',
      content: 'The agent could not answer: Agent crashed',
      error: true,
    });
  });
});
