// SPDX-License-Identifier: Apache-2.0
// Database schema (spec/03_design/technical_design/data_model.md §2).
import type { Database as Sqlite } from 'better-sqlite3';
import type { Migration } from './migrations.js';

export interface IndexTable {
  name: string;
  ddl: string;
}

/**
 * Workspace index tables: rebuildable from the Markdown files at any time (ADR-004).
 * DB-only state (board order, execution sub-state, epic layout) lives in separate tables so a rebuild never loses it.
 */
export const INDEX_TABLES: readonly IndexTable[] = [
  {
    name: 'artifact',
    ddl: `create table artifact (
      project_id text not null references project(id) on delete cascade,
      path text not null,
      kind text not null,
      approval_state text not null,
      content_hash text not null,
      parse_state text not null,
      parse_error text,
      generated_by_run text,
      indexed_at text not null,
      primary key (project_id, path)
    )`,
  },
  {
    name: 'element',
    ddl: `create table element (
      project_id text not null references project(id) on delete cascade,
      element_id text not null,
      type text not null,
      title text not null,
      artifact_path text not null,
      anchor text,
      impact_flag integer not null default 0,
      impact_source text,
      primary key (project_id, element_id)
    );
    create index element_by_artifact on element (project_id, artifact_path)`,
  },
  {
    name: 'trace_link',
    ddl: `create table trace_link (
      id integer primary key,
      project_id text not null references project(id) on delete cascade,
      artifact_path text not null,
      source_ref text not null,
      target_ref text not null,
      link_type text not null,
      origin text not null
    );
    create index trace_link_by_source on trace_link (project_id, source_ref);
    create index trace_link_by_target on trace_link (project_id, target_ref);
    create index trace_link_by_artifact on trace_link (project_id, artifact_path)`,
  },
  {
    name: 'story',
    ddl: `create table story (
      project_id text not null references project(id) on delete cascade,
      story_id text not null,
      epic_id text,
      feature_id text,
      title text not null,
      board_status text not null,
      approval_state text not null,
      size text,
      branch text,
      reworks text not null default '[]',
      primary key (project_id, story_id)
    );
    create index story_by_status on story (project_id, board_status);
    create index story_by_epic on story (project_id, epic_id, board_status)`,
  },
  {
    name: 'story_dependency',
    ddl: `create table story_dependency (
      project_id text not null references project(id) on delete cascade,
      from_story text not null,
      to_story text not null,
      type text not null,
      rationale text,
      origin text not null,
      approved integer not null default 0,
      primary key (project_id, from_story, to_story, type)
    );
    create index story_dependency_by_target on story_dependency (project_id, to_story)`,
  },
  {
    name: 'epic',
    ddl: `create table epic (
      project_id text not null references project(id) on delete cascade,
      epic_id text not null,
      feature_id text,
      title text not null,
      approval_state text not null,
      review_outcome text,
      review_decided_at text,
      primary key (project_id, epic_id)
    )`,
  },
];

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'project_registry',
    sql: `create table project (
      id text primary key,
      name text not null,
      workspace_path text not null unique,
      vcs_mode text not null check (vcs_mode in ('git', 'none')),
      base_branch text,
      created_at text not null,
      last_opened_at text
    );`,
  },
  {
    version: 2,
    name: 'workspace_index',
    sql: INDEX_TABLES.map((t) => `${t.ddl};`).join('\n'),
  },
  {
    version: 3,
    name: 'db_only_board_state',
    sql: `create table story_state (
      project_id text not null references project(id) on delete cascade,
      story_id text not null,
      exec_substate text not null default 'none',
      board_order real,
      merged_at text,
      authorised_at text,
      rejected_branches text not null default '[]',
      primary key (project_id, story_id)
    );
    create table epic_layout (
      project_id text not null references project(id) on delete cascade,
      epic_id text not null,
      lane_order real,
      colour text,
      primary key (project_id, epic_id)
    );`,
  },
  {
    version: 4,
    name: 'index_trace_link_artifact_path',
    // Index tables are rebuildable by design: recreate them with the current definitions.
    sql: [...[...INDEX_TABLES].reverse().map((t) => `drop table if exists ${t.name};`), ...INDEX_TABLES.map((t) => `${t.ddl};`)].join('\n'),
  },
  {
    version: 5,
    name: 'permission_rules',
    sql: `create table permission_rule (
      id text primary key,
      scope text not null check (scope in ('global', 'project')),
      project_id text references project(id) on delete cascade,
      effect text not null check (effect in ('allow', 'deny')),
      tool_name text not null,
      pattern text,
      applies_to text not null default 'all',
      created_from text not null,
      created_at text not null,
      check ((scope = 'global' and project_id is null) or (scope = 'project' and project_id is not null))
    );
    create index permission_rule_lookup on permission_rule (scope, project_id, tool_name);
    create table project_rule_override (
      project_id text not null references project(id) on delete cascade,
      rule_id text not null references permission_rule(id) on delete cascade,
      primary key (project_id, rule_id)
    );`,
  },
  {
    version: 6,
    name: 'agent_runtime',
    sql: `create table agent_runtime (
      adapter_type text primary key,
      executable_path text not null,
      detected_version text,
      capabilities text not null default '{}',
      default_config text not null default '{}',
      verified_at text,
      updated_at text not null
    );`,
  },
  {
    version: 7,
    name: 'story_status_notice',
    // DB-only notice when an external status edit was rejected and reverted (US-021, FR-023).
    sql: 'alter table story_state add column status_notice text;',
  },
  {
    version: 8,
    name: 'execution_store',
    // Runs, the scheduler queue and the permission log (data_model.md §2.3; US-042, US-052).
    sql: `create table run (
      id text primary key,
      project_id text not null references project(id) on delete cascade,
      story_id text,
      kind text not null,
      start_kind text,
      parent_run_id text references run(id),
      runtime_id text,
      config_snapshot text check (config_snapshot is null or json_valid(config_snapshot)),
      agent_session_id text,
      status text not null,
      failure_reason text,
      start_trigger text,
      authorised_by text,
      authorised_at text,
      created_at text not null,
      started_at text,
      ended_at text,
      pid integer,
      context_digest text,
      last_event_seq integer not null default 0
    );
    create index run_by_status on run (project_id, status);
    create index run_by_story on run (project_id, story_id, started_at);
    create table queue_entry (
      project_id text not null references project(id) on delete cascade,
      story_id text not null,
      queued_at text not null,
      priority integer not null check (priority in (0, 1)),
      start_kind text not null,
      parent_run_id text,
      reason text,
      waiting_for text not null default '[]' check (json_valid(waiting_for)),
      primary key (project_id, story_id)
    );
    create index queue_fifo on queue_entry (project_id, priority, queued_at);
    create table permission_request (
      id text primary key,
      run_id text not null references run(id) on delete cascade,
      tool_name text not null,
      input text not null check (json_valid(input)),
      cwd text not null,
      outside_workspace integer not null,
      requested_at text not null,
      decision text check (decision in ('allow', 'deny')),
      decided_by text,
      decided_at text,
      message text
    );
    create index permission_pending on permission_request (decision) where decision is null;
    create index permission_by_run on permission_request (run_id);
    create trigger permission_request_immutable before update on permission_request
      when old.decision is not null
      begin select raise(abort, 'permission_request is immutable after its decision'); end;`,
  },
  {
    version: 9,
    name: 'settings_and_setup',
    // Setup state, provider configuration, global agent and execution defaults (single row), project settings
    // (data_model.md §2.1; US-012, US-015). Secret values are never stored here, only references.
    sql: `create table app_setup (
      id integer primary key check (id = 1),
      setup_state text not null default 'not_started' check (setup_state in ('not_started', 'incomplete', 'complete')),
      completed_steps text not null default '{}' check (json_valid(completed_steps)),
      runtime_ok integer,
      provider_ok integer,
      git_detected integer,
      provider_kind text,
      provider_config text not null default '{}' check (json_valid(provider_config)),
      agent_defaults text not null default '{"env":[]}' check (json_valid(agent_defaults)),
      exec_defaults text check (exec_defaults is null or json_valid(exec_defaults)),
      last_health_check_at text
    );
    insert into app_setup (id) values (1);
    create table project_settings (
      project_id text primary key references project(id) on delete cascade,
      concurrency_limit integer not null default 3,
      max_run_duration_s integer default 3600,
      max_idle_s integer default 600,
      worktree_root text,
      branch_pattern text default 'specforge/{storyId}',
      snapshot_exclusions text check (snapshot_exclusions is null or json_valid(snapshot_exclusions)),
      log_retention_days integer default 30,
      merge_check_interval_s integer default 60,
      log_level text default 'info',
      agent_overrides text check (agent_overrides is null or json_valid(agent_overrides)),
      runtime_id text
    );`,
  },
  {
    version: 10,
    name: 'run_events_and_execution_spaces',
    // Append-only run log and the execution space per run (data_model.md §2.3; US-048).
    sql: `create table run_event (
      run_id text not null references run(id) on delete cascade,
      seq integer not null,
      ts text not null,
      type text not null,
      payload text not null check (json_valid(payload)),
      primary key (run_id, seq)
    );
    create table execution_space (
      run_id text primary key references run(id) on delete cascade,
      mode text not null check (mode in ('worktree', 'in_place')),
      branch text,
      worktree_path text,
      base_ref text,
      stacked_on text not null default '[]' check (json_valid(stacked_on)),
      integration_ref text,
      snapshot_id text,
      shared_with_run text,
      cleaned_up integer not null default 0
    );`,
  },
  {
    version: 11,
    name: 'run_results_touches_recommendations',
    // Structured results and computed changes, touched files per story, recommendations (data_model.md §2.3; US-051).
    sql: `create table run_result (
      run_id text primary key references run(id) on delete cascade,
      outcome text,
      summary text,
      tests_run integer,
      tests_passed integer,
      tests_failed integer,
      coverage real,
      reported_files text not null default '[]' check (json_valid(reported_files)),
      computed_files text not null default '[]' check (json_valid(computed_files)),
      open_issues text not null default '[]' check (json_valid(open_issues)),
      usage text check (usage is null or json_valid(usage)),
      raw_result text,
      unavailable_reason text
    );
    create table file_touch (
      project_id text not null references project(id) on delete cascade,
      story_id text not null,
      run_id text not null references run(id) on delete cascade,
      path text not null,
      primary key (project_id, path, story_id)
    );
    create index file_touch_by_path on file_touch (project_id, path);
    create table recommendation (
      id text primary key,
      run_id text not null references run(id) on delete cascade,
      type text not null,
      payload text not null check (json_valid(payload)),
      state text not null default 'open' check (state in ('open', 'accepted', 'dismissed'))
    );`,
  },
  {
    version: 12,
    name: 'run_process_identity',
    // ProcessRegistry: pid + start time + command line of the agent process, for orphan cleanup after a crash (US-049).
    sql: `alter table run add column pid_start_time text;
    alter table run add column pid_command_line text;`,
  },
  {
    version: 13,
    name: 'run_event_search',
    // Full-text search over run logs (NFR-005, US-054): text of output, tool calls and errors per event.
    sql: `create virtual table run_event_fts using fts5(text, run_id unindexed, seq unindexed, tokenize = 'unicode61');`,
  },
  {
    version: 14,
    name: 'spec_review',
    // Review of a specification run (US-027, ADR-014): target folder, snapshot, changed files and validation issues.
    sql: `create table spec_review (
      run_id text primary key references run(id) on delete cascade,
      project_id text not null references project(id) on delete cascade,
      target text not null,
      kind text not null,
      instruction text not null,
      snapshot_id text not null,
      parent_run_id text,
      state text not null check (state in ('running', 'open', 'failed', 'cancelled', 'kept', 'discarded', 'superseded')),
      files text not null default '[]',
      issues text not null default '[]',
      reason text,
      created_at text not null
    );
    create index spec_review_target on spec_review (project_id, target, state);`,
  },
  {
    version: 15,
    name: 'retry_mode',
    // Retry choice of the user (US-055, FR-035): reuse the story branch or start from a fresh branch.
    sql: `alter table story_state add column retry_mode text check (retry_mode in ('fresh', 'reuse'));`,
  },
  {
    version: 16,
    name: 'quality_finding',
    // Findings of AI quality checks (US-029, data_model.md §2.4); fix_run_id links an *Apply fix* refine proposal.
    sql: `create table quality_finding (
      id text primary key,
      project_id text not null references project(id) on delete cascade,
      run_id text not null references run(id) on delete cascade,
      artifact_path text not null,
      element_id text,
      severity text not null check (severity in ('critical', 'major', 'minor', 'info')),
      category text not null,
      explanation text not null,
      suggested_fix text not null,
      state text not null default 'open' check (state in ('open', 'applied', 'dismissed')),
      dismiss_reason text,
      fix_run_id text
    );
    create index quality_finding_artifact on quality_finding (project_id, artifact_path, state);`,
  },
  {
    version: 17,
    name: 'clarification',
    // Intent clarification dialogues (US-028): agent session, items with the user's answers (kept as a draft on cancel).
    sql: `create table clarification (
      id text primary key,
      project_id text not null references project(id) on delete cascade,
      intent_path text not null,
      state text not null,
      session_id text,
      items text not null default '[]',
      last_run_id text,
      proposal_run_id text,
      reason text,
      created_at text not null
    );
    create index clarification_intent on clarification (project_id, intent_path, created_at);`,
  },
  {
    version: 18,
    name: 'chat',
    // Read-only project chat (US-062, data_model.md §2.4): threads are resumable agent sessions; agent messages reference their run.
    sql: `create table chat_thread (
      id text primary key,
      project_id text not null references project(id) on delete cascade,
      title text not null,
      agent_session_id text,
      created_at text not null,
      last_used_at text not null,
      archived integer not null default 0
    );
    create index chat_thread_recent on chat_thread (project_id, last_used_at desc);
    create table chat_message (
      id text primary key,
      thread_id text not null references chat_thread(id) on delete cascade,
      seq integer not null,
      role text not null check (role in ('user', 'agent')),
      text text not null,
      run_id text references run(id) on delete set null,
      tool_uses text not null default '[]',
      recommendations text not null default '[]',
      error integer not null default 0,
      created_at text not null
    );
    create index chat_message_thread on chat_message (thread_id, seq);`,
  },
  {
    version: 19,
    name: 'correction',
    // Requested corrections (US-059, FR-045): review feedback and whether the agent session is resumed or started fresh;
    // kept until the correction run has started.
    sql: `alter table story_state add column correction_feedback text;
    alter table story_state add column correction_fresh integer;`,
  },
];

/** "Rebuild index": drops and recreates all workspace index tables in one transaction. */
export function rebuildIndex(sqlite: Sqlite): void {
  sqlite.transaction(() => {
    for (const table of [...INDEX_TABLES].reverse()) sqlite.exec(`drop table if exists ${table.name}`);
    for (const table of INDEX_TABLES) sqlite.exec(table.ddl);
  })();
}

/** Kysely table types. */
export interface ProjectTable {
  id: string;
  name: string;
  workspace_path: string;
  vcs_mode: 'git' | 'none';
  base_branch: string | null;
  created_at: string;
  last_opened_at: string | null;
}

export interface DatabaseSchema {
  project: ProjectTable;
}
