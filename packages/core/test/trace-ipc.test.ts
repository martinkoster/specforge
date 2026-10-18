// SPDX-License-Identifier: Apache-2.0
// US-034 integration: trace links from the index and runs over IPC; unknown IDs as issues.
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

describe('US-034 over IPC', () => {
  it('AC-1/AC-3: requirement ↔ story ↔ run ↔ file links and unknown IDs', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-trace-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: new MockAdapter({
        script: () => [
          { type: 'tool', toolName: 'Write', input: { file_path: 'src/login.ts', content: 'x\n' } },
          { type: 'result', text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"ok"}\n```\n' },
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
      name: 'T',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-trace-ws-')),
      folderName: 't',
      initGit: false,
    });
    writeFileSync(join(project.path, 'spec', '02_requirements', 'fr.md'), '---\nkind: requirements\n---\n### FR-001: Login\n');
    writeFileSync(
      join(project.path, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login form\napproval: approved\nstatus: ready\nrequirements: [FR-001, FR-404]\n---\n',
    );
    await client.command('projects.openById', { projectId: project.id });
    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await vi.waitFor(async () => expect((await client.query('runs.list', { projectId: project.id }))[0]?.status).toBe('completed'), {
      timeout: 30_000,
    });
    const runId = (await client.query('runs.list', { projectId: project.id }))[0]!.id;

    expect(
      (await client.query('trace.get', { projectId: project.id, target: { kind: 'element', id: 'FR-001' } })).downstream.map((n) => n.id),
    ).toEqual(['US-001']);
    const story = await client.query('trace.get', { projectId: project.id, target: { kind: 'element', id: 'US-001' } });
    expect(story.upstream.map((n) => [n.id, n.exists])).toEqual([
      ['FR-001', true],
      ['FR-404', false],
    ]);
    expect(story.downstream).toEqual([expect.objectContaining({ kind: 'run', id: runId })]);
    expect((await client.query('trace.get', { projectId: project.id, target: { kind: 'run', id: runId } })).downstream).toEqual([
      expect.objectContaining({ kind: 'file', id: 'src/login.ts', runId }),
    ]);
    expect(
      (await client.query('trace.get', { projectId: project.id, target: { kind: 'file', id: 'src/login.ts' } })).upstream.map((n) => n.id),
    ).toEqual([runId, 'US-001']);
    expect(await client.query('trace.issues', { projectId: project.id })).toEqual([
      { path: 'spec/04_user_stories/US-001.md', message: 'US-001 references FR-404, which does not exist.' },
    ]);
  });
});
