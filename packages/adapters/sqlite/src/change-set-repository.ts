// SPDX-License-Identifier: Apache-2.0
// Delta change sets and their items (US-089, data_model.md §2.5, ADR-021/ADR-025): workflow state outside the index.
import type { ChangeItemRecord, ChangeSetRecord, DeltaPhase, EpicChoice } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

interface SetRow {
  id: string;
  project_id: string;
  feature_id: string;
  phase: DeltaPhase;
  run_id: string;
  state: ChangeSetRecord['state'];
  reason: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  change_set_id: string;
  path: string;
  element_id: string | null;
  kind: ChangeItemRecord['kind'];
  before_text: string | null;
  after_text: string;
  patch: string;
  state: ChangeItemRecord['state'];
}

const set = (r: SetRow): ChangeSetRecord => ({
  id: r.id,
  projectId: r.project_id,
  featureId: r.feature_id,
  phase: r.phase,
  runId: r.run_id,
  state: r.state,
  reason: r.reason,
  createdAt: r.created_at,
});

const item = (r: ItemRow): ChangeItemRecord => ({
  id: r.id,
  changeSetId: r.change_set_id,
  path: r.path,
  elementId: r.element_id,
  kind: r.kind,
  before: r.before_text,
  after: r.after_text,
  patch: r.patch,
  state: r.state,
});

export class ChangeSetRepository {
  constructor(private readonly sqlite: Sqlite) {}

  saveSet(record: ChangeSetRecord): void {
    this.sqlite
      .prepare(
        `insert into change_set (id, project_id, feature_id, phase, run_id, state, reason, created_at)
         values (@id, @projectId, @featureId, @phase, @runId, @state, @reason, @createdAt)
         on conflict (id) do update set state = excluded.state, reason = excluded.reason`,
      )
      .run(record);
  }

  set(id: string): ChangeSetRecord | undefined {
    const row = this.sqlite.prepare('select * from change_set where id = ?').get(id) as SetRow | undefined;
    return row ? set(row) : undefined;
  }

  latest(projectId: string, featureId: string, phase: DeltaPhase): ChangeSetRecord | undefined {
    const row = this.sqlite
      .prepare(
        'select * from change_set where project_id = ? and feature_id = ? and phase = ? order by created_at desc, rowid desc limit 1',
      )
      .get(projectId, featureId, phase) as SetRow | undefined;
    return row ? set(row) : undefined;
  }

  saveItems(items: ChangeItemRecord[]): void {
    const insert = this.sqlite.prepare(
      `insert into change_item (id, change_set_id, path, element_id, kind, before_text, after_text, patch, state)
       values (@id, @changeSetId, @path, @elementId, @kind, @before, @after, @patch, @state)`,
    );
    this.sqlite.transaction(() => items.forEach((i) => insert.run(i)))();
  }

  items(changeSetId: string): ChangeItemRecord[] {
    return (this.sqlite.prepare('select * from change_item where change_set_id = ? order by rowid').all(changeSetId) as ItemRow[]).map(
      item,
    );
  }

  item(id: string): ChangeItemRecord | undefined {
    const row = this.sqlite.prepare('select * from change_item where id = ?').get(id) as ItemRow | undefined;
    return row ? item(row) : undefined;
  }

  setItemState(id: string, state: ChangeItemRecord['state']): void {
    this.sqlite.prepare('update change_item set state = ? where id = ?').run(state, id);
  }
}

interface ChoiceRow {
  project_id: string;
  feature_id: string;
  mode: EpicChoice['mode'];
  epic_ids: string;
  title: string | null;
  decided_at: string;
}

/** The approved epic choice of a feature's Epic & stories phase (US-093 AC-1). */
export class EpicChoiceRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(choice: EpicChoice): void {
    this.sqlite
      .prepare(
        `insert into feature_epic_choice (project_id, feature_id, mode, epic_ids, title, decided_at)
         values (@projectId, @featureId, @mode, @epicIds, @title, @decidedAt)
         on conflict (project_id, feature_id) do update set mode = excluded.mode, epic_ids = excluded.epic_ids,
           title = excluded.title, decided_at = excluded.decided_at`,
      )
      .run({ ...choice, epicIds: JSON.stringify(choice.epicIds) });
  }

  get(projectId: string, featureId: string): EpicChoice | undefined {
    const row = this.sqlite
      .prepare('select * from feature_epic_choice where project_id = ? and feature_id = ?')
      .get(projectId, featureId) as ChoiceRow | undefined;
    return row
      ? {
          projectId: row.project_id,
          featureId: row.feature_id,
          mode: row.mode,
          epicIds: JSON.parse(row.epic_ids) as string[],
          title: row.title,
          decidedAt: row.decided_at,
        }
      : undefined;
  }
}
