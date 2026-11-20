// SPDX-License-Identifier: Apache-2.0
// Feature status changes (US-094 AC-3, FR-104), spec baselines (US-096, FR-112) and chat changes (US-098, ADR-026):
// workflow state outside the index.
import type { BaselineRecord, ChatChangeRecord, FeatureEvent } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

interface Row {
  project_id: string;
  feature_id: string;
  status: FeatureEvent['status'];
  note: string | null;
  at: string;
}

const event = (r: Row): FeatureEvent => ({ projectId: r.project_id, featureId: r.feature_id, status: r.status, note: r.note, at: r.at });

export class FeatureEventRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(e: FeatureEvent): void {
    this.sqlite
      .prepare('insert into feature_event (project_id, feature_id, status, note, at) values (@projectId, @featureId, @status, @note, @at)')
      .run(e);
  }

  byFeature(projectId: string, featureId: string): FeatureEvent[] {
    return (
      this.sqlite
        .prepare('select * from feature_event where project_id = ? and feature_id = ? order by at desc, rowid desc')
        .all(projectId, featureId) as Row[]
    ).map(event);
  }

  recent(projectId: string, limit: number): FeatureEvent[] {
    return (
      this.sqlite
        .prepare('select * from feature_event where project_id = ? order by at desc, rowid desc limit ?')
        .all(projectId, limit) as Row[]
    ).map(event);
  }
}

interface BaselineRow {
  project_id: string;
  tag: string;
  commit_sha: string;
  created_at: string;
  feature_ids: string;
  epic_ids: string;
  notes: string;
}

/** Spec baselines created by SpecForge (US-096, FR-112): the index of their annotated Git tags. */
export class BaselineRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(b: BaselineRecord): void {
    this.sqlite
      .prepare(
        `insert or replace into baseline (project_id, tag, commit_sha, created_at, feature_ids, epic_ids, notes)
         values (@projectId, @tag, @commit, @createdAt, @featureIds, @epicIds, @notes)`,
      )
      .run({ ...b, featureIds: JSON.stringify(b.featureIds), epicIds: JSON.stringify(b.epicIds) });
  }

  list(projectId: string): BaselineRecord[] {
    return (
      this.sqlite
        .prepare('select * from baseline where project_id = ? order by created_at desc, rowid desc')
        .all(projectId) as BaselineRow[]
    ).map((r) => ({
      projectId: r.project_id,
      tag: r.tag,
      commit: r.commit_sha,
      createdAt: r.created_at,
      featureIds: JSON.parse(r.feature_ids) as string[],
      epicIds: JSON.parse(r.epic_ids) as string[],
      notes: r.notes,
    }));
  }
}

interface ChangeRow {
  id: string;
  project_id: string;
  thread_id: string;
  run_id: string;
  path: string;
  change_type: ChatChangeRecord['change'];
  before_ref: string | null;
  after_hash: string | null;
  is_spec: number;
  reverted_at: string | null;
  created_at: string;
}

const change = (r: ChangeRow): ChatChangeRecord => ({
  id: r.id,
  projectId: r.project_id,
  threadId: r.thread_id,
  runId: r.run_id,
  path: r.path,
  change: r.change_type,
  beforeRef: r.before_ref,
  afterRef: r.after_hash,
  isSpec: r.is_spec === 1,
  revertedAt: r.reverted_at,
  createdAt: r.created_at,
});

/** Files the chat changed per agent turn (US-098) and their reverts (US-099). */
export class ChatChangeRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(records: readonly ChatChangeRecord[]): void {
    const insert = this.sqlite.prepare(
      `insert into chat_change (id, project_id, thread_id, run_id, path, change_type, before_ref, after_hash, is_spec, reverted_at, created_at)
       values (@id, @projectId, @threadId, @runId, @path, @change, @beforeRef, @afterRef, @isSpec, @revertedAt, @createdAt)`,
    );
    this.sqlite.transaction(() => records.forEach((r) => insert.run({ ...r, isSpec: r.isSpec ? 1 : 0 })))();
  }

  byRun(runId: string): ChatChangeRecord[] {
    return (this.sqlite.prepare('select * from chat_change where run_id = ? order by rowid').all(runId) as ChangeRow[]).map(change);
  }

  get(id: string): ChatChangeRecord | undefined {
    const row = this.sqlite.prepare('select * from chat_change where id = ?').get(id) as ChangeRow | undefined;
    return row ? change(row) : undefined;
  }

  setReverted(id: string, at: string): void {
    this.sqlite.prepare('update chat_change set reverted_at = ? where id = ?').run(at, id);
  }

  /** The newest changes of a project (activity feed). */
  recent(projectId: string, limit: number): ChatChangeRecord[] {
    return (
      this.sqlite
        .prepare('select * from chat_change where project_id = ? order by created_at desc, rowid limit ?')
        .all(projectId, limit) as ChangeRow[]
    ).map(change);
  }
}
