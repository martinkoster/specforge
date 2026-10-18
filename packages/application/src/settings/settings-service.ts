// SPDX-License-Identifier: Apache-2.0
// Agent and execution settings (US-015, FR-049, FR-052): global defaults, project overrides, secret environment
// variables in the OS credential store (only references are kept), and the effective configuration snapshot.
import {
  effectiveAgentSettings,
  validateAgentSettings,
  validateExecDefaults,
  type AgentOverrides,
  type AgentSettings,
  type Effort,
  type EnvEntry,
  type ExecDefaults,
} from '@specforge/domain';

export interface SettingsStore {
  agentDefaults(): AgentSettings;
  setAgentDefaults(settings: AgentSettings): void;
  projectOverrides(projectId: string): AgentOverrides | undefined;
  setProjectOverrides(projectId: string, overrides: AgentOverrides): void;
  execDefaults(): ExecDefaults;
  setExecDefaults(defaults: ExecDefaults): void;
}

/** Secret storage in the main process (safeStorage, ADR-012). */
export interface SecretStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
}

export type EnvInput = { name: string; secret: false; value: string } | { name: string; secret: true; value?: string };

export interface AgentSettingsInput {
  model?: string;
  effort?: Effort;
  maxTurns?: number;
  env: EnvInput[];
}

export type EnvView = { name: string; secret: boolean; value: string | null };
export type AgentSettingsView = Omit<AgentSettings, 'env'> & { env: EnvView[] };

export interface SettingsView {
  global: AgentSettingsView;
  project: AgentSettingsView | null;
  effective: AgentSettingsView;
  exec: ExecDefaults;
}

export type SettingsScope = { kind: 'global' } | { kind: 'project'; projectId: string };
export type SaveSettingsResult = { ok: true } | { ok: false; errors: string[] };

const secretKey = (scope: SettingsScope, name: string): string =>
  `agent-env/${scope.kind === 'global' ? 'global' : scope.projectId}/${name}`;

function toView(settings: AgentOverrides): AgentSettingsView {
  const { env = [], ...rest } = settings;
  return { ...rest, env: env.map((e) => ({ name: e.name, secret: e.secretRef !== undefined, value: e.value ?? null })) };
}

export class SettingsService {
  constructor(
    private readonly store: SettingsStore,
    private readonly secrets: SecretStore,
  ) {}

  view(projectId: string | null): SettingsView {
    const global = this.store.agentDefaults();
    const project = projectId ? this.store.projectOverrides(projectId) : undefined;
    return {
      global: toView(global),
      project: project ? toView(project) : null,
      effective: toView(effectiveAgentSettings(global, project)),
      exec: this.store.execDefaults(),
    };
  }

  async saveAgent(scope: SettingsScope, input: AgentSettingsInput): Promise<SaveSettingsResult> {
    const previous = scope.kind === 'global' ? this.store.agentDefaults() : this.store.projectOverrides(scope.projectId);
    const previousSecrets = new Map((previous?.env ?? []).filter((e) => e.secretRef).map((e) => [e.name, e.secretRef!]));
    const errors: string[] = [];
    const env: EnvEntry[] = input.env.map((e) => {
      if (!e.secret) return { name: e.name, value: e.value };
      if (e.value === undefined && !previousSecrets.has(e.name)) errors.push(`Enter a value for the secret ${e.name}.`);
      return { name: e.name, secretRef: secretKey(scope, e.name) };
    });
    const settings: AgentSettings = { env };
    if (input.model?.trim()) settings.model = input.model.trim();
    if (input.effort) settings.effort = input.effort;
    if (input.maxTurns !== undefined) settings.maxTurns = input.maxTurns;
    errors.push(...validateAgentSettings(settings));
    if (errors.length > 0) return { ok: false, errors };

    for (const e of input.env) if (e.secret && e.value !== undefined) await this.secrets.set(secretKey(scope, e.name), e.value);
    const kept = new Set(env.filter((e) => e.secretRef).map((e) => e.secretRef));
    for (const ref of previousSecrets.values()) if (!kept.has(ref)) await this.secrets.delete(ref);

    if (scope.kind === 'global') this.store.setAgentDefaults(settings);
    else this.store.setProjectOverrides(scope.projectId, settings);
    return { ok: true };
  }

  saveExec(defaults: ExecDefaults): SaveSettingsResult {
    const errors = validateExecDefaults(defaults);
    if (errors.length > 0) return { ok: false, errors };
    this.store.setExecDefaults(defaults);
    return { ok: true };
  }

  /** Effective configuration recorded on a run (secrets as references only; FR-052, data_model.md run.config_snapshot). */
  snapshot(projectId: string): { agent: AgentSettings; exec: ExecDefaults } {
    return {
      agent: effectiveAgentSettings(this.store.agentDefaults(), this.store.projectOverrides(projectId)),
      exec: this.store.execDefaults(),
    };
  }

  /** Environment for the agent process with secrets resolved (injected only into the agent process, ADR-012). */
  async resolveEnv(projectId: string | null): Promise<Record<string, string>> {
    return (await this.resolveEnvWithSecrets(projectId)).env;
  }

  /** Resolved environment plus the secret values, which the run's redactor masks in every event (NFR-006). */
  async resolveEnvWithSecrets(projectId: string | null): Promise<{ env: Record<string, string>; secrets: string[] }> {
    const settings = effectiveAgentSettings(this.store.agentDefaults(), projectId ? this.store.projectOverrides(projectId) : undefined);
    const env: Record<string, string> = {};
    const secrets: string[] = [];
    for (const e of settings.env) {
      const value = e.secretRef !== undefined ? await this.secrets.get(e.secretRef) : e.value;
      if (value === undefined) continue;
      env[e.name] = value;
      if (e.secretRef !== undefined) secrets.push(value);
    }
    return { env, secrets };
  }
}
