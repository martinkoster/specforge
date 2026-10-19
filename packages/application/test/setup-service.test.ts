// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { CapabilityMissingError, SetupService, type SecretStore, type SetupDeps, type SetupStore } from '../src/index.js';

function setup(overrides: Partial<SetupDeps> = {}) {
  const record = {
    setupState: 'not_started' as 'not_started' | 'incomplete' | 'complete',
    steps: {} as Record<string, 'done' | 'skipped'>,
    providerKind: null as string | null,
    providerConfig: {} as Record<string, unknown>,
    providerOk: null as boolean | null,
  };
  const store: SetupStore = {
    setup: () => ({ ...record, steps: { ...record.steps } }),
    recordStep: (step, outcome) => void (record.steps[step] = outcome),
    setProvider: (kind, config) => {
      record.providerKind = kind;
      record.providerConfig = config;
      record.providerOk = null;
    },
    setProviderOk: (ok) => void (record.providerOk = ok),
    setSetupState: (state) => void (record.setupState = state),
  };
  const secrets = new Map<string, string>();
  const vault: SecretStore = {
    set: async (k, v) => void secrets.set(k, v),
    get: async (k) => secrets.get(k),
    delete: async (k) => void secrets.delete(k),
  };
  const tested: Record<string, string>[] = [];
  const deps: SetupDeps = {
    store,
    secrets: vault,
    runtime: async () => ({ found: true, path: 'C:\\npm\\claude.cmd', version: '2.1.299' }),
    gitVersion: async () => '2.56.0',
    globalRuleCount: () => 0,
    execDefaultsSaved: () => false,
    connectionTest: async (env) => {
      tested.push(env);
      return env.ANTHROPIC_API_KEY === 'good' ? { ok: true } : { ok: false, error: 'Invalid API key (401).' };
    },
    ...overrides,
  };
  return { service: new SetupService(deps), record, secrets, tested };
}

describe('US-012 AC-1: steps with status', () => {
  it('lists runtime, provider, Git, approval rules, execution defaults and summary with OK/warning/missing', async () => {
    const { service } = setup({ runtime: async () => ({ found: false }), gitVersion: async () => null });

    const state = await service.state();

    expect(state.setupState).toBe('not_started');
    expect(state.steps.map((s) => [s.id, s.status])).toEqual([
      ['runtime', 'missing'],
      ['provider', 'missing'],
      ['git', 'warning'],
      ['rules', 'warning'],
      ['defaults', 'ok'],
      ['summary', 'warning'],
    ]);
    expect(state.steps.find((s) => s.id === 'git')!.detail).toMatch(/optional/);
    expect(state.steps.find((s) => s.id === 'rules')!.detail).toMatch(/ask you first/);
  });

  it('reports a detected runtime and Git with versions', async () => {
    const { service } = setup({ globalRuleCount: () => 2 });
    const steps = (await service.state()).steps;
    expect(steps.find((s) => s.id === 'runtime')).toMatchObject({ status: 'ok', detail: 'Claude Code 2.1.299 at C:\\npm\\claude.cmd' });
    expect(steps.find((s) => s.id === 'git')).toMatchObject({ status: 'ok', detail: expect.stringContaining('2.56.0') });
    expect(steps.find((s) => s.id === 'rules')).toMatchObject({ status: 'ok', detail: '2 rules allow actions without asking' });
  });
});

describe('US-012 AC-2: AI provider', () => {
  it('stores an API key in the secret vault (only a reference in the configuration) and tests the connection', async () => {
    const { service, record, secrets, tested } = setup();

    await service.saveProvider({ kind: 'anthropic_api_key', apiKey: 'good' });
    expect(secrets.get('provider/ANTHROPIC_API_KEY')).toBe('good');
    expect(JSON.stringify(record.providerConfig)).not.toContain('good');
    expect((await service.state()).steps.find((s) => s.id === 'provider')).toMatchObject({
      status: 'warning',
      detail: expect.stringMatching(/not tested/),
    });

    await expect(service.testConnection()).resolves.toEqual({ ok: true });
    expect(tested).toEqual([{ ANTHROPIC_API_KEY: 'good' }]);
    expect((await service.state()).steps.find((s) => s.id === 'provider')).toMatchObject({ status: 'ok' });
  });

  it('shows the connection error clearly', async () => {
    const { service } = setup();
    await service.saveProvider({ kind: 'anthropic_api_key', apiKey: 'bad' });

    await expect(service.testConnection()).resolves.toEqual({ ok: false, error: 'Invalid API key (401).' });
    expect((await service.state()).steps.find((s) => s.id === 'provider')).toMatchObject({
      status: 'warning',
      detail: expect.stringMatching(/failed/),
    });
  });

  it('maps cloud providers to the agent environment (Bedrock, Vertex AI, Foundry)', async () => {
    const { service, tested, secrets } = setup();
    await service.saveProvider({ kind: 'bedrock', region: 'eu-central-1', profile: 'dev' });
    await service.testConnection();
    await service.saveProvider({ kind: 'vertex', region: 'europe-west1', projectId: 'my-proj' });
    await service.testConnection();
    await service.saveProvider({ kind: 'foundry', resource: 'my-res', apiKey: 'fk' });
    await service.testConnection();

    expect(tested).toEqual([
      { CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: 'eu-central-1', AWS_PROFILE: 'dev' },
      { CLAUDE_CODE_USE_VERTEX: '1', CLOUD_ML_REGION: 'europe-west1', ANTHROPIC_VERTEX_PROJECT_ID: 'my-proj' },
      { CLAUDE_CODE_USE_FOUNDRY: '1', ANTHROPIC_FOUNDRY_RESOURCE: 'my-res', ANTHROPIC_FOUNDRY_API_KEY: 'fk' },
    ]);
    expect(secrets.get('provider/ANTHROPIC_FOUNDRY_API_KEY')).toBe('fk');
  });

  it('rejects incomplete provider input and testing without a provider', async () => {
    const { service } = setup();
    await expect(service.saveProvider({ kind: 'anthropic_api_key', apiKey: ' ' })).resolves.toEqual({
      ok: false,
      errors: ['Enter the API key.'],
    });
    await expect(service.testConnection()).resolves.toEqual({ ok: false, error: 'Configure an AI provider first.' });
  });
});

describe('US-012 AC-3/AC-4: finish and skip', () => {
  it('finishing records "complete"', async () => {
    const { service, record } = setup();
    await service.complete();
    expect(record.setupState).toBe('complete');
  });

  it('every step can be skipped (recorded) and skipping the whole setup records "incomplete"', async () => {
    const { service, record } = setup({ runtime: async () => ({ found: false }) });

    await service.skipStep('runtime');
    expect((await service.state()).steps.find((s) => s.id === 'runtime')).toMatchObject({ status: 'skipped' });
    await service.skipSetup();

    expect(record).toMatchObject({ setupState: 'incomplete', steps: { runtime: 'skipped' } });
  });
});

describe('US-048: provider environment for runs', () => {
  it('resolves the configured provider environment with its secrets', async () => {
    const { service } = setup();
    expect(await service.providerEnv()).toEqual({ env: {}, secrets: [] });
    await service.saveProvider({ kind: 'anthropic_api_key', apiKey: 'sk-provider-key' });

    await expect(service.providerEnv()).resolves.toEqual({ env: { ANTHROPIC_API_KEY: 'sk-provider-key' }, secrets: ['sk-provider-key'] });
  });
});

describe('US-013 AC-1: capabilities after each health check (ADR-018)', () => {
  const agent = (found: boolean, requiresProvider = true) => ({ detect: async () => ({ found }), requiresProvider });

  it('reports agent, provider and Git availability and why AI is disabled', async () => {
    const { service } = setup({ agent: async () => agent(true) });
    expect(await service.checkCapabilities()).toEqual({
      agentAvailable: true,
      providerConfigured: false,
      gitAvailable: true,
      aiAvailable: false,
      missing: 'No AI provider is configured.',
    });
    await service.saveProvider({ kind: 'anthropic_api_key', apiKey: 'good' });
    expect(await service.checkCapabilities()).toMatchObject({ providerConfigured: true, aiAvailable: true, missing: null });
  });

  it('without an agent adapter or runtime AI is unavailable; adapters that need no provider are enough on their own', async () => {
    expect(await setup({ agent: async () => undefined }).service.checkCapabilities()).toMatchObject({
      agentAvailable: false,
      aiAvailable: false,
      missing: 'No agent runtime is available.',
    });
    expect(await setup({ agent: async () => agent(false) }).service.checkCapabilities()).toMatchObject({ agentAvailable: false });
    expect(await setup({ agent: async () => agent(true, false), gitVersion: async () => null }).service.checkCapabilities()).toMatchObject({
      aiAvailable: true,
      gitAvailable: false,
    });
  });

  it('keeps the last result and notifies listeners only on change', async () => {
    let found = true;
    const { service } = setup({ agent: async () => agent(found, false) });
    const seen: boolean[] = [];
    service.onCapabilities((c) => seen.push(c.aiAvailable));
    expect(service.capabilities()).toBeNull();
    await service.checkCapabilities();
    await service.checkCapabilities();
    found = false;
    await service.checkCapabilities();
    expect(seen).toEqual([true, false]);
    expect(service.capabilities()).toMatchObject({ aiAvailable: false });
  });
});

describe('US-013 AC-2: services reject AI actions with CapabilityMissing', () => {
  it('requireAi throws CapabilityMissingError with the reason until AI is available', async () => {
    const { service } = setup({ agent: async () => undefined });
    expect(() => service.requireAi()).toThrow(CapabilityMissingError);
    await service.checkCapabilities();
    expect(() => service.requireAi()).toThrow(
      'AI functions are disabled: No agent runtime is available. Complete the setup to enable them.',
    );
    expect(service.aiDisabledReason()).toMatch(/No agent runtime/);
  });
});
