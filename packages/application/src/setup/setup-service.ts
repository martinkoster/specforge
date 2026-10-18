// SPDX-License-Identifier: Apache-2.0
// First-start setup (US-012, UC-028, FR-073): step status, AI provider (secrets in the OS credential store),
// connection test, finish and skip.
import type { AgentAdapter } from '../ports/agent-adapter.js';
import type { SecretStore } from '../settings/settings-service.js';

export type SetupState = 'not_started' | 'incomplete' | 'complete';
export type StepId = 'runtime' | 'provider' | 'git' | 'rules' | 'defaults' | 'summary';
export type StepStatus = 'ok' | 'warning' | 'missing' | 'skipped';

export interface SetupRecord {
  setupState: SetupState;
  steps: Record<string, 'done' | 'skipped'>;
  providerKind: string | null;
  providerConfig: Record<string, unknown>;
  providerOk: boolean | null;
}

export interface SetupStore {
  setup(): SetupRecord;
  recordStep(step: string, outcome: 'done' | 'skipped'): void;
  setProvider(kind: string, config: Record<string, unknown>): void;
  setProviderOk(ok: boolean): void;
  setSetupState(state: SetupState): void;
}

export type ProviderInput =
  | { kind: 'anthropic_api_key'; apiKey: string }
  | { kind: 'bedrock'; region: string; profile?: string }
  | { kind: 'vertex'; region: string; projectId: string }
  | { kind: 'foundry'; resource: string; apiKey: string };

export type ConnectionResult = { ok: true } | { ok: false; error: string };

/** What the AI features need (ADR-018, FR-074). */
export interface Capabilities {
  agentAvailable: boolean;
  providerConfigured: boolean;
  gitAvailable: boolean;
  /** AI actions (generate, quality check, refine, chat, start implementation) are allowed. */
  aiAvailable: boolean;
  /** Why AI actions are disabled, or null. */
  missing: string | null;
}

/** An AI action was requested while the needed capabilities are missing (US-013 AC-2). */
export class CapabilityMissingError extends Error {
  readonly code = 'CAPABILITY_MISSING';
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityMissingError';
  }
}

/** The agent adapter as far as capabilities are concerned. */
export interface AgentProbe {
  detect(): Promise<{ found: boolean }>;
  /** False for adapters that need no AI provider (e.g. the MockAdapter). */
  requiresProvider: boolean;
}

export interface SetupDeps {
  store: SetupStore;
  secrets: SecretStore;
  runtime(): Promise<{ found: boolean; path?: string; version?: string }>;
  gitVersion(): Promise<string | null>;
  globalRuleCount(): number;
  execDefaultsSaved(): boolean;
  connectionTest(env: Record<string, string>): Promise<ConnectionResult>;
  /** The available agent adapter, if any. */
  agent?(): Promise<AgentProbe | undefined>;
}

export interface SetupStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail: string;
}

type ProviderEnv = { name: string; value: string } | { name: string; secretRef: string };

const LABELS: Record<StepId, string> = {
  runtime: 'Agent runtime',
  provider: 'AI provider',
  git: 'Git',
  rules: 'Tools allowed without asking',
  defaults: 'Execution defaults',
  summary: 'Ready',
};

const secretRef = (name: string): string => `provider/${name}`;

/** Agent environment per provider (Claude Code configuration variables). */
function providerEnv(input: ProviderInput): { env: ProviderEnv[]; secrets: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  const need = (value: string | undefined, label: string): string => {
    if (!value?.trim()) errors.push(`Enter the ${label}.`);
    return value?.trim() ?? '';
  };
  switch (input.kind) {
    case 'anthropic_api_key': {
      const key = need(input.apiKey, 'API key');
      return {
        env: [{ name: 'ANTHROPIC_API_KEY', secretRef: secretRef('ANTHROPIC_API_KEY') }],
        secrets: { ANTHROPIC_API_KEY: key },
        errors,
      };
    }
    case 'bedrock': {
      const env: ProviderEnv[] = [
        { name: 'CLAUDE_CODE_USE_BEDROCK', value: '1' },
        { name: 'AWS_REGION', value: need(input.region, 'AWS region') },
      ];
      if (input.profile?.trim()) env.push({ name: 'AWS_PROFILE', value: input.profile.trim() });
      return { env, secrets: {}, errors };
    }
    case 'vertex':
      return {
        env: [
          { name: 'CLAUDE_CODE_USE_VERTEX', value: '1' },
          { name: 'CLOUD_ML_REGION', value: need(input.region, 'region') },
          { name: 'ANTHROPIC_VERTEX_PROJECT_ID', value: need(input.projectId, 'Google Cloud project ID') },
        ],
        secrets: {},
        errors,
      };
    case 'foundry': {
      const resource = need(input.resource, 'Foundry resource name');
      const key = need(input.apiKey, 'API key');
      return {
        env: [
          { name: 'CLAUDE_CODE_USE_FOUNDRY', value: '1' },
          { name: 'ANTHROPIC_FOUNDRY_RESOURCE', value: resource },
          { name: 'ANTHROPIC_FOUNDRY_API_KEY', secretRef: secretRef('ANTHROPIC_FOUNDRY_API_KEY') },
        ],
        secrets: { ANTHROPIC_FOUNDRY_API_KEY: key },
        errors,
      };
    }
  }
}

export class SetupService {
  private current: Capabilities | null = null;
  private readonly listeners = new Set<(capabilities: Capabilities) => void>();

  constructor(private readonly deps: SetupDeps) {}

  /** Health check (startup, settings change, on demand): recomputes and publishes the capabilities. */
  async checkCapabilities(): Promise<Capabilities> {
    const record = this.deps.store.setup();
    const [probe, git] = await Promise.all([this.deps.agent?.() ?? Promise.resolve(undefined), this.deps.gitVersion()]);
    const agentAvailable = probe ? (await probe.detect().catch(() => ({ found: false }))).found : false;
    const providerConfigured = record.providerKind !== null;
    const needsProvider = probe?.requiresProvider ?? true;
    const missing = !agentAvailable
      ? 'No agent runtime is available.'
      : needsProvider && !providerConfigured
        ? 'No AI provider is configured.'
        : null;
    const next: Capabilities = { agentAvailable, providerConfigured, gitAvailable: git !== null, aiAvailable: missing === null, missing };
    const changed = JSON.stringify(next) !== JSON.stringify(this.current);
    this.current = next;
    if (changed) for (const listener of this.listeners) listener(next);
    return next;
  }

  /** The last published capabilities (null before the first health check). */
  capabilities(): Capabilities | null {
    return this.current;
  }

  onCapabilities(listener: (capabilities: Capabilities) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Why AI actions are disabled right now, or null. */
  aiDisabledReason(): string | null {
    if (!this.current) return 'AI functions are not available yet: the setup has not been checked.';
    return this.current.missing ? `AI functions are disabled: ${this.current.missing} Complete the setup to enable them.` : null;
  }

  requireAi(): void {
    const reason = this.aiDisabledReason();
    if (reason) throw new CapabilityMissingError(reason);
  }

  async state(): Promise<{ setupState: SetupState; steps: SetupStep[] }> {
    const record = this.deps.store.setup();
    const step = (id: StepId, status: StepStatus, detail: string): SetupStep => ({
      id,
      label: LABELS[id],
      status: record.steps[id] === 'skipped' && status !== 'ok' ? 'skipped' : status,
      detail,
    });

    const runtime = await this.deps.runtime();
    const git = await this.deps.gitVersion();
    const rules = this.deps.globalRuleCount();
    const steps: SetupStep[] = [
      runtime.found
        ? step('runtime', 'ok', `Claude Code ${runtime.version} at ${runtime.path}`)
        : step('runtime', 'missing', 'Claude Code was not found. Install it, then re-check, or enter its path.'),
      record.providerKind === null
        ? step('provider', 'missing', 'No AI provider configured.')
        : record.providerOk === true
          ? step('provider', 'ok', 'Connection test succeeded.')
          : record.providerOk === false
            ? step('provider', 'warning', 'The last connection test failed.')
            : step('provider', 'warning', 'Configured, connection not tested yet.'),
      git
        ? step('git', 'ok', `Git ${git} found — needed for parallel runs and isolated branches.`)
        : step('git', 'warning', 'Git not found (optional — required for parallel runs and isolated branches).'),
      rules > 0
        ? step('rules', 'ok', `${rules} ${rules === 1 ? 'rule allows' : 'rules allow'} actions without asking`)
        : step('rules', 'warning', 'No rules — every agent action will ask you first.'),
      step(
        'defaults',
        'ok',
        this.deps.execDefaultsSaved() ? 'Saved.' : 'Default values (3 parallel runs, 60 min max duration, 10 min idle timeout).',
      ),
    ];
    const blocking = steps.some((s) => s.status === 'missing' || s.status === 'skipped');
    steps.push(
      step(
        'summary',
        blocking ? 'warning' : 'ok',
        blocking ? 'Some steps are incomplete; AI features may be limited.' : 'Everything is set up.',
      ),
    );
    return { setupState: record.setupState, steps };
  }

  async saveProvider(input: ProviderInput): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    const { env, secrets, errors } = providerEnv(input);
    if (errors.length > 0) return { ok: false, errors };
    for (const [name, value] of Object.entries(secrets)) await this.deps.secrets.set(secretRef(name), value);
    this.deps.store.setProvider(input.kind, { env });
    return { ok: true };
  }

  /** The configured provider's agent environment with secrets resolved (connection test and every run). */
  async providerEnv(): Promise<{ env: Record<string, string>; secrets: string[] }> {
    const record = this.deps.store.setup();
    const env: Record<string, string> = {};
    const secrets: string[] = [];
    for (const e of (record.providerConfig.env ?? []) as ProviderEnv[]) {
      const value = 'secretRef' in e ? await this.deps.secrets.get(e.secretRef) : e.value;
      if (value === undefined) continue;
      env[e.name] = value;
      if ('secretRef' in e) secrets.push(value);
    }
    return { env, secrets };
  }

  async testConnection(): Promise<ConnectionResult> {
    const record = this.deps.store.setup();
    if (record.providerKind === null) return { ok: false, error: 'Configure an AI provider first.' };
    const { env } = await this.providerEnv();
    const result = await this.deps.connectionTest(env);
    this.deps.store.setProviderOk(result.ok);
    if (result.ok) this.deps.store.recordStep('provider', 'done');
    return result;
  }

  async skipStep(step: StepId): Promise<void> {
    this.deps.store.recordStep(step, 'skipped');
  }

  async complete(): Promise<void> {
    this.deps.store.setSetupState('complete');
  }

  /** Skip setup: AI features stay disabled until setup is complete (limited mode, ADR-018). */
  async skipSetup(): Promise<void> {
    this.deps.store.setSetupState('incomplete');
  }
}

const CONNECTION_PROMPT = 'Reply with the single word OK.';

/** A tiny `connection_test` run: no tools (all denied), one turn, bounded time. */
export async function runConnectionTest(
  adapter: AgentAdapter,
  options: { cwd: string; env: Record<string, string>; timeoutMs?: number },
): Promise<ConnectionResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const handle = adapter.start(
    {
      runId: `connection-test-${Date.now()}`,
      kind: 'connection_test',
      cwd: options.cwd,
      prompt: CONNECTION_PROMPT,
      config: { env: options.env, maxTurns: 1 },
    },
    {
      onEvent: () => undefined,
      onPermission: async () => ({ behavior: 'deny', message: 'The connection test does not use tools.' }),
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const outcome = await Promise.race([handle.done, timeout]);
  clearTimeout(timer);
  if (outcome === 'timeout') {
    await handle.cancel('timeout');
    return { ok: false, error: `The connection test did not finish within ${Math.round(timeoutMs / 1000)} s.` };
  }
  if (outcome.status === 'completed') return { ok: true };
  return { ok: false, error: outcome.status === 'failed' ? outcome.reason : 'The connection test was cancelled.' };
}
