// SPDX-License-Identifier: Apache-2.0
// US-038 / US-042 integration: board moves through the core write the story file, persist order and drive the scheduler.
import { MockAdapter } from '@specforge/agent-mock';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore, type Core } from '../src/index.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function boot(appDataDir: string): Promise<{ core: Core; client: ContractClient }> {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({ script: () => [{ type: 'fail', reason: 'Agent crashed' }] }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { core, client: await connectClient(wrap(port1)) };
}

const storyFile = (id: string, status: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ${status}\nsize: S\n${extra}---\nBody\n`;

function workspace(): string {
  const ws = mkdtempSync(join(tmpdir(), 'sf-board-ws-'));
  mkdirSync(join(ws, '.specforge'));
  writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: board-1\nname: Board\n');
  mkdirSync(join(ws, 'spec', '04_user_stories'), { recursive: true });
  writeFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), storyFile('US-001', 'ready'));
  writeFileSync(join(ws, 'spec', '04_user_stories', 'US-002.md'), storyFile('US-002', 'ready', 'depends_on: [US-001]\n'));
  writeFileSync(join(ws, 'spec', '04_user_stories', 'US-003.md'), storyFile('US-003', 'backlog'));
  return ws;
}

describe('US-038: board over IPC', () => {
  it('AC-2/AC-3: moves write the story file; order persists across a restart', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-board-app-'));
    const ws = workspace();
    const first = await boot(appData);
    await first.client.command('projects.open', { path: ws });

    await expect(
      first.client.command('board.move', { projectId: 'board-1', storyId: 'US-003', to: 'ready', beforeStoryId: 'US-001' }),
    ).resolves.toEqual({ ok: true });
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-003.md'), 'utf8')).toContain('status: ready');
    await first.core.close();

    const second = await boot(appData);
    const board = await second.client.query('board.get', { projectId: 'board-1' });

    expect(board.columns.find((c) => c.status === 'ready')!.cards.map((c) => c.storyId)).toEqual(['US-003', 'US-001', 'US-002']);
  });

  it('AC-4: a rejected move returns the explanation and changes nothing', async () => {
    const { client } = await boot(mkdtempSync(join(tmpdir(), 'sf-board-app-')));
    const ws = workspace();
    await client.command('projects.open', { path: ws });

    await expect(
      client.command('board.move', { projectId: 'board-1', storyId: 'US-003', to: 'done', beforeStoryId: null }),
    ).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not allowed/),
    });
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-003.md'), 'utf8')).toContain('status: backlog');
  });
});

describe('US-042: scheduling from the board', () => {
  it('AC-3: a story with an open predecessor waits with reason "dependency"; a failed run keeps its reason on the card', async () => {
    const { client } = await boot(mkdtempSync(join(tmpdir(), 'sf-board-app-')));
    const ws = workspace();
    await client.command('projects.open', { path: ws });

    await client.command('board.move', { projectId: 'board-1', storyId: 'US-002', to: 'in_progress', beforeStoryId: null });
    let board = await client.query('board.get', { projectId: 'board-1' });
    expect(board.columns.find((c) => c.status === 'in_progress')!.cards).toEqual([
      expect.objectContaining({ storyId: 'US-002', subState: 'queued', queueReason: 'dependency', waitingFor: ['US-001'] }),
    ]);

    await client.command('board.move', { projectId: 'board-1', storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    for (let i = 0; i < 200; i++) {
      board = await client.query('board.get', { projectId: 'board-1' });
      if (board.columns.flatMap((c) => c.cards).some((c) => c.storyId === 'US-001' && c.subState === 'failed')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(board.columns.find((c) => c.status === 'in_progress')!.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ storyId: 'US-001', subState: 'failed', statusNotice: expect.stringMatching(/Agent crashed/) }),
      ]),
    );
    expect(await client.query('shell.state', {})).toMatchObject({ runs: { running: 0, queued: 1 } });
  });
});
