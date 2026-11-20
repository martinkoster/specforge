// SPDX-License-Identifier: Apache-2.0
// US-096 integration (FR-112): completing FI-001 offers spec-v1.1; uncommitted spec changes are committed first; the
// requirement changed by FI-001 compares against spec-v1.0; non-git projects have no baselines.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

// Real Git commits and tags: several seconds on Windows, more under a parallel suite.
vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function boot(): Promise<ContractClient> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-base-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return connectClient(wrap(port1));
}

const write = (root: string, rel: string, content: string) => {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
};

async function commitAll(client: ContractClient, projectId: string) {
  const { files } = await client.query('specCommit.status', { projectId });
  if (files.length === 0) return;
  expect(await client.command('specCommit.commit', { projectId, paths: files.map((f) => f.path), message: 'spec' })).toMatchObject({
    ok: true,
  });
}

const until = async <T>(fn: () => Promise<T | undefined>): Promise<T> => {
  for (let i = 0; i < 400; i++) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timeout');
};

describe('US-096 over IPC (FR-112)', () => {
  it('AC-1..AC-3: baseline spec-v1.0, complete FI-001, commit first, create spec-v1.1 and compare a changed requirement', async () => {
    const client = await boot();
    const project = await client.command('projects.create', {
      name: 'Baselines',
      path: join(mkdtempSync(join(tmpdir(), 'sf-base-ws-')), 'b'),
      initGit: true,
    });
    const ws = project.path;
    const FR = 'spec/02_requirements/fr.md';
    write(ws, FR, '---\nkind: requirements\napproval: approved\n---\n### FR-034: Task details\nDetails show the title.\n');
    write(
      ws,
      'spec/01_intent/FI-001-comments.md',
      '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\napproval: approved\nstatus: approved\n---\n## Problem\nx\n',
    );
    await client.command('projects.openById', { projectId: project.id });
    await commitAll(client, project.id);
    const initial = await client.query('baselines.offer', { projectId: project.id });
    expect(initial).toMatchObject({ available: true, uncommitted: [], nextTag: 'spec-v1.0', features: [] });
    await client.command('baselines.create', { projectId: project.id, tag: 'spec-v1.0' });

    // FI-001 changes FR-034 and its only story is Done → the feature completes.
    write(
      ws,
      FR,
      '---\nkind: requirements\napproval: approved\n---\n### FR-034: Task details\nDetails show the title.\nChanged by FI-001: comments are shown.\n',
    );
    write(
      ws,
      'spec/04_user_stories/US-001.md',
      '---\nkind: story\nid: US-001\ntitle: Comments\napproval: approved\nstatus: done\nfeature: FI-001\nrequirements: [FR-034]\n---\n## Description\nx\n',
    );
    await client.command('projects.openById', { projectId: project.id });
    await until(async () =>
      (await client.query('features.get', { projectId: project.id, featureId: 'FI-001' }))?.status === 'done' ? true : undefined,
    );

    const offer = await client.query('baselines.offer', { projectId: project.id });
    expect(offer).toMatchObject({ nextTag: 'spec-v1.1', features: [{ id: 'FI-001', title: 'Comments' }] });
    expect(offer.uncommitted.length).toBeGreaterThan(0);
    await expect(client.command('baselines.create', { projectId: project.id, tag: 'spec-v1.1' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await commitAll(client, project.id);
    const created = await client.command('baselines.create', { projectId: project.id, tag: 'spec-v1.1' });
    expect(created).toMatchObject({ tag: 'spec-v1.1', featureIds: ['FI-001'] });
    expect(created.notes).toContain('- FI-001 Comments');
    expect((await client.query('baselines.list', { projectId: project.id })).map((b) => b.tag)).toEqual(['spec-v1.1', 'spec-v1.0']);

    const compared = await client.query('baselines.compare', { projectId: project.id, tag: 'spec-v1.0', path: FR });
    expect(compared.before).not.toContain('Changed by FI-001');
    expect(compared.after).toContain('Changed by FI-001: comments are shown.');
  });

  it('AC-4: a project without Git has no baselines', async () => {
    const client = await boot();
    const project = await client.command('projects.create', {
      name: 'Plain',
      path: join(mkdtempSync(join(tmpdir(), 'sf-base-plain-')), 'p'),
      initGit: false,
    });
    expect(await client.query('baselines.offer', { projectId: project.id })).toMatchObject({
      available: false,
      reason: expect.stringContaining('Git'),
    });
  });
});
