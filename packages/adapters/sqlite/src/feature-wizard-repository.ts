// SPDX-License-Identifier: Apache-2.0
// Feature wizard drafts (US-082, data_model.md §2.5, ADR-025): workflow state outside the rebuildable index.
import type { WizardDraft, WizardRecord, WizardStep } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

interface Row {
  id: string;
  project_id: string;
  step: WizardStep;
  draft: string;
  session_id: string | null;
  source_idea: string | null;
  feature_id: string | null;
  updated_at: string;
}

const record = (r: Row): WizardRecord => ({
  id: r.id,
  projectId: r.project_id,
  step: r.step,
  draft: JSON.parse(r.draft) as WizardDraft,
  sessionId: r.session_id,
  sourceIdea: r.source_idea,
  featureId: r.feature_id,
  updatedAt: r.updated_at,
});

export class FeatureWizardRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(row: WizardRecord): void {
    this.sqlite
      .prepare(
        `insert into feature_wizard (id, project_id, step, draft, session_id, source_idea, feature_id, updated_at)
         values (@id, @projectId, @step, @draft, @sessionId, @sourceIdea, @featureId, @updatedAt)
         on conflict (id) do update set step = excluded.step, draft = excluded.draft, session_id = excluded.session_id,
           source_idea = excluded.source_idea, feature_id = excluded.feature_id, updated_at = excluded.updated_at`,
      )
      .run({ ...row, draft: JSON.stringify(row.draft) });
  }

  get(id: string): WizardRecord | undefined {
    const row = this.sqlite.prepare('select * from feature_wizard where id = ?').get(id) as Row | undefined;
    return row ? record(row) : undefined;
  }

  list(projectId: string): WizardRecord[] {
    return (this.sqlite.prepare('select * from feature_wizard where project_id = ? order by updated_at desc').all(projectId) as Row[]).map(
      record,
    );
  }

  remove(id: string): void {
    this.sqlite.prepare('delete from feature_wizard where id = ?').run(id);
  }
}
