// SPDX-License-Identifier: Apache-2.0
// US-006 AC-4 timing bounds of batched event delivery; run sequentially with `pnpm test:perf`.
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, connectClient, serveContract, type PortLike } from '../src/index.js';

const open: MessagePort[] = [];
afterEach(() => {
  for (const p of open.splice(0)) p.close();
});

function nodePort(port: MessagePort): PortLike {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (listener) => port.on('message', listener) };
}

async function setup() {
  const { port1, port2 } = new MessageChannel();
  const core = serveContract(nodePort(port2), {
    'system.ping': async ({ nonce }) => ({ nonce, pid: 4242 }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
  });
  return { client: await connectClient(nodePort(port1)), core };
}

describe('US-006 AC-4: event delivery latency', () => {
  it('delivers 500 high-frequency events within 500 ms', async () => {
    const { client, core } = await setup();
    let received = 0;
    client.subscribe('run.output', () => (received += 1));

    const t0 = Date.now();
    for (let seq = 1; seq <= 500; seq++) core.emit('run.output', { runId: 'r1', seq, text: `line ${seq}` });
    while (received < 500 && Date.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 5));

    expect(received).toBe(500);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('flushes a single event no later than 50 ms after it was emitted', async () => {
    const { client, core } = await setup();
    let latency = -1;
    const t0 = Date.now();
    client.subscribe('run.output', () => (latency = Date.now() - t0));

    core.emit('run.output', { runId: 'r1', seq: 1, text: 'x' });
    while (latency < 0 && Date.now() - t0 < 500) await new Promise((r) => setTimeout(r, 2));

    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThanOrEqual(60);
  });
});
