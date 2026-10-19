// SPDX-License-Identifier: Apache-2.0
// Test helper: a CoreSession connected to an in-memory core serving the given contract handlers.
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { CONTRACT_VERSION, serveContract, type ContractHandlers, type ContractServer, type PortLike } from '@specforge/ipc-contract';
import { CoreSession } from '../src/core/core-session.js';

const open: MessagePort[] = [];

export function closeFakeCores(): void {
  for (const p of open.splice(0)) p.close();
}

function wrap(port: MessagePort): PortLike {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
}

export async function fakeCore(handlers: ContractHandlers): Promise<CoreSession> {
  return (await fakeCoreWithEvents(handlers)).session;
}

/** Like `fakeCore`, plus the server to emit core events. */
export async function fakeCoreWithEvents(handlers: ContractHandlers): Promise<{ session: CoreSession; server: ContractServer }> {
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), {
    'system.ping': async ({ nonce }) => ({ nonce, pid: 1 }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    ...handlers,
  });
  const session = new CoreSession();
  await session.attach(wrap(port1));
  return { session, server };
}
