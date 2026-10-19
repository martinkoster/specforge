// SPDX-License-Identifier: Apache-2.0
// US-016 integration: project settings over IPC with a real Git repository, instructions file and persistence.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore, type Core } from '../src/index.js';

// Full runs with real Git worktrees: several seconds each on Windows, more under a parallel suite.
vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function boot(appDataDir: string): Promise<{ core: Core; client: Awaited<ReturnType<typeof connectClient>> }> {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { core, client: await connectClient(wrap(port1)) };
}

describe('US-016 over IPC', () => {
  it('AC-1..AC-3: instructions file, validated Git settings and parallel runs persist; the base branch survives reopening', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-ps-app-'));
    const parent = mkdtempSync(join(tmpdir(), 'sf-ps-parent-'));
    const first = await boot(appData);
    const project = await first.client.command('projects.create', {
      name: 'Settings',
      parentDir: parent,
      folderName: 'settings',
      initGit: true,
    });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: project.path, encoding: 'utf8' }).trim();
    git('branch', 'develop');

    const view = await first.client.query('projectSettings.get', { projectId: project.id });
    expect(view).toMatchObject({
      vcsMode: 'git',
      effectiveConcurrency: 3,
      concurrencyNote: null,
      instructions: { content: '', hash: null },
    });
    expect(view.settings.worktreeRoot).toBe(join(appData, 'wt', project.id.slice(0, 8)));

    await expect(
      first.client.command('projectSettings.save', { projectId: project.id, settings: { ...view.settings, baseBranch: 'nope' } }),
    ).resolves.toEqual({
      ok: false,
      errors: ['The branch "nope" does not exist in this repository.'],
    });
    await expect(
      first.client.command('projectSettings.save', {
        projectId: project.id,
        settings: {
          ...view.settings,
          baseBranch: 'develop',
          branchPattern: 'story/{storyId}',
          concurrencyLimit: 2,
          snapshotExclusions: ['out/**'],
        },
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      first.client.command('projectSettings.saveInstructions', { projectId: project.id, content: '# Conventions\n', expectedHash: null }),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(readFileSync(join(project.path, '.specforge', 'instructions.md'), 'utf8')).toBe('# Conventions\n');
    await first.core.close();

    const second = await boot(appData);
    await second.client.command('projects.openById', { projectId: project.id });
    const reopened = await second.client.query('projectSettings.get', { projectId: project.id });
    expect(reopened.settings).toMatchObject({
      baseBranch: 'develop',
      branchPattern: 'story/{storyId}',
      concurrencyLimit: 2,
      snapshotExclusions: ['out/**'],
    });
    expect(reopened.instructions.content).toBe('# Conventions\n');
    expect(existsSync(join(appData, 'wt'))).toBe(false);
  });

  it('AC-3: non-git projects run one at a time', async () => {
    const { client } = await boot(mkdtempSync(join(tmpdir(), 'sf-ps-app-')));
    const project = await client.command('projects.create', {
      name: 'Plain',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-ps-parent-')),
      folderName: 'plain',
      initGit: false,
    });

    expect(await client.query('projectSettings.get', { projectId: project.id })).toMatchObject({
      vcsMode: 'none',
      effectiveConcurrency: 1,
      concurrencyNote: expect.stringMatching(/without Git/),
    });
  });
});
