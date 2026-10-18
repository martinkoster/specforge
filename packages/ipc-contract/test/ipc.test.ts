// SPDX-License-Identifier: Apache-2.0
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTRACT,
  CONTRACT_VERSION,
  IpcValidationError,
  connectClient,
  serveContract,
  type ContractClient,
  type PortLike,
} from '../src/index.js';

const open: MessagePort[] = [];
afterEach(() => {
  for (const p of open.splice(0)) p.close();
});

function nodePort(port: MessagePort): PortLike {
  open.push(port);
  return {
    postMessage: (m) => port.postMessage(m),
    onMessage: (listener) => port.on('message', listener),
  };
}

function pair(): [PortLike, PortLike] {
  const { port1, port2 } = new MessageChannel();
  return [nodePort(port1), nodePort(port2)];
}

async function setup(): Promise<{ client: ContractClient; core: ReturnType<typeof serveContract> }> {
  const [ui, coreSide] = pair();
  const core = serveContract(coreSide, {
    'system.ping': async ({ nonce }) => ({ nonce, pid: 4242 }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
  });
  const client = await connectClient(ui);
  return { client, core };
}

describe('US-006 AC-1: commands, queries and events as zod schemas with inferred types', () => {
  it('defines commands, queries and events with input/output schemas', () => {
    expect(Object.keys(CONTRACT.commands)).toContain('system.ping');
    expect(Object.keys(CONTRACT.queries)).toContain('system.info');
    expect(Object.keys(CONTRACT.events)).toContain('run.output');
    expect(CONTRACT.commands['system.ping'].input.safeParse({ nonce: 'x' }).success).toBe(true);
    expect(CONTRACT.events['run.output'].safeParse({ runId: 'r', seq: 1, text: 'hi' }).success).toBe(true);
  });

  it('round-trips a typed command and query over a MessagePort', async () => {
    const { client } = await setup();

    const pong = await client.command('system.ping', { nonce: 'abc' });
    const info = await client.query('system.info', {});

    expect(pong).toEqual({ nonce: 'abc', pid: 4242 });
    expect(info.contractVersion).toBe(CONTRACT_VERSION);
  });
});

describe('US-006 AC-2: invalid messages are rejected with a typed error on both sides', () => {
  it('rejects an invalid payload in the client before sending (renderer side)', async () => {
    const { client } = await setup();

    await expect(client.command('system.ping', { nonce: 42 } as never)).rejects.toBeInstanceOf(IpcValidationError);
  });

  it('rejects a malformed request on the core side and answers with a validation error', async () => {
    const [ui, coreSide] = pair();
    serveContract(coreSide, {
      'system.ping': async ({ nonce }) => ({ nonce, pid: 1 }),
      'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    });
    const replies: unknown[] = [];
    ui.onMessage((m) => replies.push(m));

    ui.postMessage({ kind: 'request', id: 1, type: 'command', name: 'system.ping', payload: { nonce: { evil: true } } });
    ui.postMessage({ kind: 'request', id: 2, type: 'command', name: 'system.nope', payload: {} });
    ui.postMessage('garbage');
    await new Promise((r) => setTimeout(r, 50));

    expect(replies).toEqual([
      expect.objectContaining({ kind: 'response', id: 1, ok: false, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
      expect.objectContaining({ kind: 'response', id: 2, ok: false, error: expect.objectContaining({ code: 'UNKNOWN_OPERATION' }) }),
    ]);
  });

  it('surfaces a core-side validation error to the caller as IpcValidationError', async () => {
    const [ui, coreSide] = pair();
    serveContract(coreSide, {
      'system.ping': async () => ({ nonce: 'x', pid: 'not-a-number' }) as never,
      'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    });
    const client = await connectClient(ui);

    await expect(client.command('system.ping', { nonce: 'x' })).rejects.toBeInstanceOf(IpcValidationError);
  });

  it('rejects an event that does not match its schema', async () => {
    const { core } = await setup();

    expect(() => core.emit('run.output', { runId: 'r', seq: 'one', text: 'x' } as never)).toThrow(IpcValidationError);
  });
});

describe('US-006 AC-3: contract version handshake', () => {
  it('connects when the major versions match', async () => {
    const [ui, coreSide] = pair();
    serveContract(coreSide, {
      'system.ping': async ({ nonce }) => ({ nonce, pid: 1 }),
      'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    });

    await expect(connectClient(ui)).resolves.toBeDefined();
  });

  it('fails with a clear error on a major version mismatch', async () => {
    const [ui, coreSide] = pair();
    serveContract(
      coreSide,
      {
        'system.ping': async ({ nonce }) => ({ nonce, pid: 1 }),
        'system.info': async () => ({ contractVersion: '99.0.0', platform: 'test' }),
      },
      { version: '99.0.0' },
    );

    await expect(connectClient(ui)).rejects.toThrow(
      `Incompatible SpecForge components: UI contract ${CONTRACT_VERSION}, core contract 99.0.0. Please restart or reinstall SpecForge.`,
    );
  });

  it('times out when the core does not answer the handshake', async () => {
    const [ui] = pair();

    await expect(connectClient(ui, { timeoutMs: 50 })).rejects.toThrow(/did not answer/);
  });
});

describe('US-006 AC-4: batched event delivery', () => {
  // The latency bounds (50 ms flush, 500 events < 500 ms) are verified in ipc.perf.test.ts (`pnpm test:perf`).
  it('delivers high-frequency events in batches and in order', async () => {
    const { client, core } = await setup();
    const received: number[] = [];
    const batches: number[] = [];
    client.subscribe('run.output', (e) => received.push(e.seq), { onBatch: (n) => batches.push(n) });

    const t0 = Date.now();
    for (let seq = 1; seq <= 500; seq++) core.emit('run.output', { runId: 'r1', seq, text: `line ${seq}` });
    while (received.length < 500 && Date.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 5));

    expect(received).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    expect(batches.length).toBeLessThan(10);
  });

  it('flushes a single event without waiting for more', async () => {
    const { client, core } = await setup();
    let latency = -1;
    const t0 = Date.now();
    client.subscribe('run.output', () => (latency = Date.now() - t0));

    core.emit('run.output', { runId: 'r1', seq: 1, text: 'x' });
    while (latency < 0 && Date.now() - t0 < 500) await new Promise((r) => setTimeout(r, 2));

    expect(latency).toBeGreaterThanOrEqual(0);
  });

  it('stops delivering after unsubscribe', async () => {
    const { client, core } = await setup();
    const received: number[] = [];
    const unsubscribe = client.subscribe('run.output', (e) => received.push(e.seq));
    unsubscribe();

    core.emit('run.output', { runId: 'r1', seq: 1, text: 'x' });
    await new Promise((r) => setTimeout(r, 80));

    expect(received).toEqual([]);
  });
});
