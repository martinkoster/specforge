// SPDX-License-Identifier: Apache-2.0
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { CONTRACT_VERSION, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { CoreSession, type CoreStatus } from '../src/core/core-session.js';

const open: MessagePort[] = [];
afterEach(() => {
  for (const p of open.splice(0)) p.close();
});

function wrap(port: MessagePort): PortLike {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
}

function core(pid: number): PortLike {
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), {
    'system.ping': async ({ nonce }) => ({ nonce, pid }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
  });
  return wrap(port1);
}

describe('US-022 (shell wiring): renderer session over the IPC contract', () => {
  it('connects through the contract handshake and pings the core', async () => {
    const session = new CoreSession();
    const statuses: CoreStatus[] = [];
    session.onStatus((s) => statuses.push(s));

    await session.attach(core(4242));

    expect(statuses).toEqual(['connected']);
    await expect(session.ping()).resolves.toMatchObject({ pid: 4242 });
  });

  it('switches to a new core after a restart', async () => {
    const session = new CoreSession();
    await session.attach(core(1));
    session.setStatus('reconnecting');
    await expect(session.ping()).rejects.toThrow(/not connected/);

    await session.attach(core(2));

    await expect(session.ping()).resolves.toMatchObject({ pid: 2 });
  });

  it('reports a failed handshake', async () => {
    const session = new CoreSession({ handshakeTimeoutMs: 50 });
    const statuses: CoreStatus[] = [];
    session.onStatus((s) => statuses.push(s));
    const { port1 } = new MessageChannel();

    await session.attach(wrap(port1));

    expect(statuses).toEqual(['failed']);
    expect(session.lastError).toMatch(/did not answer/);
  });

  it('exposes the contract client for queries', async () => {
    const session = new CoreSession();
    await session.attach(core(7));

    await expect(session.client().query('system.info', {})).resolves.toEqual({ contractVersion: CONTRACT_VERSION, platform: 'test' });
  });
});
