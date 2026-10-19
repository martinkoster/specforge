// SPDX-License-Identifier: Apache-2.0
// US-011 AC-4: a secret injected into the agent environment and echoed by the agent never reaches
// the database file, the log, the UI state or the workspace.
import { appendFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { createRedactor, resolveAgentEnv, type AgentEvent } from '@specforge/application';
import { MockAdapter } from '@specforge/agent-mock';
import { CONTRACT_VERSION, connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { openDatabase } from '@specforge/sqlite';
import { describe, expect, it } from 'vitest';
import { SecretVault, type SafeStorageLike } from '../src/secret-vault.js';

const SECRET = 'sk-ant-api03-TOPSECRET_0123456789abcdef';

const safeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from([...Buffer.from(plain)].map((b) => b ^ 0x33)),
  decryptString: (data) => Buffer.from([...data].map((b) => b ^ 0x33)).toString(),
};

function wrap(port: MessagePort): PortLike {
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
}

function filesContaining(dir: string, needle: string): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if (readFileSync(path).includes(needle)) hits.push(path);
  }
  return hits;
}

describe('US-011 AC-4: no secret leaks into persistence, logs, UI state or workspace', () => {
  it('redacts an echoed secret before every sink', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-leak-app-'));
    const workspace = mkdtempSync(join(tmpdir(), 'sf-leak-ws-'));

    // vault (main) + reference-only configuration (core)
    const vault = new SecretVault({ file: join(appData, 'secrets.json'), safeStorage, platform: 'win32' });
    vault.set('anthropic', SECRET);
    const env = await resolveAgentEnv({ ANTHROPIC_API_KEY: { secretRef: 'anthropic' } }, { resolve: async (k) => vault.get(k)! });
    const redact = createRedactor(vault.keys().map((k) => vault.get(k)!));

    // sinks: database, log file, UI state over the IPC contract
    const database = openDatabase({ dir: appData });
    database.sqlite.exec('create table run_event_probe (seq integer primary key, payload text not null)');
    const insert = database.sqlite.prepare('insert into run_event_probe (payload) values (?)');
    const logFile = join(appData, 'core.log');
    const { port1, port2 } = new MessageChannel();
    const server = serveContract(wrap(port2), {
      'system.ping': async ({ nonce }) => ({ nonce, pid: 1 }),
      'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    });
    const client = await connectClient(wrap(port1));
    const uiState: string[] = [];
    client.subscribe('run.output', (e) => uiState.push(e.text));

    // agent echoes the secret it received through its environment
    const adapter = new MockAdapter({
      script: (req) => [
        { type: 'output', text: `Using key ${req.config.env?.ANTHROPIC_API_KEY}` },
        { type: 'tool', toolName: 'Read', input: { file_path: `.env containing ${req.config.env?.ANTHROPIC_API_KEY}` } },
        { type: 'result', text: `done with ${req.config.env?.ANTHROPIC_API_KEY}` },
      ],
    });
    let seq = 0;
    const onEvent = (event: AgentEvent) => {
      const safe = redact.value(event);
      insert.run(JSON.stringify(safe));
      appendFileSync(logFile, `${JSON.stringify(safe)}\n`);
      if (safe.type === 'output') server.emit('run.output', { runId: 'r1', seq: ++seq, text: safe.text });
    };
    const outcome = await adapter.start(
      { runId: 'r1', kind: 'implement', cwd: workspace, prompt: 'go', config: { env } },
      { onEvent, onPermission: async () => ({ behavior: 'allow' }) },
    ).done;
    const resultText = outcome.status === 'completed' ? redact.text(outcome.resultText) : '';
    await new Promise((r) => setTimeout(r, 80));
    database.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
    port1.close();
    port2.close();

    expect(uiState.length).toBeGreaterThan(0);
    expect(uiState.join('\n')).not.toContain(SECRET);
    expect(uiState.join('\n')).toContain('***');
    expect(resultText).toBe('done with ***');
    expect(filesContaining(appData, SECRET)).toEqual([]);
    expect(filesContaining(workspace, SECRET)).toEqual([]);
  });
});
