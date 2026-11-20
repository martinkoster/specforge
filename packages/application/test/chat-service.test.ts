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
    expect(adapter.requests[0]!.prompt).toMatch(/needs the user's approval/);
    expect(adapter.requests[0]!.prompt).not.toMatch(/read-only/);
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

describe('US-078: the chat context names the specification root', () => {
  it('points the agent to the configured specification folder', async () => {
    const { service, adapter } = setup({ workspace: () => ({ root: '/ws', nonGit: false, specRoot: 'docs/spec' }) });
    const thread = service.createThread('p1', 'Q');
    await service.send(thread.id, 'Where are the requirements?');
    expect(adapter.requests[0]!.prompt).toContain('specifications in docs/spec/');
  });
});

describe('US-098: chat changes are tracked per message (ADR-026)', () => {
  function tracked(changed: { path: string; change: 'A' | 'M' | 'D' }[] = []) {
    const log: string[] = [];
    const saved: ChatChangeRecord[] = [];
    const notified: string[][] = [];
    const blobs = new Map([
      ['b-readme', 'teh\n'],
      ['a-readme', 'the\n'],
    ]);
    const ctx = setup({
      workspace: () => ({ root: '/ws', nonGit: false, specRoot: 'spec' }),
      permissions: { ask: async () => ({ behavior: 'allow' }) },
      baselines: {
        capture: async () => {
          log.push('capture');
          return 'tree-1';
        },
        changes: async (_p, baseline) => {
          log.push(`changes ${baseline}`);
          return changed.map((c) => ({
            ...c,
            beforeRef: c.change === 'A' ? null : `b-${c.path.split('/').pop()!.replace('.md', '').toLowerCase()}`,
            afterRef: c.change === 'D' ? null : `a-${c.path.split('/').pop()!.replace('.md', '').toLowerCase()}`,
          }));
        },
        content: async (_p, ref) => (blobs.has(ref) ? Buffer.from(blobs.get(ref)!) : undefined),
        ignored: async (_p, paths) => paths.filter((p) => p.endsWith('.env')),
      },
      changes: {
        save: (records) => void saved.push(...records),
        byRun: (runId) => saved.filter((c) => c.runId === runId),
        get: (id) => saved.find((c) => c.id === id),
      },
      onChanges: async (_p, records) => void notified.push(records.map((r) => r.path)),
    });
    return { ...ctx, log, saved, notified };
  }

  it('AC-1/AC-2: a baseline is stored before the turn; every changed path becomes a chat change of the message', async () => {
    const { service, adapter, log, saved, messages } = tracked([
      { path: 'README.md', change: 'M' },
      { path: 'spec/02_requirements/fr.md', change: 'M' },
      { path: 'build.log', change: 'A' },
    ]);
    const thread = service.createThread('p1', 'Fixes');
    await service.send(thread.id, 'Fix the typo');
    expect(log).toEqual(['capture']);
    expect(adapter.requests).toHaveLength(1);
    // A shell command changed build.log; a write tool targeted an ignored file.
    await adapter.hooks.onPermission({ toolUseId: 't1', toolName: 'Bash', input: { command: 'npm run build > build.log' }, cwd: '/ws' });
    await adapter.hooks.onPermission({
      toolUseId: 't2',
      toolName: 'Write',
      input: { file_path: '/ws/local.env', content: 'x' },
      cwd: '/ws',
    });
    adapter.answer('Done.');
    await service.idle();

    expect(log).toEqual(['capture', 'changes tree-1']);
    const answer = messages.find((m) => m.role === 'assistant')!;
    expect(answer).toMatchObject({ baselineRef: 'tree-1', untracked: ['local.env'] });
    expect(saved.map((c) => [c.path, c.change, c.isSpec, c.threadId, c.runId])).toEqual([
      ['README.md', 'M', false, thread.id, 'run-1'],
      ['spec/02_requirements/fr.md', 'M', true, thread.id, 'run-1'],
      ['build.log', 'A', false, thread.id, 'run-1'],
    ]);
    expect(
      service
        .messages(thread.id)
        .find((m) => m.role === 'assistant')!
        .changes.map((c) => c.path),
    ).toEqual(['README.md', 'spec/02_requirements/fr.md', 'build.log']);
  });

  it('AC-3: the diff of a change shows the baseline and the new content', async () => {
    const { service, adapter, saved } = tracked([{ path: 'README.md', change: 'M' }]);
    const thread = service.createThread('p1', 'Fixes');
    await service.send(thread.id, 'Fix the typo');
    adapter.answer('Done.');
    await service.idle();
    await expect(service.changeDiff(saved[0]!.id)).resolves.toEqual({ path: 'README.md', before: 'teh\n', after: 'the\n' });
    await expect(service.changeDiff('nope')).rejects.toThrow('nope');
  });

  it('AC-4: the changes are handed on (spec files → Draft and impact flags, code → activity); no changes, no notice', async () => {
    const a = tracked([{ path: 'spec/02_requirements/fr.md', change: 'M' }]);
    const thread = a.service.createThread('p1', 'T');
    await a.service.send(thread.id, 'Change FR-001');
    a.adapter.answer('Done.');
    await a.service.idle();
    expect(a.notified).toEqual([['spec/02_requirements/fr.md']]);

    const b = tracked([]);
    const other = b.service.createThread('p1', 'T');
    await b.service.send(other.id, 'Just a question');
    b.adapter.answer('Answer.');
    await b.service.idle();
    expect(b.notified).toEqual([]);
    expect(b.saved).toEqual([]);
  });
});

describe('US-099: revert chat changes', () => {
  function reverting() {
    const files = new Map<string, string>([
      ['README.md', 'the\n'],
      ['docs/new.md', 'new\n'],
    ]);
    const blobs = new Map([
      ['b-readme', 'teh\n'],
      ['a-readme', 'the\n'],
      ['a-new', 'new\n'],
      ['b-old', 'old\n'],
    ]);
    const saved: ChatChangeRecord[] = [];
    const reverted: string[] = [];
    const base = { projectId: 'p1', threadId: 't1', runId: 'run-1', isSpec: false, revertedAt: null, createdAt: 't' };
    saved.push(
      { ...base, id: 'c1', path: 'README.md', change: 'M', beforeRef: 'b-readme', afterRef: 'a-readme' },
      { ...base, id: 'c2', path: 'docs/new.md', change: 'A', beforeRef: null, afterRef: 'a-new' },
      { ...base, id: 'c3', path: 'src/old.ts', change: 'D', beforeRef: 'b-old', afterRef: null },
    );
    const ctx = setup({
      baselines: {
        capture: async () => 'tree',
        changes: async () => [],
        content: async (_p, ref) => (blobs.has(ref) ? Buffer.from(blobs.get(ref)!) : undefined),
        ignored: async () => [],
      },
      changes: {
        save: (r) => void saved.push(...r),
        byRun: (runId) => saved.filter((c) => c.runId === runId),
        get: (id) => saved.find((c) => c.id === id),
        setReverted: (id, at) => {
          const c = saved.find((x) => x.id === id)!;
          c.revertedAt = at;
        },
      },
      files: () => ({
        read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
        writeAtomic: async (path, content) => {
          files.set(path, content);
          return 'h';
        },
        remove: async (path) => void files.delete(path),
      }),
      onReverted: async (_p, records) => void reverted.push(...records.map((r) => r.path)),
    });
    return { ...ctx, files, saved, reverted };
  }

  it('AC-1/AC-3: reverting a message restores modified and deleted files, removes added ones and records it', async () => {
    const { service, files, saved, reverted } = reverting();
    await expect(service.revert({ runId: 'run-1' })).resolves.toEqual({ reverted: ['README.md', 'docs/new.md', 'src/old.ts'] });
    expect(files.get('README.md')).toBe('teh\n');
    expect(files.has('docs/new.md')).toBe(false);
    expect(files.get('src/old.ts')).toBe('old\n');
    expect(saved.every((c) => c.revertedAt !== null)).toBe(true);
    expect(reverted).toEqual(['README.md', 'docs/new.md', 'src/old.ts']);
    await expect(service.revert({ runId: 'run-1' })).resolves.toEqual({ reverted: [] });
  });

  it('AC-1: a single file can be reverted', async () => {
    const { service, files, saved } = reverting();
    await service.revert({ changeId: 'c2' });
    expect(files.has('docs/new.md')).toBe(false);
    expect(files.get('README.md')).toBe('the\n');
    expect(saved.filter((c) => c.revertedAt).map((c) => c.id)).toEqual(['c2']);
  });

  it('AC-2: a file changed since the message needs confirmation, with the three versions for a 3-way diff', async () => {
    const { service, files } = reverting();
    files.set('README.md', 'the\nedited later\n');
    await expect(service.revert({ changeId: 'c1' })).resolves.toEqual({
      needsConfirmation: [{ changeId: 'c1', path: 'README.md', baseline: 'teh\n', chat: 'the\n', current: 'the\nedited later\n' }],
    });
    expect(files.get('README.md')).toBe('the\nedited later\n');
    await expect(service.revert({ changeId: 'c1', confirm: true })).resolves.toEqual({ reverted: ['README.md'] });
    expect(files.get('README.md')).toBe('teh\n');
  });
});

describe('US-100 AC-1: the agent may suggest new functionality as a feature', () => {
  it('the chat context asks for a "feature" recommendation with a summary; it is kept on the answer', async () => {
    const { service, adapter, messages } = setup();
    const thread = service.createThread('p1', 'Ideas');
    await service.send(thread.id, 'Could users comment on tasks?');
    expect(adapter.requests[0]!.prompt).toContain('"type":"feature"');
    adapter.answer(
      'Yes, that would be new.\n```specforge-result\n{"recommendations":[{"type":"feature","text":"Users comment on tasks and mention teammates."}]}\n```\n',
    );
    await service.idle();
    expect(messages.find((m) => m.role === 'assistant')!.recommendations).toEqual([
      { type: 'feature', text: 'Users comment on tasks and mention teammates.' },
    ]);
  });
});
