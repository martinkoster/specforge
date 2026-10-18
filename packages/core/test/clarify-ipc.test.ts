// SPDX-License-Identifier: Apache-2.0
// US-028 integration: intent template, multi-turn clarification in one agent session, Clarified decisions proposal.
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
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

const INTENT = 'spec/01_intent/intent.md';
const block = (value: unknown) => `\`\`\`specforge-result\n${JSON.stringify(value)}\n\`\`\`\n`;

describe('US-028 over IPC', () => {
  it('AC-1..AC-3: template, questions, answers in the same session, Clarified decisions proposal', async () => {
    const requests: RunRequest[] = [];
    const script = (request: RunRequest): MockStep[] => {
      requests.push(request);
      if (request.kind === 'clarify' && !request.resumeSessionId) {
        return [{ type: 'result', text: block({ done: false, items: [{ id: 'q1', type: 'question', text: 'Who are the users?' }] }) }];
      }
      if (request.kind === 'clarify') return [{ type: 'result', text: block({ done: true, items: [] }) }];
      const current = readFileSync(join(request.cwd, INTENT), 'utf8');
      return [
        {
          type: 'tool',
          toolName: 'Write',
          input: { file_path: INTENT, content: `${current}\n## Clarified decisions\n- Users: product owners\n` },
        },
        { type: 'result', text: 'Added.' },
      ];
    };
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-clarify-app-')),
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
    const client = await connectClient(wrap(port1));
    client.subscribe(
      'permission.requested',
      (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
    );

    const project = await client.command('projects.create', {
      name: 'C',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-clarify-ws-')),
      folderName: 'c',
      initGit: false,
    });
    await client.command('projects.openById', { projectId: project.id });

    await expect(client.command('intent.create', { projectId: project.id })).resolves.toEqual({ path: INTENT });
    expect(readFileSync(join(project.path, INTENT), 'utf8')).toContain('## Vision');
    await expect(client.command('intent.create', { projectId: project.id })).rejects.toThrow(/already exists/);

    const started = await client.command('clarify.start', { projectId: project.id, path: INTENT });
    expect(started).toMatchObject({ ok: true });
    const id = (started as { clarificationId: string }).clarificationId;
    await vi.waitFor(
      async () => expect((await client.query('clarify.current', { projectId: project.id, path: INTENT }))?.state).toBe('awaiting_answers'),
      { timeout: 30_000 },
    );

    await expect(client.command('clarify.answer', { clarificationId: id, answers: { q1: 'Product owners' } })).resolves.toEqual({
      ok: true,
    });
    await vi.waitFor(
      async () => expect((await client.query('clarify.current', { projectId: project.id, path: INTENT }))?.state).toBe('complete'),
      { timeout: 30_000 },
    );
    expect(requests[1]!.resumeSessionId).toBeTruthy();

    const proposal = await client.command('clarify.finish', { clarificationId: id });
    expect(proposal).toMatchObject({ ok: true });
    const runId = (proposal as { runId: string }).runId;
    await vi.waitFor(async () => expect((await client.query('specs.review', { runId }))?.state).toBe('open'), { timeout: 30_000 });
    await client.command('specs.keep', { runId });
    expect(readFileSync(join(project.path, INTENT), 'utf8')).toContain('## Clarified decisions');
  });
});
