// SPDX-License-Identifier: Apache-2.0
// US-023 integration: uncommitted spec files, diff and commit over IPC.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
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

describe('US-023 over IPC', () => {
  it('lists uncommitted spec files with a generated message and commits only them', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-commit-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
    });
    open.push(core);
    const { port1, port2 } = new MessageChannel();
    serveContract(wrap(port2), core.handlers);
    const client = await connectClient(wrap(port1));
    const project = await client.command('projects.create', {
      name: 'Commit',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-commit-ws-')),
      folderName: 'commit',
      initGit: true,
    });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: project.path, encoding: 'utf8' }).trim();
    writeFileSync(join(project.path, 'spec', '02_requirements', 'fr.md'), '### FR-001: Login\n');
    writeFileSync(join(project.path, 'notes.txt'), 'not a spec file\n');

    const status = await client.query('specCommit.status', { projectId: project.id });
    expect(status).toEqual({
      files: [{ path: 'spec/02_requirements/fr.md', change: 'A' }],
      message: 'Update specification: fr.md\n\nA spec/02_requirements/fr.md',
    });
    expect((await client.query('specCommit.diff', { projectId: project.id, path: 'spec/02_requirements/fr.md' })).patch).toContain(
      '+### FR-001: Login',
    );

    const result = await client.command('specCommit.commit', {
      projectId: project.id,
      paths: ['spec/02_requirements/fr.md'],
      message: status.message,
    });
    expect(result).toMatchObject({ ok: true });
    expect(git('log', '-1', '--format=%s')).toBe('Update specification: fr.md');
    expect(git('status', '--porcelain')).toBe('?? notes.txt');
    expect(await client.query('specCommit.status', { projectId: project.id })).toEqual({ files: [], message: '' });
    await expect(client.command('specCommit.commit', { projectId: project.id, paths: ['notes.txt'], message: 'x' })).rejects.toThrow(
      /only specification files/,
    );
  });
});
