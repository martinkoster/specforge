// SPDX-License-Identifier: Apache-2.0
// US-060 integration: the shell state carries the recommended next step; changes are announced to the UI.
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

describe('US-060 AC-3 over IPC', () => {
  it('reports the next step in the shell state and announces board changes within 2 s', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-next-app-')),
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
    const changed: number[] = [];
    client.subscribe('project.changed', () => changed.push(Date.now()));

    const project = await client.command('projects.create', {
      name: 'Next',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-next-ws-')),
      folderName: 'next',
      initGit: false,
    });
    const approved = (kind: string) => `---\nkind: ${kind}\napproval: approved\n---\n`;
    writeFileSync(join(project.path, 'spec', '01_intent', 'intent.md'), approved('intent'));
    writeFileSync(join(project.path, 'spec', '02_requirements', 'functional_requirements.md'), approved('requirements'));
    writeFileSync(join(project.path, 'spec', '03_design', 'design.md'), approved('design'));
    writeFileSync(
      join(project.path, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\n---\n',
    );
    await client.command('projects.openById', { projectId: project.id });

    expect((await client.query('shell.state', {})).nextStep).toMatchObject({
      code: 'start_stories',
      label: 'Start stories (1 ready, 1 free slot)',
    });

    // US-033: the stepper shows every phase approved and Kanban available and recommended.
    const phases = await client.query('phases.status', { projectId: project.id });
    expect(phases.recommended).toBe('kanban');
    expect(phases.phases.map((p) => [p.phase, p.state, p.enabled, p.unapprovedInputs])).toEqual([
      ['intent', 'approved', true, []],
      ['requirements', 'approved', true, []],
      ['design', 'approved', true, []],
      ['stories', 'approved', true, []],
      ['kanban', 'in_progress', true, []],
    ]);

    // US-061: the dashboard read model of the same project.
    const dashboard = await client.query('dashboard.get', { projectId: project.id });
    expect(dashboard).toMatchObject({
      storyCounts: { ready: 1 },
      progress: { done: 0, total: 1 },
      kanbanEnabled: true,
      artifacts: expect.arrayContaining([
        { phase: 'intent', items: [{ path: 'spec/01_intent/intent.md', approval: 'approved', impacted: false }] },
      ]),
    });

    const moved = Date.now();
    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await vi.waitFor(() => expect(changed.length).toBeGreaterThan(0));
    expect(changed[0]! - moved).toBeLessThan(2000);
    await vi.waitFor(
      async () =>
        expect((await client.query('shell.state', {})).nextStep).toMatchObject({ code: 'review_stories', label: 'Review US-001' }),
      {
        timeout: 20_000,
      },
    );
  });
});
