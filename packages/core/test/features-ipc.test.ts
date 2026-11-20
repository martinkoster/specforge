// SPDX-License-Identifier: Apache-2.0
// US-081 integration: feature intents are indexed, listed with their derived status (written back into the file by
// SpecForge) and their typed trace links appear in the traceability of the feature.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
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

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function write(root: string, rel: string, content: string) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

async function boot(): Promise<{ client: ContractClient; ws: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-fi-app-')),
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
  const ws = mkdtempSync(join(tmpdir(), 'sf-fi-ws-'));
  write(ws, '.specforge/project.yaml', 'id: fi-1\nname: Features\nschemaVersion: 1\n');
  write(
    ws,
    'spec/01_intent/FI-001-comments.md',
    '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\napproval: approved\nstatus: approved\nsource_idea: IDEA-002\n---\n## Problem\nNo comments.\n',
  );
  write(ws, 'spec/01_intent/FI-002-broken.md', '---\nkind: feature_intent\nid: FI-002\ntitle: Broken\nstatus: shipped\n---\n');
  write(
    ws,
    'spec/02_requirements/functional_requirements.md',
    '---\nkind: requirements\n---\n### FR-001: Tasks\nChanged by FI-001.\n### FR-002: Comments\n**Feature**: FI-001\n',
  );
  write(
    ws,
    'spec/04_user_stories/US-001-comments.md',
    '---\nkind: story\nid: US-001\ntitle: Comment list\napproval: approved\nstatus: done\nfeature: FI-001\n---\n## Description\nx\n',
  );
  await client.command('projects.open', { path: ws });
  return { client, ws };
}

describe('US-081 over IPC', () => {
  it('AC-1/AC-4/AC-5: lists features with the derived status and writes it into the file; invalid files show a parse error', async () => {
    const { client, ws } = await boot();

    expect(await client.query('features.list', { projectId: 'fi-1' })).toMatchObject([
      {
        id: 'FI-001',
        title: 'Comments',
        approval: 'approved',
        status: 'done',
        sourceIdea: 'IDEA-002',
        baseline: null,
        path: 'spec/01_intent/FI-001-comments.md',
        storyCount: 1,
      },
    ]);
    await waitFor(() =>
      readFileSync(join(ws, 'spec', '01_intent', 'FI-001-comments.md'), 'utf8').includes('status: done') ? true : undefined,
    );
    const groups = await client.query('artifacts.list', { projectId: 'fi-1' });
    const broken = groups.flatMap((g) => g.artifacts).find((a) => a.path === 'spec/01_intent/FI-002-broken.md');
    expect(broken?.invalid).toMatch(/status/);
  });

  it('AC-3: feature links and their trace types', async () => {
    const { client } = await boot();

    const fi = await client.query('features.get', { projectId: 'fi-1', featureId: 'FI-001' });
    expect(fi?.links).toEqual([
      { id: 'FR-001', type: 'changes' },
      { id: 'FR-002', type: 'introduces' },
      { id: 'US-001', type: 'introduces' },
    ]);
    const trace = await client.query('trace.get', { projectId: 'fi-1', target: { kind: 'element', id: 'FI-001' } });
    expect(trace.downstream.map((n) => [n.id, n.linkType])).toEqual([
      ['FR-001', 'changes'],
      ['FR-002', 'introduces'],
      ['US-001', 'introduces'],
    ]);
    expect(await client.query('features.get', { projectId: 'fi-1', featureId: 'FI-404' })).toBeNull();
    // US-084: the feature stepper (one Done story, no impact analysis yet) and the project stepper.
    expect(fi?.current).toBe('impact');
    expect(fi?.phases.map((p) => p.state)).toEqual([
      'approved',
      'not_started',
      'not_started',
      'not_started',
      'approved',
      'approved',
      'awaiting_approval',
    ]);
    expect(await client.query('phases.status', { projectId: 'fi-1' })).toMatchObject({ maintenance: false });
  });
});
