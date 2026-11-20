// SPDX-License-Identifier: Apache-2.0
// Chat writes (FR-091) through the real core with the scripted agent: US-097 permission relay.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';
import { createTestAgent } from '../src/test-agent.js';

vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function bootChat(initGit = true): Promise<{ client: ContractClient; projectId: string; ws: string; requested: string[] }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-chatw-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: createTestAgent(),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client = await connectClient(wrap(port1));
  const requested: string[] = [];
  client.subscribe('permission.requested', (e) => void requested.push(e.id));
  const project = await client.command('projects.create', {
    name: 'ChatWrites',
    path: join(mkdtempSync(join(tmpdir(), 'sf-chatw-ws-')), 'cw'),
    initGit,
  });
  writeFileSync(join(project.path, 'README.md'), '# Project\nThis is teh readme.\n');
  await client.command('projects.openById', { projectId: project.id });
  return { client, projectId: project.id, ws: project.path, requested };
}

async function until<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('US-097 AC-5 over IPC (FR-091 up to the permission prompt)', () => {
  it('a README typo fix is relayed as a permission prompt; allowing it changes the file', async () => {
    const { client, projectId, ws, requested } = await bootChat();
    const thread = await client.command('chat.createThread', { projectId, title: 'Fixes' });
    expect(await client.command('chat.send', { threadId: thread.id, text: 'Fix the typo in the README' })).toMatchObject({ ok: true });

    const id = await until(async () => requested[0]);
    const pending = (await client.query('pending.list', { projectId })).flatMap((g) => g.items);
    expect(pending).toContainEqual({
      kind: 'permission',
      permission: expect.objectContaining({ id, runKind: 'chat', toolName: 'Edit' }),
    });
    expect(readFileSync(join(ws, 'README.md'), 'utf8')).toContain('teh');

    await client.command('permission.decide', { id, decision: 'allow' });
    await until(async () => ((await client.query('chat.messages', { threadId: thread.id })).length === 2 ? true : undefined));
    expect(readFileSync(join(ws, 'README.md'), 'utf8')).toBe('# Project\nThis is the readme.\n');
  });
});

describe('US-098 over IPC (ADR-026)', () => {
  it('AC-1..AC-3: every changed file of the turn is recorded with its diff — also a file written by a shell command', async () => {
    const { client, projectId, ws, requested } = await bootChat();
    const thread = await client.command('chat.createThread', { projectId, title: 'Fixes' });
    await client.command('chat.send', { threadId: thread.id, text: 'Fix the typo and run the build' });
    await client.command('permission.decide', { id: await until(async () => requested[0]), decision: 'allow' });
    const shell = await until(async () => requested[1]);
    writeFileSync(join(ws, 'build.log'), 'built\n'); // the effect of the approved shell command
    await client.command('permission.decide', { id: shell, decision: 'allow' });
    const answer = await until(async () => (await client.query('chat.messages', { threadId: thread.id }))[1]);

    expect(answer.changes?.map((c) => [c.path, c.change, c.isSpec])).toEqual([
      ['README.md', 'M', false],
      ['build.log', 'A', false],
    ]);
    const readme = answer.changes!.find((c) => c.path === 'README.md')!;
    const diff = await client.query('chat.changeDiff', { changeId: readme.id });
    expect(diff).toEqual({ path: 'README.md', before: '# Project\nThis is teh readme.\n', after: '# Project\nThis is the readme.\n' });
    const activity = (await client.query('dashboard.get', { projectId })).activity.map((a) => a.label);
    expect(activity).toContain('Chat change outside Kanban flow: README.md');
  });

  it('AC-4: a changed specification becomes Draft', async () => {
    const { client, projectId, ws, requested } = await bootChat(false);
    writeFileSync(
      join(ws, 'spec', '02_requirements', 'fr.md'),
      '---\nkind: requirements\napproval: approved\n---\n### FR-001: Login\nUsers log in.\n',
    );
    await client.command('projects.openById', { projectId });
    const thread = await client.command('chat.createThread', { projectId, title: 'Spec' });
    await client.command('chat.send', { threadId: thread.id, text: 'Change the login requirement to SSO' });
    await client.command('permission.decide', { id: await until(async () => requested[0]), decision: 'allow' });
    const answer = await until(async () => (await client.query('chat.messages', { threadId: thread.id }))[1]);
    expect(answer.changes).toEqual([expect.objectContaining({ path: 'spec/02_requirements/fr.md', change: 'M', isSpec: true })]);
    const artifacts = (await client.query('artifacts.list', { projectId })).flatMap((g) => g.artifacts);
    expect(artifacts.find((a) => a.path === 'spec/02_requirements/fr.md')?.approval).toBe('draft');
    expect(readFileSync(join(ws, 'spec', '02_requirements', 'fr.md'), 'utf8')).toContain('Users log in with SSO.');
  });
});

describe('US-099 over IPC (NFR-031, FR-091 acceptance completes)', () => {
  it('AC-4: write-tool and shell changes are recorded with thread, message, permission decision and diff; revert restores them', async () => {
    const { client, projectId, ws, requested } = await bootChat();
    const thread = await client.command('chat.createThread', { projectId, title: 'Fixes' });
    await client.command('chat.send', { threadId: thread.id, text: 'Fix the typo and run the build' });
    await client.command('permission.decide', { id: await until(async () => requested[0]), decision: 'allow' });
    const shell = await until(async () => requested[1]);
    writeFileSync(join(ws, 'build.log'), 'built\n');
    await client.command('permission.decide', { id: shell, decision: 'allow' });
    const answer = await until(async () => (await client.query('chat.messages', { threadId: thread.id }))[1]);

    // 100 % of the changes are recorded, each with its message (run) and the permission decisions of that run.
    expect(answer.changes?.map((c) => c.path).sort()).toEqual(['README.md', 'build.log']);
    const decisions = await client.query('runs.permissions', { runId: answer.runId! });
    expect(decisions.map((d) => [d.toolName, d.decision, d.decidedBy])).toEqual([
      ['Edit', 'allow', 'user'],
      ['Bash', 'allow', 'user'],
    ]);
    for (const change of answer.changes!) {
      const diff = await client.query('chat.changeDiff', { changeId: change.id });
      expect(diff.after).not.toBeNull();
    }

    // FR-091: a later edit needs confirmation; the revert restores the original content.
    writeFileSync(join(ws, 'build.log'), 'built\nagain\n');
    const first = await client.command('chat.revert', { runId: answer.runId! });
    expect(first).toEqual({ needsConfirmation: [expect.objectContaining({ path: 'build.log', current: 'built\nagain\n' })] });
    expect(await client.command('chat.revert', { runId: answer.runId!, confirm: true })).toEqual({ reverted: ['README.md', 'build.log'] });
    expect(readFileSync(join(ws, 'README.md'), 'utf8')).toBe('# Project\nThis is teh readme.\n');
    expect(() => readFileSync(join(ws, 'build.log'), 'utf8')).toThrow();
    const after = (await client.query('chat.messages', { threadId: thread.id }))[1]!;
    expect(after.changes?.every((c) => c.revertedAt !== null)).toBe(true);
    const activity = (await client.query('dashboard.get', { projectId })).activity.map((a) => a.label);
    expect(activity).toContain('Chat change reverted: README.md');
  });
});
