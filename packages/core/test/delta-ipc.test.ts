// SPDX-License-Identifier: Apache-2.0
// US-089 integration: delta generation with the scripted agent through the real core — change set, restored folder,
// no impact flags for the temporary changes, accept/discard, Proposed ADRs.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore } from '../src/index.js';
import { createTestAgent } from '../src/test-agent.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

function write(root: string, rel: string, content: string) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const FR = 'spec/02_requirements/functional_requirements.md';
const REQS =
  '---\nkind: requirements\napproval: approved\n---\n### FR-020: Export\nUsers export tasks.\n### FR-034: Task details\nDetails show the title.\n';

async function boot(): Promise<{ client: ContractClient; ws: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-delta-app-')),
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
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const ws = mkdtempSync(join(tmpdir(), 'sf-delta-ws-'));
  write(ws, '.specforge/project.yaml', 'id: delta-1\nname: Delta\nschemaVersion: 1\n');
  write(
    ws,
    'spec/01_intent/FI-001-comments.md',
    '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\napproval: approved\nstatus: approved\nrelated_requirements: [FR-034, FR-020]\n---\n## Problem\nx\n',
  );
  write(ws, FR, REQS);
  write(ws, 'spec/03_design/design.md', '---\nkind: design\napproval: approved\n---\n### UC-004: View task\nUses FR-034.\n');
  write(
    ws,
    'spec/04_user_stories/US-008.md',
    '---\nkind: story\nid: US-008\ntitle: Details\napproval: approved\nstatus: done\nrequirements: [FR-034]\n---\n## Description\nx\n',
  );
  await client.command('projects.open', { path: ws });
  await client.command('impact.propose', { projectId: 'delta-1', featureId: 'FI-001' });
  await client.command('impact.approve', { projectId: 'delta-1', featureId: 'FI-001' });
  return { client, ws };
}

async function settled(client: ContractClient, phase: 'requirements' | 'design') {
  for (let i = 0; i < 400; i++) {
    const view = await client.query('delta.changeSet', { projectId: 'delta-1', featureId: 'FI-001', phase });
    if (view && view.state !== 'running') return view;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timeout');
}

describe('US-089 over IPC with the scripted agent', () => {
  it('AC-1..AC-3/AC-5: produces a change set (new / modified / deprecated), restores the folder, flags nothing; accept and discard', async () => {
    const { client, ws } = await boot();

    expect(await client.command('delta.generate', { projectId: 'delta-1', featureId: 'FI-001', phase: 'requirements' })).toMatchObject({
      ok: true,
    });
    const view = await settled(client, 'requirements');

    expect(view.state).toBe('open');
    expect(view.items.map((i) => [i.kind, i.elementId])).toEqual([
      ['new', 'FR-035'],
      ['modified', 'FR-020'],
      ['deprecated', 'FR-034'],
    ]);
    expect(readFileSync(join(ws, ...FR.split('/')), 'utf8')).toBe(REQS);
    expect(await client.query('impact.flags', { projectId: 'delta-1' })).toEqual([]);
    const fi = await client.query('features.get', { projectId: 'delta-1', featureId: 'FI-001' });
    expect(fi?.phases.find((p) => p.phase === 'requirements')?.state).toBe('awaiting_approval');

    const accepted = await client.command('delta.decide', { itemId: view.items[1]!.id, decision: 'accept' });
    expect(accepted.items.map((i) => i.state)).toEqual(['open', 'accepted', 'open']);
    const all = await client.command('delta.acceptAll', { changeSetId: view.id });
    expect(all.items.every((i) => i.state === 'accepted')).toBe(true);
    await expect(client.command('delta.decide', { itemId: 'nope', decision: 'accept' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('AC-4: the design delta proposes a new ADR as Proposed; discarding every item closes the change set without touching files', async () => {
    const { client, ws } = await boot();
    await client.command('delta.generate', { projectId: 'delta-1', featureId: 'FI-001', phase: 'design' });
    const view = await settled(client, 'design');

    const adr = view.items.find((i) => i.elementId === 'ADR-001')!;
    expect(adr).toMatchObject({ kind: 'new' });
    expect(adr.after).toContain('**Status**: Proposed');
    for (const item of view.items) await client.command('delta.decide', { itemId: item.id, decision: 'discard' });
    expect(await client.query('delta.changeSet', { projectId: 'delta-1', featureId: 'FI-001', phase: 'design' })).toMatchObject({
      state: 'discarded',
    });
    expect(() => readFileSync(join(ws, 'spec', '03_design', 'adr-fi-001.md'), 'utf8')).toThrow();
  });
});

describe('US-090 over IPC with the scripted agent', () => {
  it('AC-1..AC-5 (FR-107): applies accepted changes with the next free ID and feature links; the discarded change leaves its element untouched', async () => {
    const { client, ws } = await boot();
    await client.command('delta.generate', { projectId: 'delta-1', featureId: 'FI-001', phase: 'requirements' });
    const view = await settled(client, 'requirements');
    const byId = new Map(view.items.map((i) => [i.elementId, i]));
    await client.command('delta.decide', { itemId: byId.get('FR-035')!.id, decision: 'accept' });
    await client.command('delta.decide', { itemId: byId.get('FR-020')!.id, decision: 'accept' });
    await client.command('delta.decide', { itemId: byId.get('FR-034')!.id, decision: 'discard' });

    expect(await client.command('delta.apply', { changeSetId: view.id })).toEqual({ applied: [FR], conflicts: [] });

    const content = readFileSync(join(ws, ...FR.split('/')), 'utf8');
    expect(content).toContain('### FR-035: Comment on tasks\n**Feature**: FI-001');
    expect(content).toContain('### FR-020: Export\nChanged by FI-001');
    expect(content).toContain('### FR-034: Task details\nDetails show the title.');
    expect(content).not.toContain('[DEPRECATED]');
    expect(content).toContain('## Changelog\n- ');
    const listed = (await client.query('artifacts.list', { projectId: 'delta-1' })).flatMap((g) => g.artifacts);
    expect(listed.find((a) => a.path === FR)?.approval).toBe('draft');
    const fi = await client.query('features.get', { projectId: 'delta-1', featureId: 'FI-001' });
    expect(fi).toMatchObject({ status: 'in_delivery' });
    expect(fi?.links.find((l) => l.id === 'FR-035')).toEqual({ id: 'FR-035', type: 'introduces' });
    expect(fi?.links.find((l) => l.id === 'FR-020')).toEqual({ id: 'FR-020', type: 'changes' });
    expect(fi?.phases.find((p) => p.phase === 'requirements')?.state).toBe('awaiting_approval');

    await client.command('artifact.approve', { projectId: 'delta-1', path: FR });
    const approved = await client.query('features.get', { projectId: 'delta-1', featureId: 'FI-001' });
    expect(approved?.phases.find((p) => p.phase === 'requirements')?.state).toBe('approved');
  });
});

describe('US-091 over IPC (FR-110)', () => {
  it('a requirement change linked to in-flight US-011 needs a decision; continue flags it, apply in corrections pre-fills the feedback', async () => {
    const { client, ws } = await boot();
    write(
      ws,
      'spec/04_user_stories/US-011.md',
      '---\nkind: story\nid: US-011\ntitle: Export view\napproval: approved\nstatus: in_progress\nrequirements: [FR-020]\n---\n## Description\nx\n',
    );
    write(
      ws,
      'spec/04_user_stories/US-012.md',
      '---\nkind: story\nid: US-012\ntitle: Export file\napproval: approved\nstatus: review\nrequirements: [FR-020]\n---\n## Description\nx\n',
    );
    await client.command('projects.open', { path: ws });
    await client.command('delta.generate', { projectId: 'delta-1', featureId: 'FI-001', phase: 'requirements' });
    const view = await settled(client, 'requirements');
    const modified = view.items.find((i) => i.elementId === 'FR-020')!;
    await client.command('delta.decide', { itemId: modified.id, decision: 'accept' });
    for (const i of view.items.filter((x) => x.id !== modified.id))
      await client.command('delta.decide', { itemId: i.id, decision: 'discard' });

    const first = await client.command('delta.apply', { changeSetId: view.id });
    expect(first).toEqual({
      needsDecision: [
        expect.objectContaining({ storyId: 'US-011', status: 'in_progress', changes: ['changed FR-020'] }),
        expect.objectContaining({ storyId: 'US-012', status: 'review', changes: ['changed FR-020'] }),
      ],
    });
    expect(readFileSync(join(ws, ...FR.split('/')), 'utf8')).toBe(REQS);

    const applied = await client.command('delta.apply', {
      changeSetId: view.id,
      decisions: { 'US-011': 'continue', 'US-012': 'apply_in_corrections' },
    });
    expect(applied).toEqual({ applied: [FR], conflicts: [] });

    const flags = await client.query('impact.flags', { projectId: 'delta-1' });
    expect(flags.find((f) => f.elementId === 'US-011')).toMatchObject({
      sourceRef: 'FI-001',
      reason: expect.stringContaining('continue unchanged'),
    });
    const cards = (await client.query('board.get', { projectId: 'delta-1' })).columns.flatMap((c) => c.cards);
    expect(cards.find((c) => c.storyId === 'US-011')?.inFlight).toEqual({ decision: 'continue', featureId: 'FI-001' });
    expect((await client.query('inflight.feedback', { projectId: 'delta-1', storyId: 'US-012' })).feedback).toContain('changed FR-020');
    const fi = await client.query('features.get', { projectId: 'delta-1', featureId: 'FI-001' });
    expect(fi?.decisions.map((d) => [d.storyId, d.decision]).sort()).toEqual([
      ['US-011', 'continue'],
      ['US-012', 'apply_in_corrections'],
    ]);
  });
});
