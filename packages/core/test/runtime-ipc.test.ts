// SPDX-License-Identifier: Apache-2.0
// US-010 AC-3: detection/verification results are stored in agent_runtime and exposed via IPC.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { AgentRuntimeRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeHandlers } from '../src/index.js';

const open: Array<{ close(): void }> = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function setup(detectResult: unknown, verifyResult: unknown) {
  const db: OpenDatabase = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-rt-')) });
  open.push(db);
  const repository = new AgentRuntimeRepository(db.sqlite);
  const { port1, port2 } = new MessageChannel();
  serveContract(
    wrap(port2),
    createRuntimeHandlers({
      detect: async () => detectResult as never,
      verify: async () => verifyResult as never,
      repository,
    }),
  );
  return { client: await connectClient(wrap(port1)), repository };
}

describe('US-010 AC-3: runtime.detect / runtime.verify over IPC, stored in agent_runtime', () => {
  it('detects, returns the result to the UI and stores it', async () => {
    const { client, repository } = await setup({ found: true, path: '/usr/bin/claude', version: '2.1.299', source: 'path' }, undefined);

    await expect(client.command('runtime.detect', {})).resolves.toEqual({ found: true, path: '/usr/bin/claude', version: '2.1.299' });
    expect(repository.get('claude-code')).toMatchObject({
      adapterType: 'claude-code',
      executablePath: '/usr/bin/claude',
      detectedVersion: '2.1.299',
    });
  });

  it('reports "not found" without storing anything', async () => {
    const { client, repository } = await setup({ found: false, searched: ['/usr/bin/claude'] }, undefined);

    await expect(client.command('runtime.detect', {})).resolves.toEqual({ found: false, searched: ['/usr/bin/claude'] });
    expect(repository.get('claude-code')).toBeUndefined();
  });

  it('verifies a manual path, stores it with verified_at, and returns specific errors', async () => {
    const ok = await setup(undefined, { ok: true, path: '/opt/claude', version: '2.2.0' });
    await expect(ok.client.command('runtime.verify', { path: '/opt/claude' })).resolves.toEqual({
      ok: true,
      path: '/opt/claude',
      version: '2.2.0',
    });
    expect(ok.repository.get('claude-code')).toMatchObject({
      executablePath: '/opt/claude',
      detectedVersion: '2.2.0',
      verifiedAt: expect.any(String),
    });

    const bad = await setup(undefined, { ok: false, error: 'too_old', message: 'Claude Code 1.0.0 is older than the required 2.1.0.' });
    await expect(bad.client.command('runtime.verify', { path: '/old/claude' })).resolves.toEqual({
      ok: false,
      error: 'too_old',
      message: 'Claude Code 1.0.0 is older than the required 2.1.0.',
    });
    expect(bad.repository.get('claude-code')).toBeUndefined();
  });

  it('answers operations without a registered handler with NOT_IMPLEMENTED', async () => {
    const { client } = await setup(undefined, undefined);

    await expect(client.command('system.ping', { nonce: 'x' })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
