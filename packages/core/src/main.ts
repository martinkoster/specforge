// SPDX-License-Identifier: Apache-2.0
// Core utilityProcess entry (ADR-002): opens the core, receives its MessagePort from main and serves the IPC contract. Verified end-to-end.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveContract, type PortLike } from '@specforge/ipc-contract';
import { createCore } from './composition.js';
import { BridgeSecretStore } from './secret-bridge.js';
import { createTestAgent } from './test-agent.js';

interface PortMain {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
  start(): void;
}

interface ParentPort {
  on(event: 'message', listener: (event: { data: unknown; ports: PortMain[] }) => void): void;
  postMessage(message: unknown): void;
}

const appDataDir = process.env.SPECFORGE_APP_DATA;
if (!appDataDir) throw new Error('SPECFORGE_APP_DATA is not set; the core must be started by the SpecForge main process.');

// A crashing core is restarted by main (US-005); record why it crashed.
const crashed = (error: unknown): never => {
  try {
    mkdirSync(join(appDataDir, 'logs'), { recursive: true });
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    appendFileSync(
      join(appDataDir, 'logs', 'core.log'),
      `${new Date().toISOString()} core crashed: ${detail}
`,
    );
  } finally {
    process.exit(1);
  }
};
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;
const secrets = new BridgeSecretStore({
  post: (message) => parentPort.postMessage(message),
  onMessage: (listener) => parentPort.on('message', (event) => listener(event.data)),
});
const core = createCore({
  secrets,
  appDataDir,
  platform: process.platform,
  pid: process.pid,
  testMode: process.env.SPECFORGE_TEST === '1',
  exit: (code) => process.exit(code),
  // US-063: the end-to-end suite drives a scripted agent (test mode only).
  ...(process.env.SPECFORGE_TEST === '1' && process.env.SPECFORGE_MOCK_AGENT === '1' ? { agentAdapter: createTestAgent() } : {}),
  // US-057: main opens validated files with the OS default application.
  openPath: async (path) => parentPort.postMessage({ type: 'open-path', path }),
});

// Main hands the renderer its port only after "ready" (US-005).
void core.then(() => parentPort.postMessage({ type: 'ready' }), crashed);

// The port may arrive while the database is still opening; serve it once the core is ready.
parentPort.on('message', (event) => {
  const [port] = event.ports;
  if (!port) return;
  void core.then(({ handlers }) => {
    const portLike: PortLike = {
      postMessage: (message) => port.postMessage(message),
      onMessage: (listener) => port.on('message', (e) => listener(e.data)),
    };
    const server = serveContract(portLike, handlers);
    void core.then(({ setEmitter }) => setEmitter((name, payload) => server.emit(name, payload)));
    port.start();
  });
});
