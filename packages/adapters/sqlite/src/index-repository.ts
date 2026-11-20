// SPDX-License-Identifier: Apache-2.0
// IndexStore implementation on SQLite (data_model.md §2.2): replaces all index rows of one artifact at a time.
import type {
  ArtifactListIndex,
  ParsedIdea,
  BoardIndex,
  BoardStoryRow,
  DependencyIndex,
  ElementChange,
  IndexedArtifact,
  IndexStore,
  IndexedStory,
  ParsedArtifact,
  StoryStatusIndex,
} from '@specforge/application';
import type { FeatureStatus } from '@specforge/domain';

export interface IndexedFeature {
  id: string;
  title: string;
  approval: 'draft' | 'approved';
  status: FeatureStatus;
  sourceIdea: string | null;
  baseline: string | null;
  path: string;
}
import {
  SPEC_PHASES,
  type BoardStatus,
  type ExecSubState,
  type PhaseInputs,
  type SpecPhase,
  type StoryDependency,
} from '@specforge/domain';
import type { Database as Sqlite, Statement } from 'better-sqlite3';

const PHASE_OF_KIND: Record<string, SpecPhase | undefined> = {
  intent: 'intent',
  requirements: 'requirements',
  design: 'design',
  adr: 'design',
  epic: 'stories',
  story: 'stories',
};

export class IndexRepository implements IndexStore, DependencyIndex, StoryStatusIndex, BoardIndex, ArtifactListIndex {
  private readonly s: Record<string, Statement>;

  constructor(private readonly sqlite: Sqlite) {
    const prepare = (sql: string) => sqlite.prepare(sql);
    this.s = {
      upsertArtifact:
        prepare(`insert into artifact (project_id, path, kind, approval_state, content_hash, parse_state, parse_error, indexed_at)
        values (@projectId, @path, @kind, @approval, @hash, @state, @error, @now)
        on conflict (project_id, path) do update set kind = excluded.kind, approval_state = excluded.approval_state,
          content_hash = excluded.content_hash, parse_state = excluded.parse_state, parse_error = excluded.parse_error, indexed_at = excluded.indexed_at`),
      markInvalid:
        prepare(`insert into artifact (project_id, path, kind, approval_state, content_hash, parse_state, parse_error, indexed_at)
        values (@projectId, @path, 'other', 'draft', @hash, 'invalid', @error, @now)
        on conflict (project_id, path) do update set content_hash = excluded.content_hash, parse_state = 'invalid',
          parse_error = excluded.parse_error, indexed_at = excluded.indexed_at`),
      ownedIds: prepare(
        `select element_id from element where project_id = ? and artifact_path = ? and type in ('story', 'epic', 'feature_intent')`,
      ),
      deleteElements: prepare('delete from element where project_id = ? and artifact_path = ?'),
      deleteLinks: prepare('delete from trace_link where project_id = ? and artifact_path = ?'),
      deleteStory: prepare('delete from story where project_id = ? and story_id = ?'),
      deleteDeps: prepare('delete from story_dependency where project_id = ? and from_story = ?'),
      deleteEpic: prepare('delete from epic where project_id = ? and epic_id = ?'),
      deleteFeature: prepare('delete from feature_intent where project_id = ? and feature_id = ?'),
      insertFeature:
        prepare(`insert or replace into feature_intent (project_id, feature_id, title, approval_state, status, source_idea, baseline_tag)
        values (?, ?, ?, ?, ?, ?, ?)`),
      deleteArtifact: prepare('delete from artifact where project_id = ? and path = ?'),
      deleteIdeas: prepare('delete from idea where project_id = ? and artifact_path = ?'),
      insertIdea:
        prepare(`insert or replace into idea (project_id, idea_id, artifact_path, text, note, source, created_at, state, feature_id,
          dismiss_reason) values (@projectId, @id, @path, @text, @note, @source, @createdAt, @state, @featureId, @dismissReason)`),
      insertElement: prepare(`insert or replace into element (project_id, element_id, type, title, artifact_path, anchor, content_hash)
        values (?, ?, ?, ?, ?, ?, ?)`),
      elementState: prepare(`select e.element_id, e.type, e.content_hash, a.approval_state from element e
        join artifact a on a.project_id = e.project_id and a.path = e.artifact_path
        where e.project_id = ? and e.artifact_path = ?`),
      insertLink: prepare(`insert into trace_link (project_id, artifact_path, source_ref, target_ref, link_type, origin)
        values (?, ?, ?, ?, ?, 'ws')`),
      insertStory:
        prepare(`insert or replace into story (project_id, story_id, epic_id, feature_id, title, board_status, approval_state, size, branch, reworks)
        values (@projectId, @id, @epicId, @featureId, @title, @status, @approval, @size, @branch, @reworks)`),
      insertDep: prepare(`insert or replace into story_dependency (project_id, from_story, to_story, type, rationale, origin, approved)
        values (?, ?, ?, ?, ?, 'user', ?)`),
      insertEpic: prepare(`insert or replace into epic (project_id, epic_id, feature_id, title, approval_state, review_outcome)
        values (?, ?, ?, ?, ?, ?)`),
      paths: prepare('select path from artifact where project_id = ?'),
      storyIds: prepare('select story_id from story where project_id = ? order by story_id'),
      storyPath: prepare("select artifact_path from element where project_id = ? and element_id = ? and type = 'story'"),
      dependencies: prepare('select from_story, to_story, type from story_dependency where project_id = ? order by from_story, to_story'),
      storyByPath: prepare(`select s.story_id, s.board_status, s.approval_state from story s
        join element e on e.project_id = s.project_id and e.element_id = s.story_id and e.type = 'story'
        where s.project_id = ? and e.artifact_path = ?`),
      execSubState: prepare('select exec_substate from story_state where project_id = ? and story_id = ?'),
      setStoryStatus: prepare('update story set board_status = ? where project_id = ? and story_id = ?'),
      phaseArtifacts: prepare(`select a.kind, a.approval_state,
          exists (select 1 from element e join impact_flag f on f.project_id = e.project_id and f.element_id = e.element_id
            where e.project_id = a.project_id and e.artifact_path = a.path) as impacted
        from artifact a where a.project_id = ? and a.parse_state <> 'invalid'`),
      artifacts: prepare('select path, kind, approval_state, parse_state, parse_error from artifact where project_id = ? order by path'),
      boardStories: prepare(`select s.story_id, s.title, s.size, s.approval_state, s.board_status, s.epic_id, s.reworks,
          coalesce(st.exec_substate, 'none') as exec_substate, st.board_order, st.status_notice, st.authorised_at,
          q.reason, coalesce(q.waiting_for, '[]') as waiting_for
        from story s
        left join story_state st on st.project_id = s.project_id and st.story_id = s.story_id
        left join queue_entry q on q.project_id = s.project_id and q.story_id = s.story_id
        where s.project_id = ?`),
      setSubState: prepare(`insert into story_state (project_id, story_id, exec_substate) values (?, ?, ?)
        on conflict (project_id, story_id) do update set exec_substate = excluded.exec_substate`),
      setOrder: prepare(`insert into story_state (project_id, story_id, board_order) values (?, ?, ?)
        on conflict (project_id, story_id) do update set board_order = excluded.board_order`),
      setAuthorisedAt: prepare(`insert into story_state (project_id, story_id, authorised_at) values (?, ?, ?)
        on conflict (project_id, story_id) do update set authorised_at = excluded.authorised_at`),
      setStatusNotice: prepare(`insert into story_state (project_id, story_id, status_notice) values (?, ?, ?)
        on conflict (project_id, story_id) do update set status_notice = excluded.status_notice`),
    };
  }

  /** US-086: called with the elements whose content changed on re-indexing (not on the first index of a file). */
  onElementsChanged?: (projectId: string, changes: ElementChange[], path: string) => void;

  save(projectId: string, path: string, hash: string, artifact: ParsedArtifact): void {
    const before = this.s.elementState!.all(projectId, path) as {
      element_id: string;
      type: string;
      content_hash: string | null;
      approval_state: 'draft' | 'approved';
    }[];
    this.clear(projectId, path);
    this.s.upsertArtifact!.run({
      projectId,
      path,
      kind: artifact.kind,
      approval: artifact.approval,
      hash,
      state: 'valid',
      error: null,
      now: new Date().toISOString(),
    });
    const hashes = artifact.elementHashes ?? {};
    for (const e of artifact.elements) this.s.insertElement!.run(projectId, e.id, e.type, e.title, path, e.anchor, hashes[e.id] ?? null);
    const changes = before
      .filter((b) => b.content_hash !== null && hashes[b.element_id] !== undefined && hashes[b.element_id] !== b.content_hash)
      .map((b) => ({ elementId: b.element_id, type: b.type, wasApproved: b.approval_state === 'approved' }));
    if (changes.length > 0) this.onElementsChanged?.(projectId, changes, path);
    for (const l of artifact.links) this.s.insertLink!.run(projectId, path, l.source, l.target, l.type ?? 'references');
    if (artifact.story) {
      const st = artifact.story;
      this.s.insertStory!.run({
        projectId,
        id: st.id,
        epicId: st.epicId,
        featureId: st.featureId,
        title: st.title,
        status: st.status,
        approval: st.approval,
        size: st.size,
        branch: st.branch,
        reworks: JSON.stringify(st.reworks),
      });
    }
    const approved = artifact.approval === 'approved' ? 1 : 0;
    for (const d of artifact.dependencies) this.s.insertDep!.run(projectId, d.from, d.to, d.type, d.rationale, approved);
    if (artifact.epic) {
      const ep = artifact.epic;
      this.s.insertEpic!.run(projectId, ep.id, ep.featureId, ep.title, ep.approval, ep.reviewOutcome);
    }
    if (artifact.feature) {
      const fi = artifact.feature;
      this.s.insertFeature!.run(projectId, fi.id, fi.title, fi.approval, fi.status, fi.sourceIdea, fi.baseline);
    }
    for (const idea of artifact.ideas ?? []) this.s.insertIdea!.run({ projectId, path, ...idea });
  }

  /** The idea inbox (US-095), in ID order. */
  ideas(projectId: string): ParsedIdea[] {
    const rows = this.sqlite.prepare('select * from idea where project_id = ? order by idea_id').all(projectId) as {
      idea_id: string;
      text: string;
      note: string | null;
      source: string;
      created_at: string;
      state: ParsedIdea['state'];
      feature_id: string | null;
      dismiss_reason: string | null;
    }[];
    return rows.map((r) => ({
      id: r.idea_id,
      text: r.text,
      note: r.note,
      source: r.source,
      createdAt: r.created_at,
      state: r.state,
      featureId: r.feature_id,
      dismissReason: r.dismiss_reason,
    }));
  }

  /** Keeps the previously indexed elements of the artifact (last valid state, US-020 AC-2). */
  markInvalid(projectId: string, path: string, hash: string, error: string): void {
    this.s.markInvalid!.run({ projectId, path, hash, error, now: new Date().toISOString() });
  }

  remove(projectId: string, path: string): void {
    this.clear(projectId, path);
    this.s.deleteArtifact!.run(projectId, path);
  }

  paths(projectId: string): string[] {
    return (this.s.paths!.all(projectId) as Array<{ path: string }>).map((r) => r.path);
  }

  storyIds(projectId: string): string[] {
    return (this.s.storyIds!.all(projectId) as Array<{ story_id: string }>).map((r) => r.story_id);
  }

  storyPath(projectId: string, storyId: string): string | undefined {
    return (this.s.storyPath!.get(projectId, storyId) as { artifact_path: string } | undefined)?.artifact_path;
  }

  dependencies(projectId: string): StoryDependency[] {
    return (this.s.dependencies!.all(projectId) as Array<{ from_story: string; to_story: string; type: StoryDependency['type'] }>).map(
      (r) => ({
        from: r.from_story,
        to: r.to_story,
        type: r.type,
      }),
    );
  }

  storyByPath(projectId: string, path: string): IndexedStory | undefined {
    const row = this.s.storyByPath!.get(projectId, path) as
      { story_id: string; board_status: BoardStatus; approval_state: IndexedStory['approval'] } | undefined;
    return row ? { storyId: row.story_id, status: row.board_status, approval: row.approval_state } : undefined;
  }

  execSubState(projectId: string, storyId: string): ExecSubState {
    return (this.s.execSubState!.get(projectId, storyId) as { exec_substate: ExecSubState } | undefined)?.exec_substate ?? 'none';
  }

  setStoryStatus(projectId: string, storyId: string, status: BoardStatus): void {
    this.s.setStoryStatus!.run(status, projectId, storyId);
  }

  setStatusNotice(projectId: string, storyId: string, notice: string | null): void {
    this.s.setStatusNotice!.run(projectId, storyId, notice);
  }

  artifacts(projectId: string): IndexedArtifact[] {
    const rows = this.s.artifacts!.all(projectId) as {
      path: string;
      kind: string;
      approval_state: IndexedArtifact['approval'];
      parse_state: string;
      parse_error: string | null;
    }[];
    return rows.map((r) => ({
      path: r.path,
      kind: r.kind,
      approval: r.approval_state,
      parseState: r.parse_state === 'invalid' ? 'invalid' : 'ok',
      parseError: r.parse_error,
    }));
  }

  stories(projectId: string): BoardStoryRow[] {
    const rows = this.s.boardStories!.all(projectId) as {
      story_id: string;
      title: string;
      size: string | null;
      approval_state: BoardStoryRow['approval'];
      board_status: BoardStoryRow['status'];
      exec_substate: ExecSubState;
      board_order: number | null;
      status_notice: string | null;
      authorised_at: string | null;
      reason: BoardStoryRow['queueReason'];
      waiting_for: string;
      epic_id: string | null;
      reworks: string;
    }[];
    return rows.map((r) => ({
      storyId: r.story_id,
      title: r.title,
      size: r.size,
      approval: r.approval_state,
      status: r.board_status,
      subState: r.exec_substate,
      order: r.board_order,
      queueReason: r.reason,
      waitingFor: JSON.parse(r.waiting_for) as string[],
      statusNotice: r.status_notice,
      authorisedAt: r.authorised_at,
      epicId: r.epic_id,
      reworks: JSON.parse(r.reworks) as string[],
    }));
  }

  storyEpicId(projectId: string, storyId: string): string | null {
    return (
      (
        this.sqlite.prepare('select epic_id from story where project_id = ? and story_id = ?').get(projectId, storyId) as
          { epic_id: string | null } | undefined
      )?.epic_id ?? null
    );
  }

  epicStoryIds(projectId: string, epicId: string): string[] {
    return (
      this.sqlite.prepare('select story_id from story where project_id = ? and epic_id = ? order by story_id').all(projectId, epicId) as {
        story_id: string;
      }[]
    ).map((r) => r.story_id);
  }

  /** Targets of the trace links an element declares (e.g. a story's requirements, design and epic). */
  /** Epics with their artifact and lane order (US-035, US-039). */
  epics(projectId: string): {
    id: string;
    title: string;
    approval: 'draft' | 'approved';
    path: string;
    laneOrder: number | null;
    reviewOutcome: string | null;
    featureId: string | null;
  }[] {
    return this.sqlite
      .prepare(
        `select ep.epic_id as id, ep.title as title, ep.approval_state as approval, el.artifact_path as path, l.lane_order as laneOrder,
           ep.review_outcome as reviewOutcome, ep.feature_id as featureId
         from epic ep
         join element el on el.project_id = ep.project_id and el.element_id = ep.epic_id and el.type = 'epic'
         left join epic_layout l on l.project_id = ep.project_id and l.epic_id = ep.epic_id
         where ep.project_id = ?
         order by coalesce(l.lane_order, 1e9), ep.epic_id`,
      )
      .all(projectId) as {
      id: string;
      title: string;
      approval: 'draft' | 'approved';
      path: string;
      laneOrder: number | null;
      reviewOutcome: string | null;
      featureId: string | null;
    }[];
  }

  setLaneOrder(projectId: string, epicId: string, order: number): void {
    this.sqlite
      .prepare(
        `insert into epic_layout (project_id, epic_id, lane_order) values (?, ?, ?)
         on conflict (project_id, epic_id) do update set lane_order = excluded.lane_order`,
      )
      .run(projectId, epicId, order);
  }

  /** Artifacts with at least one potentially impacted element (dashboard, US-061). */
  impactedPaths(projectId: string): string[] {
    return (
      this.sqlite
        .prepare(
          `select distinct e.artifact_path from element e join impact_flag f on f.project_id = e.project_id and f.element_id = e.element_id
           where e.project_id = ? order by e.artifact_path`,
        )
        .all(projectId) as { artifact_path: string }[]
    ).map((r) => r.artifact_path);
  }

  /** All elements with their artifact (delta generation, US-089). */
  elementPaths(projectId: string): { id: string; path: string; title: string }[] {
    return this.sqlite
      .prepare('select element_id as id, artifact_path as path, title from element where project_id = ? order by element_id')
      .all(projectId) as { id: string; path: string; title: string }[];
  }

  /** Stories that depend on `storyId` (FR-071, US-086). */
  dependents(projectId: string, storyId: string): { id: string; status: BoardStatus }[] {
    return this.sqlite
      .prepare(
        `select d.from_story as id, s.board_status as status from story_dependency d
         join story s on s.project_id = d.project_id and s.story_id = d.from_story
         where d.project_id = ? and d.to_story = ? and d.type = 'blocking' order by d.from_story`,
      )
      .all(projectId, storyId) as { id: string; status: BoardStatus }[];
  }

  elementPath(projectId: string, elementId: string): string | undefined {
    return (
      this.sqlite.prepare('select artifact_path from element where project_id = ? and element_id = ?').get(projectId, elementId) as
        { artifact_path: string } | undefined
    )?.artifact_path;
  }

  /** Elements of the given types (context of the feature review, US-083). */
  elementsOfTypes(projectId: string, types: readonly string[]): { id: string; type: string; title: string }[] {
    if (types.length === 0) return [];
    return this.sqlite
      .prepare(
        `select element_id as id, type, title from element where project_id = ? and type in (${types.map(() => '?').join(', ')}) order by element_id`,
      )
      .all(projectId, ...types) as { id: string; type: string; title: string }[];
  }

  /** Feature intents (US-081). */
  features(projectId: string): IndexedFeature[] {
    return this.sqlite
      .prepare(
        `select f.feature_id as id, f.title, f.approval_state as approval, f.status, f.source_idea as sourceIdea,
           f.baseline_tag as baseline, e.artifact_path as path
         from feature_intent f
         join element e on e.project_id = f.project_id and e.element_id = f.feature_id and e.type = 'feature_intent'
         where f.project_id = ? order by f.feature_id`,
      )
      .all(projectId) as IndexedFeature[];
  }

  /** Stories linked to a feature with `feature: FI-xxx` (US-081 AC-4). */
  featureStories(projectId: string, featureId: string): { id: string; status: BoardStatus; approval: 'draft' | 'approved' }[] {
    return this.sqlite
      .prepare(
        'select story_id as id, board_status as status, approval_state as approval from story where project_id = ? and feature_id = ? order by story_id',
      )
      .all(projectId, featureId) as { id: string; status: BoardStatus; approval: 'draft' | 'approved' }[];
  }

  /** Type of the link between two IDs (`references`, or a feature trace type, US-081 AC-3). */
  linkType(projectId: string, sourceRef: string, targetRef: string): string | undefined {
    return (
      this.sqlite
        .prepare(
          `select link_type from trace_link where project_id = ? and source_ref = ? and target_ref = ?
           order by case link_type when 'references' then 1 else 0 end limit 1`,
        )
        .get(projectId, sourceRef, targetRef) as { link_type: string } | undefined
    )?.link_type;
  }

  /** Elements that reference `targetRef` (downstream links, US-034). */
  linkSources(projectId: string, targetRef: string): string[] {
    return (
      this.sqlite
        .prepare('select distinct source_ref from trace_link where project_id = ? and target_ref = ? order by source_ref')
        .all(projectId, targetRef) as { source_ref: string }[]
    ).map((r) => r.source_ref);
  }

  allLinks(projectId: string): { source: string; target: string; artifactPath: string }[] {
    return this.sqlite
      .prepare(
        'select distinct source_ref as source, target_ref as target, artifact_path as artifactPath from trace_link where project_id = ? order by artifact_path, source_ref, target_ref',
      )
      .all(projectId) as { source: string; target: string; artifactPath: string }[];
  }

  linkTargets(projectId: string, sourceRef: string): string[] {
    return (
      this.sqlite
        .prepare('select distinct target_ref from trace_link where project_id = ? and source_ref = ? order by target_ref')
        .all(projectId, sourceRef) as { target_ref: string }[]
    ).map((r) => r.target_ref);
  }

  /** Done stories with a recorded branch that the user has not merged yet (US-024). */
  unmergedDoneStories(projectId: string): { storyId: string; branch: string }[] {
    return this.sqlite
      .prepare(
        `select s.story_id as storyId, s.branch as branch from story s
         left join story_state st on st.project_id = s.project_id and st.story_id = s.story_id
         where s.project_id = ? and s.board_status = 'done' and s.branch is not null and st.merged_at is null
         order by s.story_id`,
      )
      .all(projectId) as { storyId: string; branch: string }[];
  }

  setMergedAt(projectId: string, storyId: string, at: string): void {
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, merged_at) values (?, ?, ?)
         on conflict (project_id, story_id) do update set merged_at = excluded.merged_at`,
      )
      .run(projectId, storyId, at);
  }

  mergedAt(projectId: string, storyId: string): string | null {
    const row = this.sqlite.prepare('select merged_at from story_state where project_id = ? and story_id = ?').get(projectId, storyId) as
      { merged_at: string | null } | undefined;
    return row?.merged_at ?? null;
  }

  /** Indexed element IDs and story dependencies with their files (validation of spec runs, US-027). */
  specIndexView(projectId: string): {
    elements: { id: string; path: string }[];
    dependencies: { from: string; to: string; type: 'blocking' | 'related'; path: string }[];
    stories: { id: string; status: BoardStoryRow['status'] }[];
  } {
    const elements = this.sqlite
      .prepare('select element_id as id, artifact_path as path from element where project_id = ? order by element_id')
      .all(projectId) as { id: string; path: string }[];
    const dependencies = this.sqlite
      .prepare(
        `select d.from_story as "from", d.to_story as "to", d.type as type, coalesce(e.artifact_path, '') as path
         from story_dependency d left join element e on e.project_id = d.project_id and e.element_id = d.from_story
         where d.project_id = ?`,
      )
      .all(projectId) as { from: string; to: string; type: 'blocking' | 'related'; path: string }[];
    const stories = this.sqlite.prepare('select story_id as id, board_status as status from story where project_id = ?').all(projectId) as {
      id: string;
      status: BoardStoryRow['status'];
    }[];
    return { elements, dependencies, stories };
  }

  element(projectId: string, elementId: string): { type: string; title: string; artifactPath: string } | undefined {
    const row = this.sqlite
      .prepare('select type, title, artifact_path from element where project_id = ? and element_id = ?')
      .get(projectId, elementId) as { type: string; title: string; artifact_path: string } | undefined;
    return row ? { type: row.type, title: row.title, artifactPath: row.artifact_path } : undefined;
  }

  /** Branch recorded in the story front-matter (set when a run starts, data_model.md §1.3). */
  storyBranch(projectId: string, storyId: string): string | null {
    return (
      (
        this.sqlite.prepare('select branch from story where project_id = ? and story_id = ?').get(projectId, storyId) as
          { branch: string | null } | undefined
      )?.branch ?? null
    );
  }

  setSubState(projectId: string, storyId: string, subState: ExecSubState): void {
    this.s.setSubState!.run(projectId, storyId, subState);
  }

  setOrder(projectId: string, storyId: string, order: number): void {
    this.s.setOrder!.run(projectId, storyId, order);
  }

  setAuthorisedAt(projectId: string, storyId: string, at: string): void {
    this.s.setAuthorisedAt!.run(projectId, storyId, at);
  }

  /** Approval states and impact flags per guided phase (PhaseStatus, domain_model.md). */
  phaseInputs(projectId: string): PhaseInputs {
    const inputs = Object.fromEntries(SPEC_PHASES.map((p) => [p, { approvals: [] as ('draft' | 'approved')[], impacted: false }])) as {
      [P in SpecPhase]: { approvals: ('draft' | 'approved')[]; impacted: boolean };
    };
    const rows = this.s.phaseArtifacts!.all(projectId) as { kind: string; approval_state: 'draft' | 'approved'; impacted: number }[];
    for (const row of rows) {
      const phase = PHASE_OF_KIND[row.kind];
      if (!phase) continue;
      inputs[phase].approvals.push(row.approval_state);
      inputs[phase].impacted ||= row.impacted === 1;
    }
    return inputs;
  }

  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }

  private clear(projectId: string, path: string): void {
    for (const { element_id: id } of this.s.ownedIds!.all(projectId, path) as Array<{ element_id: string }>) {
      this.s.deleteStory!.run(projectId, id);
      this.s.deleteDeps!.run(projectId, id);
      this.s.deleteEpic!.run(projectId, id);
      this.s.deleteFeature!.run(projectId, id);
    }
    this.s.deleteElements!.run(projectId, path);
    this.s.deleteLinks!.run(projectId, path);
    this.s.deleteIdeas!.run(projectId, path);
  }
}
