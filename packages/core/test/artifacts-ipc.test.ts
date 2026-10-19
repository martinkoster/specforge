// SPDX-License-Identifier: Apache-2.0
// US-025 integration: list, read and save artifacts through the core; an external edit between read and save is a conflict.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore } from '../src/index.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function setup() {
  const ws = mkdtempSync(join(tmpdir(), 'sf-art-ws-'));
  mkdirSync(join(ws, '.specforge'));
  writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: art-1\nname: Art\n');
  mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });
  mkdirSync(join(ws, 'spec', '02_requirements'), { recursive: true });
  writeFileSync(join(ws, 'spec', '01_intent', 'intent.md'), '---\nkind: intent\napproval: approved\n---\n# Intent\n');
  writeFileSync(join(ws, 'spec', '02_requirements', 'fr.md'), '---\nkind: requirements\napproval: draft\n---\n### FR-001: Login\n');
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-art-app-')),
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
  await client.command('projects.open', { path: ws });
  return { client, ws };
}

describe('US-025 over IPC', () => {
  it('AC-2: lists artifacts by type with approval state', async () => {
    const { client } = await setup();
    expect(await client.query('artifacts.list', { projectId: 'art-1' })).toEqual([
      { kind: 'intent', label: 'Intent', artifacts: [{ path: 'spec/01_intent/intent.md', approval: 'approved', invalid: null }] },
      {
        kind: 'requirements',
        label: 'Requirements',
        artifacts: [{ path: 'spec/02_requirements/fr.md', approval: 'draft', invalid: null }],
      },
    ]);
  });

  it('AC-1/AC-3: saves atomically; a save over an externally changed file returns a conflict and keeps the disk version', async () => {
    const { client, ws } = await setup();
    const path = 'spec/01_intent/intent.md';
    const doc = await client.query('artifact.read', { projectId: 'art-1', path });

    const saved = await client.command('artifact.save', {
      projectId: 'art-1',
      path,
      content: `${doc.content}Saved.\n`,
      expectedHash: doc.hash,
    });
    expect(saved).toMatchObject({ ok: true });
    expect(readFileSync(join(ws, path), 'utf8')).toContain('Saved.');

    writeFileSync(join(ws, path), '---\nkind: intent\napproval: approved\n---\n# Changed outside\n');
    const conflict = await client.command('artifact.save', {
      projectId: 'art-1',
      path,
      content: 'mine\n',
      expectedHash: saved.ok ? saved.hash : '',
    });

    expect(conflict).toMatchObject({ ok: false, conflict: { theirs: expect.stringContaining('Changed outside') } });
    expect(readFileSync(join(ws, path), 'utf8')).toContain('Changed outside');
  });

  it('refuses paths that are not indexed artifacts', async () => {
    const { client } = await setup();
    await expect(client.query('artifact.read', { projectId: 'art-1', path: '.specforge/project.yaml' })).rejects.toMatchObject({
      code: 'NOT_AN_ARTIFACT',
    });
  });
});

describe('US-026 over IPC', () => {
  it('AC-1: approving writes approval and approved_at; the list shows Approved', async () => {
    const { client, ws } = await setup();

    await expect(client.command('artifact.approve', { projectId: 'art-1', path: 'spec/02_requirements/fr.md' })).resolves.toMatchObject({
      ok: true,
    });

    const content = readFileSync(join(ws, 'spec', '02_requirements', 'fr.md'), 'utf8');
    expect(content).toContain('approval: approved');
    expect(content).toMatch(/approved_at: \d{4}-\d{2}-\d{2}T/);
    const groups = await client.query('artifacts.list', { projectId: 'art-1' });
    expect(groups.find((g) => g.kind === 'requirements')!.artifacts[0]).toMatchObject({ approval: 'approved' });
  });

  it('AC-3: reports Draft inputs before a generation', async () => {
    const { client } = await setup();
    expect(await client.query('artifacts.generationCheck', { projectId: 'art-1', target: 'design' })).toEqual({
      drafts: ['spec/02_requirements/fr.md'],
      warning: expect.stringMatching(/still Draft/),
    });
    expect(await client.query('artifacts.generationCheck', { projectId: 'art-1', target: 'requirements' })).toEqual({
      drafts: [],
      warning: null,
    });
  });
});
