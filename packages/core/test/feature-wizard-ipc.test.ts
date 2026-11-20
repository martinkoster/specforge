// SPDX-License-Identifier: Apache-2.0
// US-082 integration: wizard drafts survive an app restart; saving writes the feature intent and indexes it.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore, type Core } from '../src/index.js';
import { createTestAgent } from '../src/test-agent.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function boot(appDataDir: string): Promise<{ core: Core; client: ContractClient }> {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { core, client: await connectClient(wrap(port1)) };
}

describe('US-082 over IPC', () => {
  it('AC-3/AC-4: a draft resumes after a restart at the same step; Save & approve writes and indexes FI-001', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-wiz-app-'));
    const ws = mkdtempSync(join(tmpdir(), 'sf-wiz-ws-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: wiz-p\nname: Wizard\nschemaVersion: 1\n');
    mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });

    const first = await boot(appData);
    await first.client.command('projects.open', { path: ws });
    const created = await first.client.command('features.wizard.create', {
      projectId: 'wiz-p',
      draft: { text: 'Users can comment on tasks' },
    });
    await first.client.command('features.wizard.update', {
      wizardId: created.id,
      step: 'save',
      draft: { text: 'Users can comment on tasks', priority: 'should', motivation: undefined },
    });
    await first.core.close();

    const second = await boot(appData);
    expect(await second.client.query('features.wizard.drafts', { projectId: 'wiz-p' })).toEqual([
      { id: created.id, title: 'Users can comment on tasks', step: 'save', updatedAt: expect.any(String) },
    ]);
    expect(await second.client.query('features.wizard.get', { wizardId: created.id })).toMatchObject({
      step: 'save',
      draft: { text: 'Users can comment on tasks', priority: 'should' },
    });
    const preview = await second.client.query('features.wizard.preview', { wizardId: created.id, title: 'Task comments' });
    expect(preview).toMatchObject({ featureId: 'FI-001', path: 'spec/01_intent/FI-001-task-comments.md' });

    const saved = await second.client.command('features.wizard.save', { wizardId: created.id, title: 'Task comments', approve: true });

    expect(saved).toEqual({ featureId: 'FI-001', path: 'spec/01_intent/FI-001-task-comments.md' });
    expect(readFileSync(join(ws, 'spec', '01_intent', 'FI-001-task-comments.md'), 'utf8')).toContain('approval: approved');
    expect(await second.client.query('features.list', { projectId: 'wiz-p' })).toMatchObject([
      { id: 'FI-001', title: 'Task comments', approval: 'approved' },
    ]);
    expect(await second.client.query('features.wizard.drafts', { projectId: 'wiz-p' })).toEqual([]);
    await expect(second.client.command('features.wizard.save', { wizardId: created.id, title: 'x', approve: false })).rejects.toMatchObject(
      {
        code: 'INVALID_REQUEST',
      },
    );
  });
});

describe('US-083 over IPC with the scripted agent', () => {
  it('AC-5: the FR-103 example produces FI-001-task-comments.md with the clarified answer', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'sf-wiz-ai-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: wiz-ai\nname: Wizard AI\nschemaVersion: 1\n');
    mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });
    writeFileSync(join(ws, 'spec', '01_intent', 'intent.md'), '---\nkind: intent\napproval: approved\n---\n# Intent\n');
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-wiz-ai-app-')),
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
    await client.command('projects.open', { path: ws });
    const wizard = await client.command('features.wizard.create', { projectId: 'wiz-ai', draft: { text: 'Users can comment on tasks' } });
    const ready = async () => {
      for (let i = 0; i < 400; i++) {
        const w = await client.query('features.wizard.get', { wizardId: wizard.id });
        if (w?.draft.review && w.draft.review.state !== 'running') return w;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('timeout');
    };

    expect(await client.command('features.wizard.review', { wizardId: wizard.id })).toMatchObject({ ok: true });
    const reviewed = await ready();
    expect(reviewed.draft.title).toBe('Task comments');
    expect(reviewed.draft.review?.questions.map((q) => q.text)).toEqual(['Which formatting may comments use?']);

    expect(await client.command('features.wizard.answer', { wizardId: wizard.id, answers: { q1: 'Markdown' } })).toMatchObject({
      ok: true,
    });
    const clarified = await ready();
    expect(clarified).toMatchObject({ step: 'clarify', draft: { review: { done: true } } });

    const saved = await client.command('features.wizard.save', { wizardId: wizard.id, title: clarified.draft.title!, approve: true });
    expect(saved.path).toBe('spec/01_intent/FI-001-task-comments.md');
    const content = readFileSync(join(ws, 'spec', '01_intent', 'FI-001-task-comments.md'), 'utf8');
    expect(content).toContain('| 1 | Which formatting may comments use? | Markdown |');
    expect(content).toContain('- Comments use Markdown');
    expect(content).toContain('### In scope\n- Comments on tasks');
  });
});

describe('US-095 over IPC (FR-111)', () => {
  it('AC-2..AC-4: a captured idea is appended to ideas.md and indexed; Turn into feature links the saved feature', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'sf-idea-ws-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: idea-p\nname: Ideas\nschemaVersion: 1\n');
    mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });
    writeFileSync(
      join(ws, 'spec', '01_intent', 'FI-001-comments.md'),
      '---\nkind: feature_intent\nid: FI-001\ntitle: Comments\napproval: approved\nstatus: approved\n---\n## Problem\nx\n',
    );
    const { client } = await boot(mkdtempSync(join(tmpdir(), 'sf-idea-app-')));
    await client.command('projects.open', { path: ws });

    const idea = await client.command('ideas.capture', { projectId: 'idea-p', text: 'Export board as PDF', source: 'shortcut' });
    expect(idea).toMatchObject({ id: 'IDEA-001', state: 'new', source: 'shortcut' });
    await client.command('ideas.capture', { projectId: 'idea-p', text: 'Keyboard moves', note: 'From the retro', source: 'dashboard' });
    expect(readFileSync(join(ws, 'spec', '01_intent', 'ideas.md'), 'utf8')).toContain('## IDEA-002: Keyboard moves\n- created: ');
    expect(await client.query('ideas.list', { projectId: 'idea-p' })).toMatchObject({ untriaged: 2 });

    const wizard = await client.command('features.wizard.create', {
      projectId: 'idea-p',
      draft: { text: idea.text },
      sourceIdea: idea.id,
    });
    expect(wizard.draft.text).toBe('Export board as PDF');
    const saved = await client.command('features.wizard.save', { wizardId: wizard.id, title: 'Board export', approve: false });
    expect(saved.featureId).toBe('FI-002');
    expect(readFileSync(join(ws, ...saved.path.split('/')), 'utf8')).toContain('source_idea: IDEA-001');

    await client.command('ideas.merge', { projectId: 'idea-p', ideaId: 'IDEA-002', featureId: 'FI-001' });
    const { ideas, untriaged } = await client.query('ideas.list', { projectId: 'idea-p' });
    expect(untriaged).toBe(0);
    expect(ideas.map((i) => [i.id, i.state, i.featureId])).toEqual([
      ['IDEA-001', 'turned_into_feature', 'FI-002'],
      ['IDEA-002', 'merged', 'FI-001'],
    ]);
    expect(readFileSync(join(ws, 'spec', '01_intent', 'ideas.md'), 'utf8')).toContain('state: turned_into_feature → FI-002');
    await expect(client.command('ideas.dismiss', { projectId: 'idea-p', ideaId: 'IDEA-001', reason: 'x' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
});
