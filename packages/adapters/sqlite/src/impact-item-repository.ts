// SPDX-License-Identifier: Apache-2.0
// Feature impact items (US-087, data_model.md §2.5, ADR-025): workflow state outside the rebuildable index.
import type { ImpactCategory, ImpactItemRecord } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

interface Row {
  id: string;
  project_id: string;
  feature_id: string;
  category: ImpactCategory;
  target_ref: string;
  reason: string;
  confidence: ImpactItemRecord['confidence'];
  origin: ImpactItemRecord['origin'];
  confirmed: number;
}

const record = (r: Row): ImpactItemRecord => ({
  id: r.id,
  projectId: r.project_id,
  featureId: r.feature_id,
  category: r.category,
  targetRef: r.target_ref,
  reason: r.reason,
  confidence: r.confidence,
  origin: r.origin,
  confirmed: r.confirmed === 1,
});

export class ImpactItemRepository {
  constructor(private readonly sqlite: Sqlite) {}

  replaceTraceItems(projectId: string, featureId: string, items: ImpactItemRecord[]): void {
    this.sqlite.transaction(() => {
      this.sqlite.prepare("delete from impact_item where project_id = ? and feature_id = ? and origin = 'trace'").run(projectId, featureId);
      for (const item of items) this.add(item);
    })();
  }

  items(projectId: string, featureId: string): ImpactItemRecord[] {
    return (
      this.sqlite
        .prepare('select * from impact_item where project_id = ? and feature_id = ? order by rowid')
        .all(projectId, featureId) as Row[]
    ).map(record);
  }

  add(item: ImpactItemRecord): void {
    this.sqlite
      .prepare(
        `insert into impact_item (id, project_id, feature_id, category, target_ref, reason, confidence, origin, confirmed)
         values (@id, @projectId, @featureId, @category, @targetRef, @reason, @confidence, @origin, @confirmed)`,
      )
      .run({ ...item, confirmed: item.confirmed ? 1 : 0 });
  }

  removeOrigin(projectId: string, featureId: string, origin: ImpactItemRecord['origin']): void {
    this.sqlite
      .prepare('delete from impact_item where project_id = ? and feature_id = ? and origin = ? and confirmed = 0')
      .run(projectId, featureId, origin);
  }

  remove(itemId: string): void {
    this.sqlite.prepare('delete from impact_item where id = ?').run(itemId);
  }

  confirm(projectId: string, featureId: string): void {
    this.sqlite.prepare('update impact_item set confirmed = 1 where project_id = ? and feature_id = ?').run(projectId, featureId);
  }
}
