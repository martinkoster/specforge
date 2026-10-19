// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_EXEC_DEFAULTS, type AgentOverrides, type AgentSettings, type ExecDefaults } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { SettingsService, type SecretStore, type SettingsStore } from '../src/index.js';

function setup() {
  let global: AgentSettings = { env: [] };
  const overrides = new Map<string, AgentOverrides>();
  let exec: ExecDefaults = DEFAULT_EXEC_DEFAULTS;
  const store: SettingsStore = {
    agentDefaults: () => global,
    setAgentDefaults: (s) => void (global = s),
    projectOverrides: (id) => overrides.get(id),
    setProjectOverrides: (id, o) => void overrides.set(id, o),
    execDefaults: () => exec,
    setExecDefaults: (d) => void (exec = d),
  };
  const secrets = new Map<string, string>();
  const vault: SecretStore = {
    set: async (k, v) => void secrets.set(k, v),
    get: async (k) => secrets.get(k),
    delete: async (k) => void secrets.delete(k),
  };
  return { service: new SettingsService(store, vault), secrets, store };
}

describe('US-015 AC-1: agent runtime settings with secret environment variables', () => {
  it('stores model, effort, max turns and env vars; secret values go to the vault and are shown masked', async () => {
    const { service, secrets, store } = setup();

    const result = await service.saveAgent(
      { kind: 'global' },
      {
        model: 'claude-opus-5-5',
        effort: 'high',
        maxTurns: 40,
        env: [
          { name: 'HTTPS_PROXY', secret: false, value: 'http://proxy:8080' },
          { name: 'NPM_TOKEN', secret: true, value: 's3cr3t' },
        ],
      },
    );

    expect(result).toEqual({ ok: true });
    expect(secrets.get('agent-env/global/NPM_TOKEN')).toBe('s3cr3t');
    expect(JSON.stringify(store.agentDefaults())).not.toContain('s3cr3t');
    expect(service.view(null).global).toEqual({
      model: 'claude-opus-5-5',
      effort: 'high',
      maxTurns: 40,
      env: [
        { name: 'HTTPS_PROXY', secret: false, value: 'http://proxy:8080' },
        { name: 'NPM_TOKEN', secret: true, value: null },
      ],
    });
  });

  it('keeps an existing secret when it is saved without a new value, and deletes removed secrets', async () => {
    const { service, secrets } = setup();
    await service.saveAgent({ kind: 'global' }, { env: [{ name: 'TOKEN', secret: true, value: 'one' }] });

    await service.saveAgent({ kind: 'global' }, { env: [{ name: 'TOKEN', secret: true }] });
    expect(secrets.get('agent-env/global/TOKEN')).toBe('one');

    await service.saveAgent({ kind: 'global' }, { env: [] });
    expect(secrets.has('agent-env/global/TOKEN')).toBe(false);
  });

  it('rejects a new secret without a value and invalid settings', async () => {
    const { service } = setup();
    await expect(service.saveAgent({ kind: 'global' }, { env: [{ name: 'TOKEN', secret: true }] })).resolves.toEqual({
      ok: false,
      errors: ['Enter a value for the secret TOKEN.'],
    });
    await expect(service.saveAgent({ kind: 'global' }, { env: [{ name: 'bad-name', secret: false, value: 'x' }] })).resolves.toEqual({
      ok: false,
      errors: ['"bad-name" is not a valid environment variable name.'],
    });
  });

  it('resolves the environment for the agent process, including secrets', async () => {
    const { service } = setup();
    await service.saveAgent(
      { kind: 'global' },
      {
        env: [
          { name: 'A', secret: false, value: '1' },
          { name: 'T', secret: true, value: 'tok' },
        ],
      },
    );
    await service.saveAgent({ kind: 'project', projectId: 'p1' }, { env: [{ name: 'A', secret: false, value: '2' }] });

    await expect(service.resolveEnv('p1')).resolves.toEqual({ A: '2', T: 'tok' });
  });
});

describe('US-015 AC-2: execution defaults', () => {
  it('saves validated defaults; invalid values are rejected', () => {
    const { service } = setup();
    const next = { ...DEFAULT_EXEC_DEFAULTS, maxRunDurationS: 7200, notifications: false, logLevel: 'debug' as const };

    expect(service.saveExec(next)).toEqual({ ok: true });
    expect(service.view(null).exec).toEqual(next);
    expect(service.saveExec({ ...next, idleTimeoutS: 5 })).toEqual({ ok: false, errors: ['Idle timeout must be at least 30 seconds.'] });
    expect(service.view(null).exec).toEqual(next);
  });
});

describe('US-015 AC-4: project overrides and the run configuration snapshot', () => {
  it('shows global, project and effective settings and snapshots the effective configuration without secret values', async () => {
    const { service } = setup();
    await service.saveAgent(
      { kind: 'global' },
      { model: 'claude-opus-5-5', effort: 'high', env: [{ name: 'T', secret: true, value: 'tok' }] },
    );
    await service.saveAgent({ kind: 'project', projectId: 'p1' }, { model: 'claude-sonnet-5-5', env: [] });

    const view = service.view('p1');
    expect(view.project).toEqual({ model: 'claude-sonnet-5-5', env: [] });
    expect(view.effective).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high' });

    const snapshot = service.snapshot('p1');
    expect(snapshot).toEqual({
      agent: { model: 'claude-sonnet-5-5', effort: 'high', env: [{ name: 'T', secretRef: 'agent-env/global/T' }] },
      exec: DEFAULT_EXEC_DEFAULTS,
    });
    expect(JSON.stringify(snapshot)).not.toContain('tok');
  });

  it('clearing project overrides falls back to the global settings', async () => {
    const { service } = setup();
    await service.saveAgent({ kind: 'global' }, { model: 'claude-opus-5-5', env: [] });
    await service.saveAgent({ kind: 'project', projectId: 'p1' }, { model: 'claude-sonnet-5-5', env: [] });

    await service.saveAgent({ kind: 'project', projectId: 'p1' }, { env: [] });

    expect(service.view('p1').effective.model).toBe('claude-opus-5-5');
  });
});

describe('US-048: environment for a run', () => {
  it('returns the resolved environment and the secret values to redact', async () => {
    const { service } = setup();
    await service.saveAgent(
      { kind: 'global' },
      {
        env: [
          { name: 'A', secret: false, value: 'plain' },
          { name: 'T', secret: true, value: 'tok-123456' },
        ],
      },
    );

    await expect(service.resolveEnvWithSecrets('p1')).resolves.toEqual({ env: { A: 'plain', T: 'tok-123456' }, secrets: ['tok-123456'] });
  });
});
