// SPDX-License-Identifier: Apache-2.0
// US-018/US-019 integration: real folders, git and SQLite through the core composition root, including a restart.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  const core = await createCore({ appDataDir, platform: process.platform, pid: process.pid, testMode: false, exit: () => undefined });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { core, client: await connectClient(wrap(port1)) };
}

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe('US-018: create a new project end-to-end in the core', () => {
  it('AC-2/AC-4: creates folder, structure, git repository with initial commit; the project is current and in the shell state', async () => {
    const { client } = await boot(tmp('sf-app-'));
    const parent = tmp('sf-parent-');

    const opened = await client.command('projects.create', {
      name: 'Task Manager',
      parentDir: parent,
      folderName: 'task-manager',
      initGit: true,
    });

    const path = join(parent, 'task-manager');
    expect(opened).toMatchObject({ name: 'Task Manager', path, vcs: { mode: 'git' }, isolationWarning: null });
    expect(readFileSync(join(path, '.specforge', 'project.yaml'), 'utf8')).toContain(`id: ${opened.id}`);
    for (const folder of ['01_intent', '02_requirements', '03_design', '04_user_stories', '05_test_concepts']) {
      expect(existsSync(join(path, 'spec', folder))).toBe(true);
    }
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: path, encoding: 'utf8' }).trim()).toBe('Initialise SpecForge project');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: path, encoding: 'utf8' }).trim()).toBe('');
    expect(await client.query('shell.state', {})).toMatchObject({
      currentProjectId: opened.id,
      projects: [{ id: opened.id, name: 'Task Manager' }],
      vcs: { mode: 'git' },
      storyCount: 0,
    });
    await expect(client.query('projects.gitAvailable', {})).resolves.toEqual({ available: true });
  });
});

describe('US-019: open an existing project end-to-end in the core', () => {
  it('AC-1/AC-2/AC-3: opens a folder with metadata, detects non-git mode, and restores it with its index and board state after a restart', async () => {
    const appData = tmp('sf-app-');
    const ws = tmp('sf-ws-');
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: billing-1\nname: Billing\nschemaVersion: 1\n');
    mkdirSync(join(ws, 'spec', '04_user_stories'), { recursive: true });
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\n---\nBody\n',
    );

    const first = await boot(appData);
    const opened = await first.client.command('projects.open', { path: ws });
    expect(opened).toMatchObject({
      id: 'billing-1',
      name: 'Billing',
      vcs: { mode: 'none' },
      isolationWarning: expect.stringMatching(/not isolated/i),
    });
    expect(await first.client.query('shell.state', {})).toMatchObject({
      currentProjectId: 'billing-1',
      vcs: { mode: 'none' },
      storyCount: 1,
    });
    await first.core.close();

    const second = await boot(appData);

    expect(await second.client.query('shell.state', {})).toMatchObject({
      currentProjectId: 'billing-1',
      projects: [{ id: 'billing-1', name: 'Billing' }],
      vcs: { mode: 'none' },
      storyCount: 1,
    });
  });

  it('AC-1: a folder without metadata is refused with an explanation', async () => {
    const { client } = await boot(tmp('sf-app-'));

    await expect(client.command('projects.open', { path: tmp('sf-plain-') })).rejects.toMatchObject({
      code: 'NOT_A_PROJECT',
      message: expect.stringMatching(/no SpecForge metadata/),
    });
  });

  it('closing the project returns to the start wizard state', async () => {
    const { client } = await boot(tmp('sf-app-'));
    await client.command('projects.create', { name: 'P', parentDir: tmp('sf-parent-'), folderName: 'p', initGit: false });

    await client.command('projects.close', {});

    expect(await client.query('shell.state', {})).toMatchObject({ currentProjectId: null, vcs: null });
  });
});
