// SPDX-License-Identifier: Apache-2.0
// Potentially impacted flags (US-086, data_model.md §2.4, ADR-025): workflow state that survives re-indexing and
// *Rebuild index*; one flag per element (the latest source wins), removed when the user clears it.
import type { ImpactFlagRecord } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

export class ImpactFlagRepository {
  constructor(private readonly sqlite: Sqlite) {}

  flag(record: ImpactFlagRecord): void {
    this.sqlite
      .prepare(
        `insert into impact_flag (project_id, element_id, source_ref, reason, flagged_at) values (@projectId, @elementId, @sourceRef, @reason, @flaggedAt)
         on conflict (project_id, element_id) do update set source_ref = excluded.source_ref, reason = excluded.reason, flagged_at = excluded.flagged_at`,
      )
      .run(record);
  }

  clear(projectId: string, elementId: string): void {
    this.sqlite.prepare('delete from impact_flag where project_id = ? and element_id = ?').run(projectId, elementId);
  }

  list(projectId: string): ImpactFlagRecord[] {
    return this.sqlite
      .prepare(
        `select project_id as projectId, element_id as elementId, source_ref as sourceRef, reason, flagged_at as flaggedAt
         from impact_flag where project_id = ? order by element_id`,
      )
      .all(projectId) as ImpactFlagRecord[];
  }
}
