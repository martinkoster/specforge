// SPDX-License-Identifier: Apache-2.0
// US-027 integration: a specification run writes into its target folder only; the review lists the changes and
// validation issues; Keep marks the artifact Draft, Discard restores the folder.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
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

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const EXISTING = '---\nkind: requirements\napproval: approved\napproved_at: 2026-10-01T00:00:00.000Z\n---\n### FR-001: Login\n';

async function boot(script: (prompt: string) => MockStep[]): Promise<{ client: ContractClient; workspace: string; projectId: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-spec-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({ script: (request) => script(request.prompt) }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client = await connectClient(wrap(port1));
  // Every relayed write in these tests is allowed by the "user".
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const project = await client.command('projects.create', {
    name: 'Spec',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-spec-ws-')),
    folderName: 'spec-project',
    initGit: false,
  });
  writeFileSync(join(project.path, 'spec', '02_requirements', 'functional_requirements.md'), EXISTING);
  await client.command('projects.openById', { projectId: project.id });
  return { client, workspace: project.path, projectId: project.id };
}

const write = (file_path: string, content: string): MockStep => ({ type: 'tool', toolName: 'Write', input: { file_path, content } });

describe('US-027 over IPC', () => {
  it('AC-1..AC-3: writes only into the target folder; the review shows diffs and issues; Keep marks the artifact Draft', async () => {
    const { client, workspace, projectId } = await boot(() => [
      write(
        'spec/02_requirements/functional_requirements.md',
        '---\nkind: requirements\n---\n### FR-001: Login\n### FR-002: Logout\nSee FR-404.\n',
      ),
      write('spec/03_design/sneaky.md', 'outside the target\n'),
      { type: 'result', text: 'Requirements generated.' },
    ]);
    const ready: string[] = [];
    client.subscribe('spec.reviewReady', (e) => ready.push(e.runId));

    const started = await client.command('specs.generate', {
      projectId,
      target: 'requirements',
      instruction: 'Generate the requirements.',
    });
    expect(started).toEqual({ ok: true, runId: expect.any(String) });
    const runId = (started as { runId: string }).runId;
    const review = await waitFor(async () => {
      const r = await client.query('specs.review', { runId });
      return r?.state === 'open' ? r : undefined;
    });

    expect(existsSync(join(workspace, 'spec', '03_design', 'sneaky.md'))).toBe(false);
    expect(review.files).toEqual([
      { path: 'spec/02_requirements/functional_requirements.md', change: 'M', patch: expect.stringContaining('+### FR-002: Logout') },
    ]);
    expect(review.issues).toEqual([
      {
        path: 'spec/02_requirements/functional_requirements.md',
        kind: 'broken_link',
        message: 'FR-002 references FR-404, which does not exist.',
      },
    ]);
    // The event is delivered over the port independently of the query that already sees the open review.
    await waitFor(async () => (ready.length > 0 ? true : undefined));
    expect(ready).toEqual([runId]);
    expect(await client.query('specs.openReview', { projectId, target: 'requirements' })).toMatchObject({ runId, state: 'open' });
    const denied = (await client.query('runs.events', { runId })).filter((e) => e.type === 'tool_result');
    expect(denied.map((e) => (e.payload as { isError: boolean }).isError)).toEqual([false, true]);

    await expect(client.command('specs.keep', { runId })).resolves.toEqual({ ok: true });
    const kept = readFileSync(join(workspace, 'spec', '02_requirements', 'functional_requirements.md'), 'utf8');
    expect(kept).toMatch(/approval: draft/);
    expect(kept).toContain(`generated_by: ${runId}`);
    expect(await client.query('specs.openReview', { projectId, target: 'requirements' })).toBeNull();
  });

  it('AC-3/AC-4: Ask agent to fix runs again with the issues; Discard restores the pre-run folder', async () => {
    const prompts: string[] = [];
    const { client, workspace, projectId } = await boot((prompt) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? [write('spec/02_requirements/new.md', '### FR-001: Duplicate\n'), { type: 'result', text: 'Done.' }]
        : [write('spec/02_requirements/new.md', '### FR-003: Fixed\n'), { type: 'result', text: 'Fixed.' }];
    });
    const first = (await client.command('specs.generate', { projectId, target: 'requirements', instruction: 'Go' })) as { runId: string };
    const review = await waitFor(async () => {
      const r = await client.query('specs.review', { runId: first.runId });
      return r?.state === 'open' ? r : undefined;
    });
    expect(review.issues).toEqual([expect.objectContaining({ kind: 'duplicate_id' })]);

    const fix = (await client.command('specs.fix', { runId: first.runId })) as { runId: string };
    const fixed = await waitFor(async () => {
      const r = await client.query('specs.review', { runId: fix.runId });
      return r?.state === 'open' ? r : undefined;
    });
    expect(prompts[1]).toContain('FR-001 is already defined in spec/02_requirements/functional_requirements.md.');
    expect(fixed).toMatchObject({
      parentRunId: first.runId,
      issues: [],
      files: [expect.objectContaining({ path: 'spec/02_requirements/new.md', change: 'A' })],
    });

    await expect(client.command('specs.discard', { runId: fix.runId })).resolves.toEqual({ ok: true });
    expect(existsSync(join(workspace, 'spec', '02_requirements', 'new.md'))).toBe(false);
    expect(readFileSync(join(workspace, 'spec', '02_requirements', 'functional_requirements.md'), 'utf8')).toBe(EXISTING);
    await expect(client.command('specs.discard', { runId: fix.runId })).resolves.toEqual({
      ok: false,
      reason: 'This review is already closed.',
    });
  });
});
