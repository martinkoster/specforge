// SPDX-License-Identifier: Apache-2.0
// Settings and setup state (data_model.md §2.1): app_setup (single row) and project_settings.
import type { ProjectSettingsStore, SettingsStore, StoredProjectSettings } from '@specforge/application';
import { DEFAULT_EXEC_DEFAULTS, type AgentOverrides, type AgentSettings, type ExecDefaults } from '@specforge/domain';
import type { Database as Sqlite } from 'better-sqlite3';

export type SetupState = 'not_started' | 'incomplete' | 'complete';
export type StepOutcome = 'done' | 'skipped';

export interface SetupRecord {
  setupState: SetupState;
  steps: Record<string, StepOutcome>;
  providerKind: string | null;
  /** Non-secret provider configuration; secrets only as references. */
  providerConfig: Record<string, unknown>;
  providerOk: boolean | null;
}

interface SetupRow {
  setup_state: SetupState;
  completed_steps: string;
  provider_kind: string | null;
  provider_config: string;
  provider_ok: number | null;
  agent_defaults: string;
  exec_defaults: string | null;
}

export class SettingsRepository implements SettingsStore, ProjectSettingsStore {
  constructor(private readonly sqlite: Sqlite) {}

  private row(): SetupRow {
    return this.sqlite.prepare('select * from app_setup where id = 1').get() as SetupRow;
  }

  private update(column: string, value: unknown): void {
    this.sqlite.prepare(`update app_setup set ${column} = ? where id = 1`).run(value);
  }

  agentDefaults(): AgentSettings {
    return JSON.parse(this.row().agent_defaults) as AgentSettings;
  }

  setAgentDefaults(settings: AgentSettings): void {
    this.update('agent_defaults', JSON.stringify(settings));
  }

  projectOverrides(projectId: string): AgentOverrides | undefined {
    const row = this.sqlite.prepare('select agent_overrides from project_settings where project_id = ?').get(projectId) as
      { agent_overrides: string | null } | undefined;
    return row?.agent_overrides ? (JSON.parse(row.agent_overrides) as AgentOverrides) : undefined;
  }

  setProjectOverrides(projectId: string, overrides: AgentOverrides): void {
    this.sqlite
      .prepare(
        `insert into project_settings (project_id, agent_overrides) values (?, ?)
         on conflict (project_id) do update set agent_overrides = excluded.agent_overrides`,
      )
      .run(projectId, JSON.stringify(overrides));
  }

  projectSettings(projectId: string): Partial<StoredProjectSettings> | undefined {
    const row = this.sqlite
      .prepare('select concurrency_limit, branch_pattern, worktree_root, snapshot_exclusions from project_settings where project_id = ?')
      .get(projectId) as
      | { concurrency_limit: number; branch_pattern: string | null; worktree_root: string | null; snapshot_exclusions: string | null }
      | undefined;
    if (!row) return undefined;
    const settings: Partial<StoredProjectSettings> = { concurrencyLimit: row.concurrency_limit };
    if (row.branch_pattern) settings.branchPattern = row.branch_pattern;
    if (row.worktree_root) settings.worktreeRoot = row.worktree_root;
    if (row.snapshot_exclusions) settings.snapshotExclusions = JSON.parse(row.snapshot_exclusions) as string[];
    return settings;
  }

  setProjectSettings(projectId: string, s: StoredProjectSettings): void {
    this.sqlite
      .prepare(
        `insert into project_settings (project_id, concurrency_limit, branch_pattern, worktree_root, snapshot_exclusions) values (?, ?, ?, ?, ?)
         on conflict (project_id) do update set concurrency_limit = excluded.concurrency_limit, branch_pattern = excluded.branch_pattern,
           worktree_root = excluded.worktree_root, snapshot_exclusions = excluded.snapshot_exclusions`,
      )
      .run(projectId, s.concurrencyLimit, s.branchPattern, s.worktreeRoot, JSON.stringify(s.snapshotExclusions));
  }

  execDefaults(): ExecDefaults {
    const raw = this.row().exec_defaults;
    return raw ? { ...DEFAULT_EXEC_DEFAULTS, ...(JSON.parse(raw) as Partial<ExecDefaults>) } : DEFAULT_EXEC_DEFAULTS;
  }

  setExecDefaults(defaults: ExecDefaults): void {
    this.update('exec_defaults', JSON.stringify(defaults));
  }

  hasExecDefaults(): boolean {
    return this.row().exec_defaults !== null;
  }

  setup(): SetupRecord {
    const row = this.row();
    return {
      setupState: row.setup_state,
      steps: JSON.parse(row.completed_steps) as Record<string, StepOutcome>,
      providerKind: row.provider_kind,
      providerConfig: JSON.parse(row.provider_config) as Record<string, unknown>,
      providerOk: row.provider_ok === null ? null : row.provider_ok === 1,
    };
  }

  recordStep(step: string, outcome: StepOutcome): void {
    const steps = { ...this.setup().steps, [step]: outcome };
    this.update('completed_steps', JSON.stringify(steps));
  }

  setProvider(kind: string, config: Record<string, unknown>): void {
    this.sqlite
      .prepare('update app_setup set provider_kind = ?, provider_config = ?, provider_ok = null where id = 1')
      .run(kind, JSON.stringify(config));
  }

  setProviderOk(ok: boolean): void {
    this.update('provider_ok', ok ? 1 : 0);
  }

  setSetupState(state: SetupState): void {
    this.update('setup_state', state);
  }
}
