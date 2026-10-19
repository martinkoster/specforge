// SPDX-License-Identifier: Apache-2.0
// US-050 integration: the context of a story run includes linked requirements, the epic goal and predecessor results,
// and is stored on the run.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

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

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const prompts: string[] = [];

async function boot(): Promise<ContractClient> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-ctx-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({
      script: (request) => {
        prompts.push(request.prompt);
        const id = /user story (US-\d+)/.exec(request.prompt)?.[1] ?? 'US-?';
        return [
          {
            type: 'result',
            text: `Done.\n\`\`\`specforge-result\n{"outcome":"success","summary":"${id} implemented with a session store."}\n\`\`\`\n`,
          },
        ];
      },
    }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return connectClient(wrap(port1));
}

const story = (id: string, status: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ${status}\nepic: EP-001\nrequirements: [FR-001]\n${extra}---\n## Acceptance Criteria\n- [ ] AC-1: ${id} works.\n`;

describe('US-050 over IPC', () => {
  it('AC-1/AC-2: the run context contains the linked requirement, the epic goal and the predecessor summary, and is stored on the run', async () => {
    const client = await boot();
    const project = await client.command('projects.create', {
      name: 'Ctx',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-ctx-ws-')),
      folderName: 'ctx',
      initGit: true,
    });
    const spec = join(project.path, 'spec');
    writeFileSync(
      join(spec, '02_requirements', 'fr.md'),
      '---\nkind: requirements\napproval: approved\n---\n### FR-001: Sessions\nUsers stay logged in for 30 days.\n### FR-002: Other\nUnrelated.\n',
    );
    mkdirSync(join(spec, '04_user_stories', 'epics'), { recursive: true });
    writeFileSync(
      join(spec, '04_user_stories', 'epics', 'EP-001.md'),
      '---\nkind: epic\nid: EP-001\ntitle: Accounts\napproval: approved\n---\n## Goal\nUsers manage their accounts.\n## Business value\nRetention.\n',
    );
    writeFileSync(join(spec, '04_user_stories', 'US-001.md'), story('US-001', 'ready'));
    writeFileSync(join(spec, '04_user_stories', 'US-002.md'), story('US-002', 'ready', 'depends_on: [US-001]\n'));
    await client.command('projects.openById', { projectId: project.id });

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await waitFor(async () =>
      (await client.query('runs.list', { projectId: project.id })).some((r) => r.status === 'completed') ? true : undefined,
    );
    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'done', beforeStoryId: null });
    await client.command('board.move', { projectId: project.id, storyId: 'US-002', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(async () =>
      (await client.query('runs.list', { projectId: project.id })).find((r) => r.storyId === 'US-002' && r.status === 'completed'),
    );

    const prompt = prompts.at(-1)!;
    expect(prompt).toContain('Implement user story US-002: Story US-002.');
    expect(prompt).toContain('- [ ] AC-1: US-002 works.');
    expect(prompt).toContain('### FR-001: Sessions\nUsers stay logged in for 30 days.');
    expect(prompt).not.toContain('FR-002');
    expect(prompt).toContain('## Epic EP-001: Accounts');
    expect(prompt).toContain('Goal: Users manage their accounts.');
    expect(prompt).toMatch(/US-001 Story US-001 \(Done\): US-001 implemented with a session store\./);

    const { context } = await client.query('runs.context', { runId: run.id });
    expect(context).toContain('Goal: Users manage their accounts.');
    expect(context).toContain('```specforge-result');
  });
});
