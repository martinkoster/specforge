// SPDX-License-Identifier: Apache-2.0
// US-062 integration: chat threads as resumable read-only agent sessions that survive restarts.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { RunRequest } from '@specforge/application';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

describe('US-062 over IPC', () => {
  it('AC-1..AC-3: read-only answers with recommendation cards; threads and sessions survive a restart', async () => {
    const requests: RunRequest[] = [];
    const script = (request: RunRequest): MockStep[] => {
      requests.push(request);
      return [
        { type: 'tool', toolName: 'Write', input: { file_path: 'hacked.txt', content: 'no' } },
        { type: 'output', text: 'Start US-002 next.' },
        {
          type: 'result',
          text: 'Start US-002 next.\n```specforge-result\n{"recommendations":[{"type":"start_story","storyId":"US-002","text":"Move US-002 to In Progress"}]}\n```\n',
        },
      ];
    };
    const appDataDir = mkdtempSync(join(tmpdir(), 'sf-chat-app-'));
    const boot = async () => {
      const core = await createCore({
        appDataDir,
        platform: process.platform,
        pid: process.pid,
        testMode: false,
        exit: () => undefined,
        watch: false,
        agentAdapter: new MockAdapter({ script }),
      });
      open.push(core);
      const { port1, port2 } = new MessageChannel();
      const server = serveContract(wrap(port2), core.handlers);
      core.setEmitter((name, payload) => server.emit(name, payload as never));
      return { core, client: await connectClient(wrap(port1)) };
    };

    const first = await boot();
    const project = await first.client.command('projects.create', {
      name: 'Chat',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-chat-ws-')),
      folderName: 'chat',
      initGit: false,
    });
    await first.client.command('projects.openById', { projectId: project.id });
    const thread = await first.client.command('chat.createThread', { projectId: project.id, title: 'Planning' });
    await expect(first.client.command('chat.send', { threadId: thread.id, text: 'What should I do next?' })).resolves.toMatchObject({
      ok: true,
    });
    await vi.waitFor(async () => expect(await first.client.query('chat.messages', { threadId: thread.id })).toHaveLength(2), {
      timeout: 30_000,
    });

    const [question, answer] = await first.client.query('chat.messages', { threadId: thread.id });
    expect(question).toMatchObject({ role: 'user', content: 'What should I do next?' });
    expect(answer).toMatchObject({
      role: 'assistant',
      content: expect.stringMatching(/^Start US-002 next\.\n\nSpecForge denied 1 request: The project chat is read-only/),
      toolUses: ['Write {"file_path":"hacked.txt","content":"no"} — denied'],
      recommendations: [{ type: 'start_story', storyId: 'US-002', text: 'Move US-002 to In Progress' }],
    });
    expect(existsSync(join(project.path, 'hacked.txt'))).toBe(false);
    expect(requests[0]!.prompt).toMatch(/read-only/);
    await first.core.close();
    open.splice(0);

    const second = await boot();
    await second.client.command('projects.openById', { projectId: project.id });
    expect(await second.client.query('chat.threads', { projectId: project.id })).toEqual([
      expect.objectContaining({ id: thread.id, title: 'Planning', active: false }),
    ]);
    await second.client.command('chat.send', { threadId: thread.id, text: 'And after that?' });
    await vi.waitFor(async () => expect(await second.client.query('chat.messages', { threadId: thread.id })).toHaveLength(4), {
      timeout: 30_000,
    });
    expect(requests[1]!.resumeSessionId).toBeTruthy();
  });
});
