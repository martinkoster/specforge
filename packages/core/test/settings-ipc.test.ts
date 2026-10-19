// SPDX-License-Identifier: Apache-2.0
// US-015 integration: settings over IPC, secrets in the secret store, log retention at startup, run config snapshot.
import { MockAdapter } from '@specforge/agent-mock';
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import type { SecretStore } from '@specforge/application';
import { DEFAULT_EXEC_DEFAULTS } from '@specforge/domain';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore, pruneLogs } from '../src/index.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

function memorySecrets(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    set: async (k, v) => void values.set(k, v),
    get: async (k) => values.get(k),
    delete: async (k) => void values.delete(k),
  };
}

async function boot(appDataDir: string, secrets = memorySecrets()) {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    secrets,
    agentAdapter: new MockAdapter(),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { client: await connectClient(wrap(port1)), secrets };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

describe('US-015 AC-3: log retention at startup', () => {
  it('removes run logs older than the retention period and keeps newer ones', () => {
    const logs = mkdtempSync(join(tmpdir(), 'sf-logs-'));
    for (const [name, age] of [
      ['run-old', 40],
      ['run-new', 2],
    ] as const) {
      mkdirSync(join(logs, name));
      writeFileSync(join(logs, name, 'out.log'), 'x');
      utimesSync(join(logs, name), daysAgo(age), daysAgo(age));
    }

    expect(pruneLogs(logs, 30, new Date())).toEqual(['run-old']);
    expect(existsSync(join(logs, 'run-old'))).toBe(false);
    expect(existsSync(join(logs, 'run-new'))).toBe(true);
    expect(pruneLogs(join(logs, 'missing'), 30, new Date())).toEqual([]);
  });

  it('is applied with the configured retention when the core starts', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-app-'));
    const first = await boot(appData);
    await first.client.command('settings.saveExec', { defaults: { ...DEFAULT_EXEC_DEFAULTS, logRetentionDays: 7 } });
    mkdirSync(join(appData, 'logs', 'run-1'), { recursive: true });
    utimesSync(join(appData, 'logs', 'run-1'), daysAgo(10), daysAgo(10));

    await boot(appData);

    expect(existsSync(join(appData, 'logs', 'run-1'))).toBe(false);
  });
});

describe('US-015 AC-1/AC-2: settings over IPC', () => {
  it('stores agent settings with secret env vars in the secret store and never returns their values', async () => {
    const { client, secrets } = await boot(mkdtempSync(join(tmpdir(), 'sf-app-')));

    await expect(
      client.command('settings.saveAgent', {
        scope: { kind: 'global' },
        settings: { model: 'claude-opus-5-5', effort: 'high', env: [{ name: 'NPM_TOKEN', secret: true, value: 's3cr3t' }] },
      }),
    ).resolves.toEqual({ ok: true });

    expect(secrets.values.get('agent-env/global/NPM_TOKEN')).toBe('s3cr3t');
    const view = await client.query('settings.get', { projectId: null });
    expect(view.global).toEqual({ model: 'claude-opus-5-5', effort: 'high', env: [{ name: 'NPM_TOKEN', secret: true, value: null }] });
    expect(JSON.stringify(view)).not.toContain('s3cr3t');
    await expect(client.command('settings.saveExec', { defaults: { ...DEFAULT_EXEC_DEFAULTS, idleTimeoutS: 1 } })).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe('US-015 AC-4: run configuration snapshot', () => {
  it('records the effective configuration with the project override on runs started afterwards', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-app-'));
    const ws = mkdtempSync(join(tmpdir(), 'sf-ws-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: snap-1\nname: Snap\n');
    mkdirSync(join(ws, 'spec', '04_user_stories'), { recursive: true });
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: A\napproval: approved\nstatus: ready\n---\n',
    );
    const { client } = await boot(appData);
    await client.command('projects.open', { path: ws });
    await client.command('settings.saveAgent', { scope: { kind: 'global' }, settings: { model: 'claude-opus-5-5', env: [] } });
    await client.command('settings.saveAgent', {
      scope: { kind: 'project', projectId: 'snap-1' },
      settings: { model: 'claude-sonnet-5-5', env: [] },
    });

    await client.command('board.move', { projectId: 'snap-1', storyId: 'US-001', to: 'in_progress', beforeStoryId: null });

    const [run] = await client.query('runs.list', { projectId: 'snap-1' });
    expect(run).toMatchObject({
      storyId: 'US-001',
      kind: 'implement',
      startTrigger: 'StoryAuthorised US-001',
      configSnapshot: { agent: { model: 'claude-sonnet-5-5', env: [] }, exec: DEFAULT_EXEC_DEFAULTS },
    });
  });
});
