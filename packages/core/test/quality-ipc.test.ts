// SPDX-License-Identifier: Apache-2.0
// US-029 integration: read-only quality check, findings, Apply fix (refine proposal → applied when kept), dismiss.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { RunRequest } from '@specforge/application';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
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

const PATH = 'spec/02_requirements/functional_requirements.md';
const FINDINGS = JSON.stringify({
  findings: [
    { severity: 'major', element: 'FR-001', category: 'testability', explanation: 'No acceptance criterion.', suggestedFix: 'Add one.' },
    { severity: 'info', category: 'style', explanation: 'Consider a glossary.' },
  ],
});

function script(request: RunRequest): MockStep[] {
  if (request.kind === 'quality_check') {
    return [
      { type: 'tool', toolName: 'Write', input: { file_path: PATH, content: 'tampered\n' } },
      { type: 'result', text: `Done.\n\`\`\`specforge-result\n${FINDINGS}\n\`\`\`\n` },
    ];
  }
  return [
    {
      type: 'tool',
      toolName: 'Write',
      input: { file_path: PATH, content: '---\nkind: requirements\n---\n### FR-001: Login\n**Acceptance**: Login works in 2 s.\n' },
    },
    { type: 'result', text: 'Fixed.' },
  ];
}

describe('US-029 over IPC', () => {
  it('AC-1..AC-4: quality check findings, read-only run, Apply fix proposal, dismiss, open count', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-quality-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: new MockAdapter({ script }),
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
    const checked: string[] = [];
    client.subscribe('quality.checked', (e) => checked.push(e.path));

    const project = await client.command('projects.create', {
      name: 'Q',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-quality-ws-')),
      folderName: 'q',
      initGit: false,
    });
    const original = '---\nkind: requirements\n---\n### FR-001: Login\n';
    writeFileSync(join(project.path, PATH), original);
    await client.command('projects.openById', { projectId: project.id });

    await expect(client.command('quality.check', { projectId: project.id, path: PATH })).resolves.toMatchObject({ ok: true });
    await vi.waitFor(() => expect(checked).toEqual([PATH]), { timeout: 30_000 });
    // The check is read-only: its write attempt was denied.
    expect(readFileSync(join(project.path, PATH), 'utf8')).toBe(original);

    const findings = await client.query('quality.findings', { projectId: project.id, path: PATH });
    expect(findings.map((f) => [f.severity, f.elementId, f.state])).toEqual([
      ['major', 'FR-001', 'open'],
      ['info', null, 'open'],
    ]);

    const fix = await client.command('quality.applyFix', { findingId: findings[0]!.id });
    expect(fix).toMatchObject({ ok: true });
    const fixRun = (fix as { runId: string }).runId;
    await vi.waitFor(async () => expect((await client.query('specs.review', { runId: fixRun }))?.state).toBe('open'), { timeout: 30_000 });
    await expect(client.command('specs.keep', { runId: fixRun })).resolves.toEqual({ ok: true });
    expect(readFileSync(join(project.path, PATH), 'utf8')).toContain('Login works in 2 s.');

    await expect(client.command('quality.dismiss', { findingId: findings[1]!.id, reason: 'Not needed.' })).resolves.toEqual({ ok: true });
    expect((await client.query('quality.findings', { projectId: project.id, path: PATH })).map((f) => [f.state, f.dismissReason])).toEqual([
      ['applied', null],
      ['dismissed', 'Not needed.'],
    ]);
    expect(existsSync(join(project.path, PATH))).toBe(true);
  });
});
