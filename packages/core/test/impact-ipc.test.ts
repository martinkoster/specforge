// SPDX-License-Identifier: Apache-2.0
// US-087 integration: trace-based impact of a feature through the real index, approval and the feature stepper.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
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

describe('US-087 over IPC', () => {
  it('AC-1..AC-4: proposes the trace impact, edits it, approves it and advances the feature stepper', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-imp87-app-')),
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
    const ws = mkdtempSync(join(tmpdir(), 'sf-imp87-ws-'));
    write(ws, '.specforge/project.yaml', 'id: imp87\nname: Impact\nschemaVersion: 1\n');
    write(
      ws,
      'spec/01_intent/FI-001-comments.md',
      '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\napproval: approved\nstatus: approved\nrelated_requirements: [FR-034]\n---\n## Problem\nx\n',
    );
    write(
      ws,
      'spec/02_requirements/functional_requirements.md',
      '---\nkind: requirements\napproval: approved\n---\n### FR-034: Task details\nx\n',
    );
    write(ws, 'spec/03_design/design.md', '---\nkind: design\napproval: approved\n---\n### UC-004: View task\nUses FR-034.\n');
    write(
      ws,
      'spec/04_user_stories/US-008.md',
      '---\nkind: story\nid: US-008\ntitle: Details\napproval: approved\nstatus: done\nrequirements: [FR-034]\n---\n## Description\nx\n',
    );
    await client.command('projects.open', { path: ws });

    const proposed = await client.command('impact.propose', { projectId: 'imp87', featureId: 'FI-001' });
    expect(proposed.state).toBe('proposed');
    expect(proposed.items.map((i) => `${i.category}:${i.targetRef}`).sort()).toEqual([
      'design:UC-004',
      'requirement:FR-034',
      'story_done:US-008',
    ]);

    const withPath = await client.command('impact.add', { projectId: 'imp87', featureId: 'FI-001', ref: 'src/task.ts' });
    expect(withPath.columns.code.map((i) => i.targetRef)).toEqual(['src/task.ts']);
    await expect(client.command('impact.add', { projectId: 'imp87', featureId: 'FI-001', ref: 'FR-404' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    const design = withPath.items.find((i) => i.targetRef === 'UC-004')!;
    await client.command('impact.remove', { projectId: 'imp87', featureId: 'FI-001', itemId: design.id });
    const approved = await client.command('impact.approve', { projectId: 'imp87', featureId: 'FI-001' });
    expect(approved.state).toBe('confirmed');

    const fi = await client.query('features.get', { projectId: 'imp87', featureId: 'FI-001' });
    expect(
      fi?.impact?.items
        .filter((i) => i.confirmed)
        .map((i) => i.targetRef)
        .sort(),
    ).toEqual(['FR-034', 'US-008', 'src/task.ts']);
    expect(fi?.phases.find((p) => p.phase === 'impact')?.state).toBe('approved');
    expect(fi?.current).toBe('requirements');
  });
});

describe('US-088 over IPC with the scripted agent', () => {
  it('AC-4: the FR-106 example yields the data-model element, the epic and the rework candidate, each with a reason', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-imp88-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: createTestAgent(),
    });
    open.push(core);
    const { port1, port2 } = new MessageChannel();
    serveContract(wrap(port2), core.handlers);
    const client = await connectClient(wrap(port1));
    const ws = mkdtempSync(join(tmpdir(), 'sf-imp88-ws-'));
    write(ws, '.specforge/project.yaml', 'id: imp88\nname: Impact AI\nschemaVersion: 1\n');
    write(
      ws,
      'spec/01_intent/FI-001-task-comments.md',
      '---\nkind: feature_intent\nid: FI-001\ntitle: Task comments\napproval: approved\nstatus: approved\nrelated_epics: [EP-002]\n---\n## Problem\nx\n',
    );
    write(ws, 'spec/03_design/design.md', '---\nkind: design\napproval: approved\n---\n### UC-010: Task data model\nTasks.\n');
    write(
      ws,
      'spec/04_user_stories/epics/EP-002.md',
      '---\nkind: epic\nid: EP-002\ntitle: Task management\napproval: approved\n---\n## Goal\nx\n',
    );
    write(
      ws,
      'spec/04_user_stories/US-008.md',
      '---\nkind: story\nid: US-008\ntitle: Task detail view\napproval: approved\nstatus: done\nepic: EP-002\n---\n## Description\nx\n',
    );
    await client.command('projects.open', { path: ws });
    await client.command('impact.propose', { projectId: 'imp88', featureId: 'FI-001' });

    expect(await client.command('impact.analyse', { projectId: 'imp88', featureId: 'FI-001' })).toMatchObject({ ok: true });
    let view = await client.query('impact.view', { projectId: 'imp88', featureId: 'FI-001' });
    for (let i = 0; i < 200 && view.analysing; i++) {
      await new Promise((r) => setTimeout(r, 25));
      view = await client.query('impact.view', { projectId: 'imp88', featureId: 'FI-001' });
    }

    const byRef = new Map(view.items.map((i) => [i.targetRef, i]));
    expect(byRef.get('UC-010')).toMatchObject({ origin: 'agent', category: 'design', reason: expect.stringContaining('data model') });
    expect(byRef.get('EP-002')).toMatchObject({ origin: 'trace', confidence: 'high', reason: 'Related epic of FI-001' });
    expect(byRef.get('US-008')).toMatchObject({ category: 'story_done', reason: expect.any(String) });
    expect(view.items.filter((i) => i.targetRef === 'EP-002')).toHaveLength(1);
  });
});
