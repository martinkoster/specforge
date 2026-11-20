// SPDX-License-Identifier: Apache-2.0
// In-flight decisions (US-091, data_model.md §2.5, ADR-025): per story and change set; *Apply in corrections* keeps the
// pending feedback until *Request corrections* uses it.
import type { InFlightChoice, InFlightDecisionRecord } from '@specforge/application';
import type { Database as Sqlite } from 'better-sqlite3';

interface Row {
  id: string;
  project_id: string;
  story_id: string;
  feature_id: string;
  change_set_id: string;
  decision: InFlightChoice;
  pending_feedback: string | null;
  decided_at: string;
}

const record = (r: Row): InFlightDecisionRecord => ({
  id: r.id,
  projectId: r.project_id,
  storyId: r.story_id,
  featureId: r.feature_id,
  changeSetId: r.change_set_id,
  decision: r.decision,
  pendingFeedback: r.pending_feedback,
  decidedAt: r.decided_at,
});

export class InFlightDecisionRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(decision: InFlightDecisionRecord): void {
    this.sqlite
      .prepare(
        `insert into in_flight_decision (id, project_id, story_id, feature_id, change_set_id, decision, pending_feedback, decided_at)
         values (@id, @projectId, @storyId, @featureId, @changeSetId, @decision, @pendingFeedback, @decidedAt)`,
      )
      .run(decision);
  }

  /** Decisions of a feature (Activity tab), newest first. */
  byFeature(projectId: string, featureId: string): InFlightDecisionRecord[] {
    return (
      this.sqlite
        .prepare('select * from in_flight_decision where project_id = ? and feature_id = ? order by decided_at desc, rowid desc')
        .all(projectId, featureId) as Row[]
    ).map(record);
  }

  /** The latest decision per story (shown on the card). */
  latestByStory(projectId: string): Map<string, InFlightDecisionRecord> {
    const rows = (
      this.sqlite.prepare('select * from in_flight_decision where project_id = ? order by decided_at, rowid').all(projectId) as Row[]
    ).map(record);
    return new Map(rows.map((r) => [r.storyId, r]));
  }

  /** Pending correction feedback of a story (all unused *Apply in corrections* decisions). */
  pendingFeedback(projectId: string, storyId: string): string | null {
    const rows = this.sqlite
      .prepare(
        'select pending_feedback from in_flight_decision where project_id = ? and story_id = ? and pending_feedback is not null order by decided_at, rowid',
      )
      .all(projectId, storyId) as { pending_feedback: string }[];
    return rows.length ? rows.map((r) => r.pending_feedback).join('\n\n') : null;
  }

  clearFeedback(projectId: string, storyId: string): void {
    this.sqlite
      .prepare('update in_flight_decision set pending_feedback = null where project_id = ? and story_id = ?')
      .run(projectId, storyId);
  }
}
