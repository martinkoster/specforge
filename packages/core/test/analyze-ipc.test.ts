// SPDX-License-Identifier: Apache-2.0
// US-080 integration: the codebase analysis of an adopted project with the scripted test agent — drafts below the
// specification root, review with Keep/Discard, and no source file changes (even around the permission relay).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const SOURCES: Record<string, string> = {
  Gemfile: "source 'https://rubygems.org'\ngem 'rails', '7.1.0'\n",
  'README.md': '# Shop\n',
  'app/models/user.rb': 'class User; end\n',
};
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

async function adopted(): Promise<{ client: ContractClient; workspace: string; projectId: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-analyze-app-')),
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
  // The "user" allows every relayed request; the built-in policy still denies writes outside the specification root.
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const workspace = mkdtempSync(join(tmpdir(), 'sf-analyze-ws-'));
  for (const [path, content] of Object.entries(SOURCES)) {
    mkdirSync(join(workspace, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(workspace, ...path.split('/')), content);
  }
  const project = await client.command('projects.adopt', { name: 'Shop', path: workspace, specRoot: 'docs/spec', initGit: false });
  return { client, workspace, projectId: project.id };
}

async function finished(client: ContractClient, runId: string) {
  return waitFor(async () => {
    const r = await client.query('specs.review', { runId });
    return r && r.state !== 'running' ? r : undefined;
  });
}

describe('US-080 over IPC with the scripted agent', () => {
  it('AC-2..AC-4: drafts intent, design and requirements below docs/spec; Keep makes them Draft artifacts; Discard restores', async () => {
    const { client, workspace, projectId } = await adopted();
    const before = Object.fromEntries(Object.keys(SOURCES).map((p) => [p, hash(join(workspace, ...p.split('/')))]));

    expect(await client.query('specs.analysisAvailable', { projectId })).toEqual({ available: true });
    const started = await client.command('specs.analyze', { projectId });
    expect(started).toMatchObject({ ok: true });
    const runId = (started as { runId: string }).runId;
    const review = await finished(client, runId);

    expect(review).toMatchObject({ kind: 'analyze', target: 'docs/spec', state: 'open', issues: [] });
    expect(review.files.map((f) => f.path).sort()).toEqual([
      'docs/spec/01_intent/intent.md',
      'docs/spec/02_requirements/current_requirements.md',
      'docs/spec/03_design/current_state.md',
    ]);
    expect(readFileSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'), 'utf8')).toContain('## Desired change');
    expect(await client.query('specs.openAnalysis', { projectId })).toMatchObject({ runId });

    expect(await client.command('specs.keep', { runId })).toEqual({ ok: true });
    const artifacts = (await client.query('artifacts.list', { projectId })).flatMap((g) => g.artifacts);
    expect(artifacts.find((a) => a.path === 'docs/spec/01_intent/intent.md')).toMatchObject({ approval: 'draft' });
    for (const [path, h] of Object.entries(before)) expect(hash(join(workspace, ...path.split('/'))), path).toBe(h);

    // A second analysis that is discarded leaves the kept drafts as they were.
    const again = (await client.command('specs.analyze', { projectId, limitTo: ['app'] })) as { runId: string };
    await finished(client, again.runId);
    writeFileSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'), 'scribbled\n');
    expect(await client.command('specs.discard', { runId: again.runId })).toEqual({ ok: true });
    expect(readFileSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'), 'utf8')).toContain('## Desired change');
  });

  it('AC-5: a source write is denied and a write around the relay fails the run, is listed and restored', async () => {
    const { client, workspace, projectId } = await adopted();
    const readme = hash(join(workspace, 'README.md'));

    const started = (await client.command('specs.analyze', { projectId, limitTo: ['intrude'] })) as { runId: string };
    const review = await finished(client, started.runId);

    expect(review.state).toBe('failed');
    expect(review.reason).toContain('README.md');
    expect(hash(join(workspace, 'README.md'))).toBe(readme);
    expect(existsSync(join(workspace, 'src', 'intruder.ts'))).toBe(false);
    expect(await client.command('specs.discard', { runId: started.runId })).toEqual({ ok: true });
    expect(existsSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'))).toBe(false);
  });
});
