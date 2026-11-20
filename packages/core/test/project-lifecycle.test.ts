// SPDX-License-Identifier: Apache-2.0
// US-018/US-019 integration: real folders, git and SQLite through the core composition root, including a restart.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
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
      path: join(parent, 'task-manager'),
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

describe('US-068: folder-first project creation in the core', () => {
  it('AC-2/AC-3/AC-4: inspects picked folders and creates the project in an existing empty folder', async () => {
    const { client } = await boot(tmp('sf-app-'));
    const empty = tmp('sf-empty-');
    const code = tmp('sf-code-');
    writeFileSync(join(code, 'main.c'), 'int main(void) { return 0; }\n');

    await expect(client.query('projects.inspectFolder', { path: empty })).resolves.toEqual({ kind: 'empty' });
    await expect(client.query('projects.inspectFolder', { path: code })).resolves.toMatchObject({ kind: 'notEmpty' });
    await expect(client.command('projects.create', { name: 'Code', path: code, initGit: false })).rejects.toMatchObject({
      code: 'FOLDER_NOT_EMPTY',
    });
    expect(existsSync(join(code, '.specforge'))).toBe(false);

    const opened = await client.command('projects.create', { name: 'My Notes', path: empty, initGit: true });

    expect(opened).toMatchObject({ name: 'My Notes', path: empty, vcs: { mode: 'git' } });
    expect(readFileSync(join(empty, '.specforge', 'project.yaml'), 'utf8')).toContain('name: My Notes');
    await expect(client.query('projects.inspectFolder', { path: empty })).resolves.toEqual({ kind: 'project' });
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
    await client.command('projects.create', { name: 'P', path: join(tmp('sf-parent-'), 'p'), initGit: false });

    await client.command('projects.close', {});

    expect(await client.query('shell.state', {})).toMatchObject({ currentProjectId: null, vcs: null });
  });
});

/** SHA-256 of every file below `dir` (relative paths), skipping `.git` and `.specforge`. */
function hashes(dir: string, root = dir, out: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === '.git' || entry === '.specforge') continue;
    if (statSync(full).isDirectory()) hashes(full, root, out);
    else out[relative(root, full).split(sep).join('/')] = createHash('sha256').update(readFileSync(full)).digest('hex');
  }
  return out;
}

describe('US-079: adopt an existing code folder in the core', () => {
  it('AC-2/AC-4: adopts a Rails-style folder below docs/spec with Git init; existing files stay unmodified and untracked', async () => {
    const { client } = await boot(tmp('sf-app-'));
    const code = tmp('sf-adopt-');
    writeFileSync(join(code, 'Gemfile'), "source 'https://rubygems.org'\n");
    mkdirSync(join(code, 'spec'));
    writeFileSync(join(code, 'spec', 'user_spec.rb'), 'describe "user" do\nend\n');
    mkdirSync(join(code, 'app'));
    writeFileSync(join(code, 'app', 'user.rb'), 'class User; end\n');
    const before = hashes(code);

    const inspection = await client.query('projects.inspectFolder', { path: code });
    expect(inspection).toEqual({ kind: 'notEmpty', git: 'none', suggestedSpecRoot: 'docs/spec' });
    expect(await client.query('projects.checkSpecRoot', { path: code, specRoot: 'spec' })).toEqual({
      problem: expect.stringContaining('not empty'),
    });

    const opened = await client.command('projects.adopt', { name: 'Rails', path: code, specRoot: 'docs/spec', initGit: true });

    expect(opened).toMatchObject({ name: 'Rails', specRoot: 'docs/spec', vcs: { mode: 'git' } });
    expect(readFileSync(join(code, '.specforge', 'project.yaml'), 'utf8')).toContain('specRoot: docs/spec');
    expect(existsSync(join(code, 'docs', 'spec', '01_intent'))).toBe(true);
    const after = hashes(code);
    for (const [file, hash] of Object.entries(before)) expect(after[file], file).toBe(hash);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: code, encoding: 'utf8' }).trim();
    expect(
      git('ls-files')
        .split('\n')
        .every((f) => f.startsWith('.specforge/') || f.startsWith('docs/spec/')),
    ).toBe(true);
    expect(git('status', '--porcelain').split('\n').sort()).toEqual(['?? Gemfile', '?? app/', '?? spec/']);
    expect(await client.query('shell.state', {})).toMatchObject({ currentProjectId: opened.id, specRoot: 'docs/spec' });
  }, 60_000);

  it('AC-5: a subfolder of a repository is rejected; a folder with metadata is opened instead', async () => {
    const { client } = await boot(tmp('sf-app-'));
    const repo = tmp('sf-adopt-repo-');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    mkdirSync(join(repo, 'pkg'));
    writeFileSync(join(repo, 'pkg', 'index.ts'), 'export {};\n');

    expect(await client.query('projects.inspectFolder', { path: join(repo, 'pkg') })).toMatchObject({ git: 'subfolder' });
    await expect(
      client.command('projects.adopt', { name: 'Pkg', path: join(repo, 'pkg'), specRoot: 'spec', initGit: false }),
    ).rejects.toMatchObject({ code: 'NOT_REPOSITORY_ROOT', message: expect.stringContaining('Choose the repository root') });
    expect(existsSync(join(repo, 'pkg', '.specforge'))).toBe(false);

    const ws = tmp('sf-adopt-meta-');
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: meta-1\nname: Meta\nschemaVersion: 1\n');
    expect(await client.command('projects.adopt', { name: 'X', path: ws, specRoot: 'docs/spec', initGit: false })).toMatchObject({
      id: 'meta-1',
      specRoot: 'spec',
    });
  }, 60_000);
});
