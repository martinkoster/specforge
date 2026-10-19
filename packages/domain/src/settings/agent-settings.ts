// SPDX-License-Identifier: Apache-2.0
// Agent and execution settings (US-015, FR-049, FR-052): effective configuration and validation.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** An environment variable for the agent process; secret values live in the OS credential store (`secretRef`). */
export type EnvEntry = { name: string; value: string; secretRef?: undefined } | { name: string; secretRef: string; value?: undefined };

export interface AgentSettings {
  model?: string;
  effort?: Effort;
  maxTurns?: number;
  env: EnvEntry[];
}

export interface AgentOverrides {
  model?: string;
  effort?: Effort;
  maxTurns?: number;
  env?: EnvEntry[];
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface ExecDefaults {
  maxRunDurationS: number;
  idleTimeoutS: number;
  notifications: boolean;
  logRetentionDays: number;
  logLevel: LogLevel;
  /** Interval of the merge check (US-024, FR-115). */
  mergeCheckIntervalS: number;
}

export const DEFAULT_EXEC_DEFAULTS: ExecDefaults = {
  maxRunDurationS: 3600,
  idleTimeoutS: 600,
  notifications: true,
  logRetentionDays: 30,
  logLevel: 'info',
  mergeCheckIntervalS: 60,
};

/** Project overrides win per field; environment variables are merged by name (project wins). */
export function effectiveAgentSettings(global: AgentSettings, project: AgentOverrides | undefined): AgentSettings {
  const env = new Map(global.env.map((e) => [e.name, e]));
  for (const e of project?.env ?? []) env.set(e.name, e);
  const result: AgentSettings = { env: [...env.values()] };
  const model = project?.model ?? global.model;
  const effort = project?.effort ?? global.effort;
  const maxTurns = project?.maxTurns ?? global.maxTurns;
  if (model !== undefined) result.model = model;
  if (effort !== undefined) result.effort = effort;
  if (maxTurns !== undefined) result.maxTurns = maxTurns;
  return result;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateAgentSettings(settings: AgentOverrides): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of settings.env ?? []) {
    if (!ENV_NAME.test(e.name)) errors.push(`"${e.name}" is not a valid environment variable name.`);
    else if (seen.has(e.name)) errors.push(`Environment variable ${e.name} is defined twice.`);
    seen.add(e.name);
  }
  if (settings.maxTurns !== undefined && (!Number.isInteger(settings.maxTurns) || settings.maxTurns < 1)) {
    errors.push('Max turns must be a whole number of at least 1.');
  }
  return errors;
}

export function validateExecDefaults(d: ExecDefaults): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(d.maxRunDurationS) || d.maxRunDurationS < 60) errors.push('Max run duration must be at least 60 seconds.');
  if (!Number.isInteger(d.idleTimeoutS) || d.idleTimeoutS < 30) errors.push('Idle timeout must be at least 30 seconds.');
  if (!Number.isInteger(d.logRetentionDays) || d.logRetentionDays < 1) errors.push('Log retention must be at least 1 day.');
  if (!Number.isInteger(d.mergeCheckIntervalS) || d.mergeCheckIntervalS < 10)
    errors.push('The merge check interval must be at least 10 seconds.');
  return errors;
}
