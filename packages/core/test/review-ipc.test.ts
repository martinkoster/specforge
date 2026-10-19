// SPDX-License-Identifier: Apache-2.0
// US-057 integration: review data of a completed story — result, own changes with before/after, permissions, overlaps.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
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

describe('US-057 over IPC', () => {
  it('AC-1..AC-3: result, changed files with before/after, permission log, Open in editor inside the worktree', async () => {
    const opened: string[] = [];
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-review-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      openPath: async (path) => void opened.push(path),
      agentAdapter: new MockAdapter({
        script: () => [
          { type: 'tool', toolName: 'Write', input: { file_path: 'src/login.ts', content: 'export const login = true;\n' } },
          { type: 'tool', toolName: 'Write', input: { file_path: 'README.md', content: 'changed\n' } },
          {
            type: 'result',
            text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"Login added.","tests":{"run":3,"passed":3,"failed":0},"coverage":88,"openIssues":["Rate limiting"]}\n```\n',
          },
        ],
      }),
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
      name: 'Review',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-review-ws-')),
      folderName: 'review',
      initGit: true,
    });
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd: project.path, encoding: 'utf8' });
    writeFileSync(join(project.path, 'README.md'), 'original\n');
    writeFileSync(
      join(project.path, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\n---\n',
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    await client.command('projects.openById', { projectId: project.id });
    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await vi.waitFor(async () => expect((await client.query('runs.list', { projectId: project.id }))[0]?.status).toBe('completed'), {
      timeout: 30_000,
    });

    const review = await client.query('review.get', { projectId: project.id, storyId: 'US-001' });
    expect(review).toEqual({ runId: expect.any(String), overlaps: [], gitMode: true });
    const runId = review.runId!;
    expect(await client.query('runs.result', { runId })).toMatchObject({
      result: {
        outcome: 'success',
        summary: 'Login added.',
        tests: { run: 3, passed: 3, failed: 0 },
        coverage: 88,
        openIssues: ['Rate limiting'],
      },
      computedFiles: [
        { path: 'README.md', change: 'M' },
        { path: 'src/login.ts', change: 'A' },
      ],
    });
    expect(await client.query('review.fileVersions', { projectId: project.id, runId, path: 'README.md' })).toEqual({
      before: 'original\n',
      after: 'changed\n',
      binary: false,
    });
    expect(await client.query('review.fileVersions', { projectId: project.id, runId, path: 'src/login.ts' })).toEqual({
      before: null,
      after: 'export const login = true;\n',
      binary: false,
    });
    expect((await client.query('runs.permissions', { runId })).map((p) => [p.toolName, p.decision])).toEqual([
      ['Write', 'allow'],
      ['Write', 'allow'],
    ]);

    await expect(client.command('review.openFile', { projectId: project.id, runId, path: 'src/login.ts' })).resolves.toEqual({ ok: true });
    expect(opened).toHaveLength(1);
    expect(opened[0]!.endsWith(`${sep}src${sep}login.ts`)).toBe(true);
    expect(opened[0]!.startsWith(project.path)).toBe(false);
    await expect(client.command('review.openFile', { projectId: project.id, runId, path: '../outside.txt' })).rejects.toThrow(
      /Invalid file path/,
    );
  });
});
