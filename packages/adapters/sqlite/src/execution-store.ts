// SPDX-License-Identifier: Apache-2.0
// Execution store on SQLite (data_model.md §2.3): runs, the scheduler queue and the immutable permission log.
import { randomUUID } from 'node:crypto';
import type {
  DecidedBy,
  ChangedFileStat,
  ExecutionStorePort,
  NewRun,
  ProcessIdentity,
  ChatMessage,
  ChatThread,
  ClarificationRecord,
  QualityFinding,
  SpecReviewRecord,
  PermissionRecord,
  PermissionStore,
  RunEventRecord,
  RunRecord,
  RunResult,
  RunStatus,
  SchedulerStore,
  StoredQueueEntry,
} from '@specforge/application';
import type { ExecSubState, QueueEntry, QueueReason } from '@specforge/domain';
import type { Database as Sqlite } from 'better-sqlite3';

const TERMINAL: readonly RunStatus[] = ['completed', 'completed_no_result', 'failed', 'cancelled', 'interrupted'];
const ACTIVE = "('preparing', 'running', 'awaiting_approval')";
const IMPLEMENTATION_KINDS = "('implement', 'correct')";

interface QueueRow {
  story_id: string;
  queued_at: string;
  priority: 0 | 1;
  start_kind: QueueEntry['startKind'];
  parent_run_id: string | null;
  reason: QueueReason | null;
  waiting_for: string;
}

interface RunRow {
  id: string;
  project_id: string;
  story_id: string | null;
  kind: RunRecord['kind'];
  start_kind: RunRecord['startKind'];
  parent_run_id: string | null;
  status: RunStatus;
  start_trigger: string | null;
  config_snapshot: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  agent_session_id: string | null;
  last_event_seq: number;
}

export interface ExecutionSpaceRecord {
  mode: 'worktree' | 'in_place';
  branch: string | null;
  worktreePath: string | null;
  baseRef: string | null;
  stackedOn: string[];
  snapshotId: string | null;
}

export class ExecutionStore implements SchedulerStore, ExecutionStorePort {
  constructor(private readonly sqlite: Sqlite) {}

  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }

  queue(projectId: string): StoredQueueEntry[] {
    const rows = this.sqlite
      .prepare('select * from queue_entry where project_id = ? order by priority, queued_at, story_id')
      .all(projectId) as QueueRow[];
    return rows.map((r) => ({
      storyId: r.story_id,
      queuedAt: r.queued_at,
      priority: r.priority,
      startKind: r.start_kind,
      ...(r.parent_run_id ? { parentRunId: r.parent_run_id } : {}),
      reason: r.reason,
      waitingFor: JSON.parse(r.waiting_for) as string[],
    }));
  }

  enqueue(projectId: string, entry: QueueEntry): void {
    this.sqlite
      .prepare(
        `insert into queue_entry (project_id, story_id, queued_at, priority, start_kind, parent_run_id) values (?, ?, ?, ?, ?, ?)
         on conflict (project_id, story_id) do update set queued_at = excluded.queued_at, priority = excluded.priority,
           start_kind = excluded.start_kind, parent_run_id = excluded.parent_run_id, reason = null, waiting_for = '[]'`,
      )
      .run(projectId, entry.storyId, entry.queuedAt, entry.priority, entry.startKind, entry.parentRunId ?? null);
  }

  dequeue(projectId: string, storyId: string): void {
    this.sqlite.prepare('delete from queue_entry where project_id = ? and story_id = ?').run(projectId, storyId);
  }

  setWaiting(projectId: string, storyId: string, reason: QueueReason, waitingFor: string[]): void {
    this.sqlite
      .prepare('update queue_entry set reason = ?, waiting_for = ? where project_id = ? and story_id = ?')
      .run(reason, JSON.stringify(waitingFor), projectId, storyId);
  }

  activeImplementationRuns(projectId: string): number {
    return (
      this.sqlite
        .prepare(`select count(*) as n from run where project_id = ? and status in ${ACTIVE} and kind in ${IMPLEMENTATION_KINDS}`)
        .get(projectId) as { n: number }
    ).n;
  }

  hasActiveRun(projectId: string, storyId: string): boolean {
    return (
      this.sqlite
        .prepare(`select 1 from run where project_id = ? and story_id = ? and status in ${ACTIVE} limit 1`)
        .get(projectId, storyId) !== undefined
    );
  }

  createRun(projectId: string, run: NewRun): string {
    const id = randomUUID();
    this.sqlite
      .prepare(
        `insert into run (id, project_id, story_id, kind, start_kind, parent_run_id, status, start_trigger, config_snapshot, created_at)
         values (?, ?, ?, ?, ?, ?, 'preparing', ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        run.storyId,
        run.kind,
        run.startKind,
        run.parentRunId ?? null,
        run.trigger,
        run.configSnapshot === undefined ? null : JSON.stringify(run.configSnapshot),
        new Date().toISOString(),
      );
    return id;
  }

  run(id: string): RunRecord | undefined {
    const r = this.sqlite.prepare('select * from run where id = ?').get(id) as RunRow | undefined;
    return r ? toRun(r) : undefined;
  }

  /** Runs of a project, newest first. */
  runs(projectId: string): (RunRecord & { failureReason: string | null })[] {
    const rows = this.sqlite
      .prepare('select * from run where project_id = ? order by created_at desc, rowid desc')
      .all(projectId) as (RunRow & {
      failure_reason: string | null;
    })[];
    return rows.map((r) => ({ ...toRun(r), failureReason: r.failure_reason }));
  }

  setRunStatus(id: string, status: RunStatus, failureReason?: string): void {
    const ended = TERMINAL.includes(status) ? new Date().toISOString() : null;
    this.sqlite
      .prepare('update run set status = ?, ended_at = coalesce(ended_at, ?), failure_reason = coalesce(?, failure_reason) where id = ?')
      .run(status, ended, failureReason ?? null, id);
  }

  markStarted(id: string, at: string): void {
    this.sqlite.prepare('update run set started_at = ? where id = ?').run(at, id);
  }

  setSessionId(id: string, sessionId: string): void {
    this.sqlite.prepare('update run set agent_session_id = ? where id = ?').run(sessionId, id);
  }

  /** Appends one batch of (redacted) events in a single transaction (US-048 AC-2) and indexes their text (US-054). */
  appendEvents(runId: string, events: RunEventRecord[]): void {
    if (events.length === 0) return;
    const insert = this.sqlite.prepare('insert into run_event (run_id, seq, ts, type, payload) values (?, ?, ?, ?, ?)');
    const index = this.sqlite.prepare('insert into run_event_fts (text, run_id, seq) values (?, ?, ?)');
    this.sqlite.transaction(() => {
      for (const e of events) {
        insert.run(runId, e.seq, e.ts, e.type, JSON.stringify(e.payload));
        const text = searchableText(e.payload);
        if (text) index.run(text, runId, e.seq);
      }
      this.sqlite.prepare('update run set last_event_seq = max(last_event_seq, ?) where id = ?').run(events.at(-1)!.seq, runId);
    })();
  }

  runEvents(runId: string, afterSeq = 0, limit = -1): RunEventRecord[] {
    const rows = this.sqlite
      .prepare('select seq, ts, type, payload from run_event where run_id = ? and seq > ? order by seq limit ?')
      .all(runId, afterSeq, limit) as {
      seq: number;
      ts: string;
      type: RunEventRecord['type'];
      payload: string;
    }[];
    return rows.map((r) => ({ seq: r.seq, ts: r.ts, type: r.type, payload: JSON.parse(r.payload) as unknown }));
  }

  saveSpecReview(r: SpecReviewRecord): void {
    this.sqlite
      .prepare(
        `insert into spec_review (run_id, project_id, target, kind, instruction, snapshot_id, parent_run_id, state, files, issues, reason, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (run_id) do update set state = excluded.state, files = excluded.files, issues = excluded.issues, reason = excluded.reason`,
      )
      .run(
        r.runId,
        r.projectId,
        r.target,
        r.kind,
        r.instruction,
        r.snapshotId,
        r.parentRunId,
        r.state,
        JSON.stringify(r.files),
        JSON.stringify(r.issues),
        r.reason,
        r.createdAt,
      );
  }

  specReview(runId: string): SpecReviewRecord | undefined {
    const row = this.sqlite.prepare('select * from spec_review where run_id = ?').get(runId) as SpecReviewRow | undefined;
    return row ? toSpecReview(row) : undefined;
  }

  openSpecReviews(projectId: string): SpecReviewRecord[] {
    return (
      this.sqlite
        .prepare(`select * from spec_review where project_id = ? and state not in ('kept', 'discarded', 'superseded') order by created_at`)
        .all(projectId) as SpecReviewRow[]
    ).map(toSpecReview);
  }

  openSpecReview(projectId: string, target: string): SpecReviewRecord | undefined {
    const row = this.sqlite
      .prepare(
        `select * from spec_review where project_id = ? and target = ? and state not in ('kept', 'discarded', 'superseded')
         order by created_at desc, rowid desc limit 1`,
      )
      .get(projectId, target) as SpecReviewRow | undefined;
    return row ? toSpecReview(row) : undefined;
  }

  saveThread(t: ChatThread): void {
    this.sqlite
      .prepare(
        `insert into chat_thread (id, project_id, title, agent_session_id, created_at, last_used_at) values (?, ?, ?, ?, ?, ?)
         on conflict (id) do update set title = excluded.title, agent_session_id = excluded.agent_session_id, last_used_at = excluded.last_used_at`,
      )
      .run(t.id, t.projectId, t.title, t.sessionId, t.createdAt, t.updatedAt);
  }

  thread(id: string): ChatThread | undefined {
    const row = this.sqlite.prepare('select * from chat_thread where id = ?').get(id) as ThreadRow | undefined;
    return row ? toThread(row) : undefined;
  }

  threads(projectId: string): ChatThread[] {
    return (
      this.sqlite
        .prepare('select * from chat_thread where project_id = ? and archived = 0 order by last_used_at desc')
        .all(projectId) as ThreadRow[]
    ).map(toThread);
  }

  addMessage(m: ChatMessage): void {
    const seq = (
      this.sqlite.prepare('select coalesce(max(seq), 0) + 1 as n from chat_message where thread_id = ?').get(m.threadId) as { n: number }
    ).n;
    this.sqlite
      .prepare(
        `insert into chat_message (id, thread_id, seq, role, text, run_id, tool_uses, recommendations, error, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        m.id,
        m.threadId,
        seq,
        m.role === 'assistant' ? 'agent' : 'user',
        m.content,
        m.runId,
        JSON.stringify(m.toolUses),
        JSON.stringify(m.recommendations),
        m.error ? 1 : 0,
        m.createdAt,
      );
  }

  messages(threadId: string): ChatMessage[] {
    return (this.sqlite.prepare('select * from chat_message where thread_id = ? order by seq').all(threadId) as MessageRow[]).map(
      toMessage,
    );
  }

  saveClarification(r: ClarificationRecord): void {
    this.sqlite
      .prepare(
        `insert into clarification (id, project_id, intent_path, state, session_id, items, last_run_id, proposal_run_id, reason, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do update set state = excluded.state, session_id = excluded.session_id, items = excluded.items,
           last_run_id = excluded.last_run_id, proposal_run_id = excluded.proposal_run_id, reason = excluded.reason`,
      )
      .run(
        r.id,
        r.projectId,
        r.intentPath,
        r.state,
        r.sessionId,
        JSON.stringify(r.items),
        r.lastRunId,
        r.proposalRunId,
        r.reason,
        r.createdAt,
      );
  }

  clarification(id: string): ClarificationRecord | undefined {
    const row = this.sqlite.prepare('select * from clarification where id = ?').get(id) as ClarificationRow | undefined;
    return row ? toClarification(row) : undefined;
  }

  latestClarification(projectId: string, intentPath: string): ClarificationRecord | undefined {
    const row = this.sqlite
      .prepare('select * from clarification where project_id = ? and intent_path = ? order by created_at desc, rowid desc limit 1')
      .get(projectId, intentPath) as ClarificationRow | undefined;
    return row ? toClarification(row) : undefined;
  }

  replaceFindings(projectId: string, artifactPath: string, findings: QualityFinding[]): void {
    const insert = this.sqlite.prepare(
      `insert into quality_finding (id, project_id, run_id, artifact_path, element_id, severity, category, explanation, suggested_fix, state, dismiss_reason, fix_run_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare("delete from quality_finding where project_id = ? and artifact_path = ? and state = 'open'")
        .run(projectId, artifactPath);
      for (const f of findings) {
        insert.run(
          f.id,
          f.projectId,
          f.runId,
          f.artifactPath,
          f.elementId,
          f.severity,
          f.category,
          f.explanation,
          f.suggestedFix,
          f.state,
          f.dismissReason,
          f.fixRunId,
        );
      }
    })();
  }

  findings(projectId: string, artifactPath?: string): QualityFinding[] {
    const rows = (
      artifactPath === undefined
        ? this.sqlite.prepare('select * from quality_finding where project_id = ? order by rowid').all(projectId)
        : this.sqlite
            .prepare('select * from quality_finding where project_id = ? and artifact_path = ? order by rowid')
            .all(projectId, artifactPath)
    ) as FindingRow[];
    return rows.map(toFinding);
  }

  finding(id: string): QualityFinding | undefined {
    const row = this.sqlite.prepare('select * from quality_finding where id = ?').get(id) as FindingRow | undefined;
    return row ? toFinding(row) : undefined;
  }

  findingsFixedBy(runId: string): QualityFinding[] {
    return (this.sqlite.prepare('select * from quality_finding where fix_run_id = ? order by rowid').all(runId) as FindingRow[]).map(
      toFinding,
    );
  }

  updateFinding(id: string, patch: Partial<Pick<QualityFinding, 'state' | 'dismissReason' | 'fixRunId'>>): void {
    const current = this.finding(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.sqlite
      .prepare('update quality_finding set state = ?, dismiss_reason = ?, fix_run_id = ? where id = ?')
      .run(next.state, next.dismissReason, next.fixRunId, id);
  }

  /** Other stories (active or unmerged) that touched the same files as `storyId` (overlap warning, US-057, FR-070). */
  overlaps(projectId: string, storyId: string): { storyId: string; files: string[] }[] {
    const rows = this.sqlite
      .prepare(
        `select other.story_id as storyId, other.path as path from file_touch own
         join file_touch other on other.project_id = own.project_id and other.path = own.path and other.story_id <> own.story_id
         where own.project_id = ? and own.story_id = ? order by other.story_id, other.path`,
      )
      .all(projectId, storyId) as { storyId: string; path: string }[];
    const byStory = new Map<string, string[]>();
    for (const r of rows) byStory.set(r.storyId, [...(byStory.get(r.storyId) ?? []), r.path]);
    return [...byStory].map(([id, files]) => ({ storyId: id, files }));
  }

  /** Runs (and their stories) that touched a file (traceability, US-034). */
  fileRuns(projectId: string, path: string): { runId: string; storyId: string }[] {
    return this.sqlite
      .prepare('select run_id as runId, story_id as storyId from file_touch where project_id = ? and path = ? order by story_id')
      .all(projectId, path) as { runId: string; storyId: string }[];
  }

  /** Overlap records of a merged story are no longer relevant (US-024 AC-2). */
  clearTouches(projectId: string, storyId: string): void {
    this.sqlite.prepare('delete from file_touch where project_id = ? and story_id = ?').run(projectId, storyId);
  }

  eventCount(runId: string): number {
    return (this.sqlite.prepare('select count(*) as n from run_event where run_id = ?').get(runId) as { n: number }).n;
  }

  /** Sequence numbers of events matching an FTS5 query (NFR-005: < 2 s on 100 MB logs). */
  searchEvents(runId: string, query: string, limit = 1000): number[] {
    const run = (q: string) =>
      (
        this.sqlite
          .prepare('select seq from run_event_fts where run_event_fts match ? and run_id = ? order by seq limit ?')
          .all(q, runId, limit) as { seq: number }[]
      ).map((r) => r.seq);
    try {
      return run(query);
    } catch {
      // Input that is not valid FTS syntax (e.g. an unbalanced quote) is searched as plain words.
      const words = query.match(/[\p{L}\p{N}_]+\*?/gu) ?? [];
      if (words.length === 0) return [];
      return run(words.map((w) => (w.endsWith('*') ? `"${w.slice(0, -1)}"*` : `"${w}"`)).join(' '));
    }
  }

  /** Execution view (US-054 AC-1): active runs first, then queued stories, then recent runs. */
  runsOverview(
    projectId: string,
    recent = 50,
  ): {
    runId: string | null;
    storyId: string | null;
    kind: string;
    status: string;
    queuedAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    touchedFiles: number;
    pendingPrompts: number;
  }[] {
    const runs = this.sqlite
      .prepare(
        `select run.id, run.story_id, run.kind, run.status, run.started_at, run.ended_at, run.created_at,
           (select count(*) from file_touch t where t.run_id = run.id) as touched,
           (select count(*) from permission_request p where p.run_id = run.id and p.decision is null) as prompts
         from run where project_id = ? order by created_at desc, rowid desc limit ?`,
      )
      .all(projectId, recent + 20) as {
      id: string;
      story_id: string | null;
      kind: string;
      status: RunStatus;
      started_at: string | null;
      ended_at: string | null;
      created_at: string;
      touched: number;
      prompts: number;
    }[];
    const active = runs.filter((r) => ['preparing', 'running', 'awaiting_approval'].includes(r.status));
    const ended = runs.filter((r) => !active.includes(r)).slice(0, recent);
    const toRow = (r: (typeof runs)[number]) => ({
      runId: r.id,
      storyId: r.story_id,
      kind: r.kind,
      status: r.status as string,
      queuedAt: null,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      touchedFiles: r.touched,
      pendingPrompts: r.prompts,
    });
    const queued = this.queue(projectId)
      .filter((q) => !active.some((r) => r.story_id === q.storyId))
      .map((q) => ({
        runId: null,
        storyId: q.storyId,
        kind: q.startKind === 'correct' ? 'correct' : 'implement',
        status: q.reason === 'conflict' ? 'blocked_conflict' : 'queued',
        queuedAt: q.queuedAt,
        startedAt: null,
        endedAt: null,
        touchedFiles: 0,
        pendingPrompts: 0,
      }));
    return [...active.map(toRow), ...queued, ...ended.map(toRow)];
  }

  requeueConflict(
    projectId: string,
    storyId: string,
    entry: { queuedAt: string; startKind: QueueEntry['startKind']; parentRunId?: string },
    files: string[],
  ): void {
    this.transaction(() => {
      this.enqueue(projectId, {
        storyId,
        queuedAt: entry.queuedAt,
        priority: entry.startKind === 'correct' || entry.startKind === 'resume' ? 0 : 1,
        startKind: entry.startKind,
        ...(entry.parentRunId ? { parentRunId: entry.parentRunId } : {}),
      });
      this.setWaiting(projectId, storyId, 'conflict', files);
    });
  }

  saveExecutionSpace(runId: string, space: Omit<ExecutionSpaceRecord, 'snapshotId'> & { snapshotId?: string | null }): void {
    this.sqlite
      .prepare(
        `insert or replace into execution_space (run_id, mode, branch, worktree_path, base_ref, stacked_on, snapshot_id)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, space.mode, space.branch, space.worktreePath, space.baseRef, JSON.stringify(space.stackedOn), space.snapshotId ?? null);
  }

  executionSpace(runId: string): ExecutionSpaceRecord | undefined {
    const row = this.sqlite.prepare('select * from execution_space where run_id = ?').get(runId) as
      | {
          mode: ExecutionSpaceRecord['mode'];
          branch: string | null;
          worktree_path: string | null;
          base_ref: string | null;
          stacked_on: string;
          snapshot_id: string | null;
        }
      | undefined;
    return row
      ? {
          mode: row.mode,
          branch: row.branch,
          worktreePath: row.worktree_path,
          baseRef: row.base_ref,
          stackedOn: JSON.parse(row.stacked_on) as string[],
          snapshotId: row.snapshot_id,
        }
      : undefined;
  }

  saveResult(
    runId: string,
    r: { result: RunResult | null; unavailableReason: string | null; computedFiles: ChangedFileStat[]; rawResult: string | null },
  ): void {
    this.transaction(() => {
      this.sqlite
        .prepare(
          `insert or replace into run_result (run_id, outcome, summary, tests_run, tests_passed, tests_failed, coverage, reported_files,
             computed_files, open_issues, raw_result, unavailable_reason) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          r.result?.outcome ?? null,
          r.result?.summary ?? null,
          r.result?.tests?.run ?? null,
          r.result?.tests?.passed ?? null,
          r.result?.tests?.failed ?? null,
          r.result?.coverage ?? null,
          JSON.stringify(r.result?.changedFiles ?? []),
          JSON.stringify(r.computedFiles),
          JSON.stringify({ issues: r.result?.openIssues ?? [], recommendations: r.result?.recommendations ?? [] }),
          r.rawResult,
          r.unavailableReason,
        );
      const insert = this.sqlite.prepare("insert into recommendation (id, run_id, type, payload, state) values (?, ?, ?, ?, 'open')");
      for (const rec of r.result?.recommendations ?? []) insert.run(randomUUID(), runId, rec.type, JSON.stringify({ text: rec.text }));
    });
  }

  runResult(runId: string): { result: RunResult | null; unavailableReason: string | null; computedFiles: ChangedFileStat[] } | undefined {
    const row = this.sqlite.prepare('select * from run_result where run_id = ?').get(runId) as
      | {
          outcome: RunResult['outcome'] | null;
          summary: string | null;
          tests_run: number | null;
          tests_passed: number | null;
          tests_failed: number | null;
          coverage: number | null;
          reported_files: string;
          computed_files: string;
          open_issues: string;
          unavailable_reason: string | null;
        }
      | undefined;
    if (!row) return undefined;
    const extra = JSON.parse(row.open_issues) as { issues: string[]; recommendations: RunResult['recommendations'] };
    const result: RunResult | null =
      row.outcome === null
        ? null
        : {
            outcome: row.outcome,
            summary: row.summary ?? '',
            ...(row.tests_run !== null
              ? { tests: { run: row.tests_run, passed: row.tests_passed ?? 0, failed: row.tests_failed ?? 0 } }
              : {}),
            ...(row.coverage !== null ? { coverage: row.coverage } : {}),
            changedFiles: JSON.parse(row.reported_files) as string[],
            openIssues: extra.issues,
            recommendations: extra.recommendations,
          };
    return { result, unavailableReason: row.unavailable_reason, computedFiles: JSON.parse(row.computed_files) as ChangedFileStat[] };
  }

  recordProcess(runId: string, identity: ProcessIdentity): void {
    this.sqlite
      .prepare('update run set pid = ?, pid_start_time = ?, pid_command_line = ? where id = ?')
      .run(identity.pid, identity.startTime, identity.commandLine, runId);
  }

  /**
   * Startup recovery (US-049 AC-3, FR-041): runs left active by a crash become *Interrupted*; returns them with the
   * recorded agent process identity for orphan cleanup.
   */
  interruptActiveRuns(): { runId: string; projectId: string; storyId: string | null; process: ProcessIdentity | null }[] {
    const rows = this.sqlite
      .prepare(`select id, project_id, story_id, pid, pid_start_time, pid_command_line from run where status in ${ACTIVE}`)
      .all() as {
      id: string;
      project_id: string;
      story_id: string | null;
      pid: number | null;
      pid_start_time: string | null;
      pid_command_line: string | null;
    }[];
    const notice = 'Interrupted: SpecForge was closed or crashed while the run was active.';
    this.transaction(() => {
      for (const r of rows) {
        this.setRunStatus(r.id, 'interrupted', notice);
        if (r.story_id) {
          this.setSubState(r.project_id, r.story_id, 'interrupted');
          this.setStatusNotice(r.project_id, r.story_id, notice);
        }
      }
    });
    return rows.map((r) => ({
      runId: r.id,
      projectId: r.project_id,
      storyId: r.story_id,
      process:
        r.pid !== null && r.pid_start_time !== null
          ? { pid: r.pid, startTime: r.pid_start_time, commandLine: r.pid_command_line ?? '' }
          : null,
    }));
  }

  /** Summary of the latest structured result of a story's runs. */
  latestSummary(projectId: string, storyId: string): string | null {
    const row = this.sqlite
      .prepare(
        `select rr.summary from run_result rr join run on run.id = rr.run_id
         where run.project_id = ? and run.story_id = ? and rr.summary is not null order by run.created_at desc, run.rowid desc limit 1`,
      )
      .get(projectId, storyId) as { summary: string } | undefined;
    return row?.summary ?? null;
  }

  /** Stories with an active implementation run (other than `exceptStoryId`). */
  activeStories(projectId: string, exceptStoryId: string): string[] {
    return (
      this.sqlite
        .prepare(
          `select distinct story_id from run where project_id = ? and story_id is not null and story_id <> ?
           and status in ('preparing', 'running', 'awaiting_approval') order by story_id`,
        )
        .all(projectId, exceptStoryId) as { story_id: string }[]
    ).map((r) => r.story_id);
  }

  /** The assembled context of a run (FR-037). */
  setContextDigest(runId: string, context: string): void {
    this.sqlite.prepare('update run set context_digest = ? where id = ?').run(context, runId);
  }

  contextDigest(runId: string): string | null {
    return (
      (this.sqlite.prepare('select context_digest from run where id = ?').get(runId) as { context_digest: string | null } | undefined)
        ?.context_digest ?? null
    );
  }

  recordTouches(projectId: string, storyId: string, runId: string, paths: string[]): void {
    const insert = this.sqlite.prepare('insert or replace into file_touch (project_id, story_id, run_id, path) values (?, ?, ?, ?)');
    this.transaction(() => {
      for (const path of paths) insert.run(projectId, storyId, runId, path);
    });
  }

  /** Files touched by a story's runs, or by all stories of a project. */
  touchedFiles(projectId: string, storyId: string): string[] {
    return (
      this.sqlite.prepare('select path from file_touch where project_id = ? and story_id = ? order by path').all(projectId, storyId) as {
        path: string;
      }[]
    ).map((r) => r.path);
  }

  openRecommendations(projectId: string): { id: string; storyId: string | null; runId: string; text: string }[] {
    const rows = this.sqlite
      .prepare(
        `select r.id, r.run_id, r.payload, run.story_id from recommendation r join run on run.id = r.run_id
         where run.project_id = ? and r.state = 'open' order by run.created_at, r.rowid`,
      )
      .all(projectId) as { id: string; run_id: string; payload: string; story_id: string | null }[];
    return rows.map((r) => ({ id: r.id, storyId: r.story_id, runId: r.run_id, text: (JSON.parse(r.payload) as { text: string }).text }));
  }

  /** Active write-capable chat/specification runs (non-git workspace writers, FR-116b). */
  activeWorkspaceWriters(projectId: string): number {
    return (
      this.sqlite
        .prepare(
          `select count(*) as n from run where project_id = ? and status in ${ACTIVE} and kind not in ${IMPLEMENTATION_KINDS} and kind <> 'connection_test'`,
        )
        .get(projectId) as { n: number }
    ).n;
  }

  queuedCount(projectId: string): number {
    return (this.sqlite.prepare('select count(*) as n from queue_entry where project_id = ?').get(projectId) as { n: number }).n;
  }

  /** Most recent run of a story (parent for corrections and retries). */
  /** Rejected story branches (US-058 AC-2): not reused as base for dependents; kept for reference. */
  addRejectedBranch(projectId: string, storyId: string, branch: string): void {
    const current = this.rejectedBranches(projectId, storyId);
    if (current.includes(branch)) return;
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, rejected_branches) values (?, ?, ?)
         on conflict (project_id, story_id) do update set rejected_branches = excluded.rejected_branches`,
      )
      .run(projectId, storyId, JSON.stringify([...current, branch]));
  }

  rejectedBranches(projectId: string, storyId: string): string[] {
    const row = this.sqlite
      .prepare('select rejected_branches from story_state where project_id = ? and story_id = ?')
      .get(projectId, storyId) as { rejected_branches: string } | undefined;
    return row ? (JSON.parse(row.rejected_branches) as string[]) : [];
  }

  setRetryMode(projectId: string, storyId: string, mode: 'fresh' | 'reuse'): void {
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, retry_mode) values (?, ?, ?)
         on conflict (project_id, story_id) do update set retry_mode = excluded.retry_mode`,
      )
      .run(projectId, storyId, mode);
  }

  retryMode(projectId: string, storyId: string): 'fresh' | 'reuse' {
    const row = this.sqlite.prepare('select retry_mode from story_state where project_id = ? and story_id = ?').get(projectId, storyId) as
      { retry_mode: 'fresh' | 'reuse' | null } | undefined;
    return row?.retry_mode ?? 'fresh';
  }

  /** Feedback of requested corrections (US-059); null clears it once the correction run has started. */
  setCorrection(projectId: string, storyId: string, correction: { feedback: string; fresh: boolean } | null): void {
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, correction_feedback, correction_fresh) values (?, ?, ?, ?)
         on conflict (project_id, story_id) do update
           set correction_feedback = excluded.correction_feedback, correction_fresh = excluded.correction_fresh`,
      )
      .run(projectId, storyId, correction?.feedback ?? null, correction ? Number(correction.fresh) : null);
  }

  correction(projectId: string, storyId: string): { feedback: string; fresh: boolean } | undefined {
    const row = this.sqlite
      .prepare('select correction_feedback, correction_fresh from story_state where project_id = ? and story_id = ?')
      .get(projectId, storyId) as { correction_feedback: string | null; correction_fresh: number | null } | undefined;
    return row?.correction_feedback != null ? { feedback: row.correction_feedback, fresh: row.correction_fresh === 1 } : undefined;
  }

  lastRunId(projectId: string, storyId: string): string | undefined {
    return (
      this.sqlite
        .prepare('select id from run where project_id = ? and story_id = ? order by created_at desc, rowid desc limit 1')
        .get(projectId, storyId) as { id: string } | undefined
    )?.id;
  }

  setStatusNotice(projectId: string, storyId: string, notice: string | null): void {
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, status_notice) values (?, ?, ?)
         on conflict (project_id, story_id) do update set status_notice = excluded.status_notice`,
      )
      .run(projectId, storyId, notice);
  }

  setSubState(projectId: string, storyId: string, subState: ExecSubState): void {
    this.sqlite
      .prepare(
        `insert into story_state (project_id, story_id, exec_substate) values (?, ?, ?)
         on conflict (project_id, story_id) do update set exec_substate = excluded.exec_substate`,
      )
      .run(projectId, storyId, subState);
  }

  projectsWithQueue(): string[] {
    return (this.sqlite.prepare('select distinct project_id from queue_entry order by project_id').all() as { project_id: string }[]).map(
      (r) => r.project_id,
    );
  }
}

function toRun(r: RunRow): RunRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    storyId: r.story_id,
    kind: r.kind,
    startKind: r.start_kind,
    parentRunId: r.parent_run_id,
    status: r.status,
    startTrigger: r.start_trigger,
    configSnapshot: r.config_snapshot === null ? null : (JSON.parse(r.config_snapshot) as unknown),
    createdAt: r.created_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    agentSessionId: r.agent_session_id,
    lastEventSeq: r.last_event_seq,
  };
}

interface ThreadRow {
  id: string;
  project_id: string;
  title: string;
  agent_session_id: string | null;
  created_at: string;
  last_used_at: string;
}

const toThread = (r: ThreadRow): ChatThread => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  sessionId: r.agent_session_id,
  createdAt: r.created_at,
  updatedAt: r.last_used_at,
});

interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'agent';
  text: string;
  run_id: string | null;
  tool_uses: string;
  recommendations: string;
  error: number;
  created_at: string;
}

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  threadId: r.thread_id,
  role: r.role === 'agent' ? 'assistant' : 'user',
  content: r.text,
  runId: r.run_id,
  toolUses: JSON.parse(r.tool_uses) as string[],
  recommendations: JSON.parse(r.recommendations) as ChatMessage['recommendations'],
  error: r.error === 1,
  createdAt: r.created_at,
});

interface ClarificationRow {
  id: string;
  project_id: string;
  intent_path: string;
  state: ClarificationRecord['state'];
  session_id: string | null;
  items: string;
  last_run_id: string | null;
  proposal_run_id: string | null;
  reason: string | null;
  created_at: string;
}

const toClarification = (r: ClarificationRow): ClarificationRecord => ({
  id: r.id,
  projectId: r.project_id,
  intentPath: r.intent_path,
  state: r.state,
  sessionId: r.session_id,
  items: JSON.parse(r.items) as ClarificationRecord['items'],
  lastRunId: r.last_run_id,
  proposalRunId: r.proposal_run_id,
  reason: r.reason,
  createdAt: r.created_at,
});

interface FindingRow {
  id: string;
  project_id: string;
  run_id: string;
  artifact_path: string;
  element_id: string | null;
  severity: QualityFinding['severity'];
  category: string;
  explanation: string;
  suggested_fix: string;
  state: QualityFinding['state'];
  dismiss_reason: string | null;
  fix_run_id: string | null;
}

const toFinding = (r: FindingRow): QualityFinding => ({
  id: r.id,
  projectId: r.project_id,
  runId: r.run_id,
  artifactPath: r.artifact_path,
  elementId: r.element_id,
  severity: r.severity,
  category: r.category,
  explanation: r.explanation,
  suggestedFix: r.suggested_fix,
  state: r.state,
  dismissReason: r.dismiss_reason,
  fixRunId: r.fix_run_id,
});

interface SpecReviewRow {
  run_id: string;
  project_id: string;
  target: string;
  kind: SpecReviewRecord['kind'];
  instruction: string;
  snapshot_id: string;
  parent_run_id: string | null;
  state: SpecReviewRecord['state'];
  files: string;
  issues: string;
  reason: string | null;
  created_at: string;
}

const toSpecReview = (r: SpecReviewRow): SpecReviewRecord => ({
  runId: r.run_id,
  projectId: r.project_id,
  target: r.target,
  kind: r.kind,
  instruction: r.instruction,
  snapshotId: r.snapshot_id,
  parentRunId: r.parent_run_id,
  state: r.state,
  files: JSON.parse(r.files) as SpecReviewRecord['files'],
  issues: JSON.parse(r.issues) as SpecReviewRecord['issues'],
  reason: r.reason,
  createdAt: r.created_at,
});

/** Text of an event for full-text search: output, tool calls with their input, errors. */
function searchableText(payload: unknown): string {
  const e = payload as { type?: string; text?: string; toolName?: string; input?: unknown; message?: string } | null;
  switch (e?.type) {
    case 'output':
      return e.text ?? '';
    case 'tool_use':
      return `${e.toolName ?? ''} ${JSON.stringify(e.input ?? {})}`;
    case 'error':
      return e.message ?? '';
    default:
      return '';
  }
}

interface PermissionRow {
  id: string;
  run_id: string;
  tool_name: string;
  input: string;
  cwd: string;
  outside_workspace: number;
  requested_at: string;
  decision: 'allow' | 'deny' | null;
  decided_by: DecidedBy | null;
  decided_at: string | null;
  message: string | null;
}

const toRecord = (r: PermissionRow): PermissionRecord => ({
  id: r.id,
  runId: r.run_id,
  toolName: r.tool_name,
  input: JSON.parse(r.input) as Record<string, unknown>,
  cwd: r.cwd,
  outsideWorkspace: r.outside_workspace === 1,
  requestedAt: r.requested_at,
  decision: r.decision,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  message: r.message,
});

/** Permission log (US-052 AC-3); a trigger keeps decided rows immutable. */
export class PermissionRequestRepository implements PermissionStore {
  constructor(private readonly sqlite: Sqlite) {}

  insert(r: PermissionRecord): void {
    this.sqlite
      .prepare(
        `insert into permission_request (id, run_id, tool_name, input, cwd, outside_workspace, requested_at, decision, decided_by, decided_at, message)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.id,
        r.runId,
        r.toolName,
        JSON.stringify(r.input),
        r.cwd,
        r.outsideWorkspace ? 1 : 0,
        r.requestedAt,
        r.decision,
        r.decidedBy,
        r.decidedAt,
        r.message,
      );
  }

  decide(id: string, d: Pick<PermissionRecord, 'decision' | 'decidedBy' | 'decidedAt' | 'message'>): void {
    this.sqlite
      .prepare('update permission_request set decision = ?, decided_by = ?, decided_at = ?, message = ? where id = ?')
      .run(d.decision, d.decidedBy, d.decidedAt, d.message, id);
  }

  forRun(runId: string): PermissionRecord[] {
    return (
      this.sqlite.prepare('select * from permission_request where run_id = ? order by requested_at, id').all(runId) as PermissionRow[]
    ).map(toRecord);
  }

  undecided(): PermissionRecord[] {
    return (
      this.sqlite.prepare('select * from permission_request where decision is null order by requested_at, id').all() as PermissionRow[]
    ).map(toRecord);
  }
}
