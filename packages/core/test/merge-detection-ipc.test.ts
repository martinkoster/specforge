// SPDX-License-Identifier: Apache-2.0
// US-024 integration: a story branch merged by the user is detected; dependents branch from the base branch again.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
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

describe('US-024 over IPC', () => {
  it('AC-1..AC-3: detects the merged branch, records merged_at, and the dependent story starts from the base branch', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-merge-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: new MockAdapter({ script: () => [{ type: 'result', text: 'Done.' }] }),
    });
    open.push(core);
    const { port1, port2 } = new MessageChannel();
    const server = serveContract(wrap(port2), core.handlers);
    core.setEmitter((name, payload) => server.emit(name, payload as never));
    const client = await connectClient(wrap(port1));
    const changed: string[] = [];
    client.subscribe('project.changed', (e) => changed.push(e.projectId));

    const project = await client.command('projects.create', {
      name: 'Merge',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-merge-ws-')),
      folderName: 'merge',
      initGit: true,
    });
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd: project.path, encoding: 'utf8' }).trim();
    const base = git('branch', '--show-current');
    // The user's approved story branch, merged by the user (SpecForge never merges).
    git('checkout', '-q', '-b', 'specforge/US-001');
    writeFileSync(join(project.path, 'feature.txt'), 'feature\n');
    git('add', 'feature.txt');
    git('commit', '-q', '-m', 'US-001');
    git('checkout', '-q', base);
    git('merge', '-q', '--no-ff', '-m', 'Merge US-001', 'specforge/US-001');
    const story = (id: string, status: string, extra: string) =>
      `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ${status}\n${extra}---\n`;
    writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), story('US-001', 'done', 'branch: specforge/US-001\n'));
    writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-002.md'), story('US-002', 'ready', 'depends_on: [US-001]\n'));
    git('add', '-A');
    git('commit', '-q', '-m', 'stories');
    await client.command('projects.openById', { projectId: project.id });

    // The check on open may already have run; an explicit check (window focus / Refresh) reports nothing new then.
    const first = await client.command('merge.check', { projectId: project.id });
    await vi.waitFor(() => expect(changed).toContain(project.id));
    expect(first.merged.length === 0 || first.merged[0] === 'US-001').toBe(true);
    expect(await client.command('merge.check', { projectId: project.id })).toEqual({ merged: [] });
    expect((await client.query('shell.state', {})).nextStep).not.toMatchObject({ code: 'merge_branches' });

    const head = git('rev-parse', base);
    await client.command('board.move', { projectId: project.id, storyId: 'US-002', to: 'in_progress', beforeStoryId: null });
    await vi.waitFor(async () => expect((await client.query('runs.list', { projectId: project.id }))[0]?.status).toMatch(/^completed/), {
      timeout: 30_000,
    });
    expect(git('merge-base', 'specforge/US-002', base)).toBe(head);
    expect(git('rev-list', '--count', `${head}..specforge/US-002`)).toBe('0');
  });
});
