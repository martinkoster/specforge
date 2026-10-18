// SPDX-License-Identifier: Apache-2.0
// Run lifecycle (US-048, UC-017, FR-030/040/042): the Scheduler's RunLauncher. Prepares the execution space, starts the
// agent, streams and batch-persists redacted events, enforces timeouts (paused while waiting for a permission decision)
// and applies the outcome to run and story.
import type { AgentSettings, ExecSubState, StartKind } from '@specforge/domain';
import type { PermissionRunContext } from '../permissions/permission-broker.js';
import type { AgentAdapter, AgentConfig, AgentEvent, PermissionAnswer, PermissionAsk, RunKind } from '../ports/agent-adapter.js';
import type { LaunchRequest, RunLauncher } from '../scheduling/scheduler.js';
import type { RunStatus } from '../scheduling/ports.js';
import { createRedactor, type Redactor } from '../secrets/redactor.js';
import { parseRunResult, type RunResult } from './result-parser.js';

export interface RunEventRecord {
  seq: number;
  ts: string;
  type: AgentEvent['type'];
  /** Redacted event. */
  payload: unknown;
}

export interface ExecutionStorePort {
  setRunStatus(runId: string, status: RunStatus, reason?: string): void;
  markStarted(runId: string, at: string): void;
  setSessionId(runId: string, sessionId: string): void;
  appendEvents(runId: string, events: RunEventRecord[]): void;
  setSubState(projectId: string, storyId: string, subState: ExecSubState): void;
  setStatusNotice(projectId: string, storyId: string, notice: string | null): void;
  /** Structured result (or why it is unavailable) and the computed changes of a completed run (US-051). */
  saveResult(
    runId: string,
    result: { result: RunResult | null; unavailableReason: string | null; computedFiles: ChangedFileStat[]; rawResult: string | null },
  ): void;
  /** Identity of the agent process (pid + start time + command line) for orphan cleanup after a crash (FR-041). */
  recordProcess(runId: string, record: ProcessIdentity): void;
  /** Files a story's runs touched (overlap detection, dependency context; FR-070). */
  recordTouches(projectId: string, storyId: string, runId: string, paths: string[]): void;
  /** Puts the story back into the queue as *Blocked (conflict)* (FR-067). */
  requeueConflict(
    projectId: string,
    storyId: string,
    entry: { queuedAt: string; startKind: StartKind; parentRunId?: string },
    files: string[],
  ): void;
}

export interface ProcessIdentity {
  pid: number;
  startTime: string;
  commandLine: string;
}

/** Process-tree termination and identity (ProcessRegistry, validated in spike S3). */
export interface ProcessControl {
  identify(pid: number): Promise<ProcessIdentity | undefined>;
  killTree(pid: number): Promise<void>;
}

export type PreparedSpace =
  { kind: 'ready'; cwd: string; workspaceRoot: string; nonGit: boolean } | { kind: 'blocked_conflict'; files: string[]; message: string };

export interface ChangedFileStat {
  path: string;
  change: 'A' | 'M' | 'D';
  additions: number;
  deletions: number;
}

export interface ExecutionSpaces {
  prepare(request: LaunchRequest): Promise<PreparedSpace>;
  /** What the run changed (git: worktree vs. base commit; non-git: snapshot diff). */
  changes(request: LaunchRequest): Promise<ChangedFileStat[]>;
}

export interface RunPromptBuilder {
  build(request: LaunchRequest): Promise<{ prompt: string; systemAppend?: string }>;
}

export interface RunConfig {
  maxRunDurationS: number;
  idleTimeoutS: number;
  agent: AgentSettings;
}

export type RunEndOutcome = 'completed' | 'failed' | 'cancelled';

export interface ExecutionDeps {
  store: ExecutionStorePort;
  spaces: ExecutionSpaces;
  prompts: RunPromptBuilder;
  /** The agent adapter; absent until a runtime adapter is available. */
  adapter: AgentAdapter | undefined;
  /** Environment for the agent process (secrets resolved) and the secret values to redact. */
  env(projectId: string): Promise<{ env: Record<string, string>; secrets: string[] }>;
  config(projectId: string): RunConfig;
  permissions: { ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> };
  implementationActive(projectId: string): boolean;
  /** System transition after a completed run: the story moves to Review. */
  transitions: { completed(projectId: string, storyId: string): Promise<void> };
  /** The slot is free again (→ Scheduler `RunFinished`). */
  onFinished(request: LaunchRequest, outcome: RunEndOutcome): void;
  processes?: ProcessControl;
  /** Agent session of the stopped run to continue (`resume` starts, US-055). */
  resumeSession?(request: LaunchRequest): string | undefined;
  /** Live stream to the UI (already redacted). */
  emit?(runId: string, event: AgentEvent, seq: number): void;
  now(): string;
  batch?: { intervalMs: number; maxEvents: number };
}

export const NO_ADAPTER_REASON = 'No agent adapter is available to execute runs yet. Discard the run to move the story back to Ready.';

const duration = (seconds: number): string => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

/** Max-duration and idle timers that can be paused while a permission decision is pending (FR-042). */
export class RunTimers {
  private maxLeft: number;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private startedAt = 0;
  private paused = 0;

  constructor(
    private readonly maxMs: number,
    private readonly idleMs: number,
    private readonly onTimeout: (reason: string) => void,
  ) {
    this.maxLeft = maxMs;
  }

  start(): void {
    this.startedAt = Date.now();
    this.maxTimer = setTimeout(
      () => this.onTimeout(`Timeout: the run exceeded the maximum duration of ${duration(this.maxMs / 1000)}.`),
      this.maxLeft,
    );
    this.activity();
  }

  activity(): void {
    if (this.paused > 0) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.onTimeout(`Timeout: no agent activity for ${duration(this.idleMs / 1000)}.`), this.idleMs);
  }

  pause(): void {
    if (this.paused++ > 0) return;
    this.maxLeft -= Date.now() - this.startedAt;
    clearTimeout(this.maxTimer);
    clearTimeout(this.idleTimer);
  }

  resume(): void {
    if (--this.paused > 0) return;
    this.start();
  }

  stop(): void {
    clearTimeout(this.maxTimer);
    clearTimeout(this.idleTimer);
  }
}

/** Collects events and writes them in batches (every `intervalMs` or `maxEvents`, NFR-015). */
export class EventBatcher {
  private buffer: RunEventRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly write: (events: RunEventRecord[]) => void,
    private readonly intervalMs: number,
    private readonly maxEvents: number,
  ) {}

  add(event: RunEventRecord): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxEvents) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), this.intervalMs);
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.write(batch);
  }
}

interface ActiveRun {
  request: LaunchRequest;
  stop?: (reason: string) => Promise<void>;
  pid?: number;
  done: Promise<void>;
  /** The user cancelled: an outcome other than "completed" (e.g. the killed process failing) counts as cancelled. */
  cancelRequested?: boolean;
  /** Cancelled without the agent ending: the run was finalised by `cancel`; a late outcome is ignored. */
  forced?: boolean;
}

const CANCEL_GRACE_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ExecutionService implements RunLauncher {
  private closing = false;
  private readonly active = new Map<string, ActiveRun>();

  constructor(private readonly deps: ExecutionDeps) {}

  /** Runs the launched run to its end (the Scheduler does not await it). */
  launch(request: LaunchRequest): Promise<void> {
    const entry: ActiveRun = { request, done: Promise.resolve() };
    entry.done = (async () => {
      const outcome = await this.execute(request, entry).catch((e: unknown) =>
        this.fail(request, `Preparing the run failed: ${e instanceof Error ? e.message : String(e)}`),
      );
      if (entry.forced) return;
      this.active.delete(request.runId);
      this.deps.onFinished(request, outcome);
    })();
    this.active.set(request.runId, entry);
    return entry.done;
  }

  /**
   * Cancels a run (US-049 AC-1, FR-034): asks the agent to stop; if it has not ended after 5 s its process tree is
   * killed; after 10 s the run is marked Cancelled in any case. Resolves false for unknown runs.
   */
  async cancel(runId: string): Promise<boolean> {
    const entry = this.active.get(runId);
    if (!entry) return false;
    const ended = (ms: number) => Promise.race([entry.done.then(() => true), sleep(ms).then(() => false)]);
    entry.cancelRequested = true;
    void entry.stop?.('Cancelled by the user.').catch(() => undefined);
    if (await ended(CANCEL_GRACE_MS)) return true;
    if (entry.pid !== undefined) await this.deps.processes?.killTree(entry.pid).catch(() => undefined);
    if (await ended(CANCEL_GRACE_MS)) return true;
    entry.forced = true;
    this.active.delete(runId);
    this.deps.store.setRunStatus(runId, 'cancelled', 'The agent did not stop in time; its run was marked cancelled.');
    this.deps.onFinished(entry.request, 'cancelled');
    return true;
  }

  /** Runs that are currently active (close dialog, US-049 AC-2). */
  activeRuns(): LaunchRequest[] {
    return [...this.active.values()].map((e) => e.request);
  }

  /** SpecForge is closing: active runs are stopped and marked *Interrupted* (FR-041); waits until they have ended. */
  async shutdown(): Promise<void> {
    this.closing = true;
    const runs = [...this.active.values()];
    await Promise.allSettled(runs.map((r) => r.stop?.('SpecForge is closing.')));
    await Promise.allSettled(runs.map((r) => r.done));
  }

  private async execute(request: LaunchRequest, entry: ActiveRun): Promise<RunEndOutcome> {
    const { deps } = this;
    if (this.closing) return this.fail(request, 'SpecForge is shutting down; the run was not started.');
    const adapter = deps.adapter;
    if (!adapter) return this.fail(request, NO_ADAPTER_REASON);

    const space = await deps.spaces.prepare(request);
    if (space.kind === 'blocked_conflict') {
      deps.store.setRunStatus(request.runId, 'cancelled', space.message);
      deps.store.requeueConflict(
        request.projectId,
        request.storyId,
        { queuedAt: deps.now(), startKind: request.startKind, ...(request.parentRunId ? { parentRunId: request.parentRunId } : {}) },
        space.files,
      );
      deps.store.setSubState(request.projectId, request.storyId, 'blocked_conflict');
      deps.store.setStatusNotice(request.projectId, request.storyId, space.message);
      return 'cancelled';
    }

    const [{ env, secrets }, prompt] = await Promise.all([deps.env(request.projectId), deps.prompts.build(request)]);
    const config = deps.config(request.projectId);
    const redactor = createRedactor(secrets);
    const kind: RunKind = request.startKind === 'correct' ? 'correct' : 'implement';
    const batch = deps.batch ?? { intervalMs: 100, maxEvents: 200 };
    const events = new EventBatcher((records) => deps.store.appendEvents(request.runId, records), batch.intervalMs, batch.maxEvents);

    deps.store.setRunStatus(request.runId, 'running');
    deps.store.markStarted(request.runId, deps.now());
    deps.store.setSubState(request.projectId, request.storyId, 'running');

    let timeoutReason: string | undefined;
    // Set once the agent has started; the timeout callback may fire before.
    const control: { cancel?: () => Promise<void> } = {};
    const timers = new RunTimers(config.maxRunDurationS * 1000, config.idleTimeoutS * 1000, (reason) => {
      timeoutReason ??= reason;
      void control.cancel?.();
    });
    const permissionContext: PermissionRunContext = {
      runId: request.runId,
      projectId: request.projectId,
      runKind: kind,
      workspaceRoot: space.workspaceRoot,
      nonGit: space.nonGit,
      implementationActive: () => deps.implementationActive(request.projectId),
    };
    let seq = 0;
    // Resume and corrections (US-059) continue the previous run's agent session where the adapter supports it and a
    // session is available (`resumeSession` decides; a correction may ask for a fresh session); otherwise a fresh one.
    const resumes = request.startKind === 'resume' || request.startKind === 'correct';
    const resumeSessionId = resumes && adapter.capabilities().resume ? deps.resumeSession?.(request) : undefined;

    // Timers start before the agent: an agent may already ask for a permission while starting.
    timers.start();
    const handle = adapter.start(
      {
        runId: request.runId,
        kind,
        cwd: space.cwd,
        prompt: prompt.prompt,
        ...(prompt.systemAppend ? { systemAppend: prompt.systemAppend } : {}),
        config: agentConfig(config.agent, env),
        ...(resumeSessionId ? { resumeSessionId } : {}),
      },
      {
        onEvent: (event) => {
          timers.activity();
          if (event.type === 'session') deps.store.setSessionId(request.runId, event.sessionId);
          const redacted = redact(redactor, event);
          seq += 1;
          events.add({ seq, ts: deps.now(), type: event.type, payload: redacted });
          deps.emit?.(request.runId, redacted, seq);
        },
        onPermission: async (ask) => {
          timers.pause();
          deps.store.setSubState(request.projectId, request.storyId, 'awaiting_permission');
          try {
            return await deps.permissions.ask(permissionContext, ask);
          } finally {
            deps.store.setSubState(request.projectId, request.storyId, 'running');
            timers.resume();
          }
        },
      },
    );
    control.cancel = () => handle.cancel(timeoutReason);
    entry.stop = (reason) => handle.cancel(reason);
    if (timeoutReason) void control.cancel();
    const pid = handle.pid?.();
    if (pid !== undefined) {
      entry.pid = pid;
      void this.deps.processes
        ?.identify(pid)
        .then((identity) => identity && deps.store.recordProcess(request.runId, identity))
        .catch(() => undefined);
    }

    const outcome = await handle.done;
    timers.stop();
    events.flush();
    if (entry.forced) return 'cancelled';

    if (timeoutReason) return this.fail(request, timeoutReason, 'Failed (timeout)');
    if (outcome.status === 'completed') {
      const parsed = parseRunResult(outcome.resultText);
      const computedFiles = await deps.spaces.changes(request).catch(() => []);
      deps.store.saveResult(request.runId, {
        result: parsed.available ? parsed.result : null,
        unavailableReason: parsed.available ? null : parsed.reason,
        computedFiles,
        rawResult: redactor.text(outcome.resultText) || null,
      });
      if (computedFiles.length > 0) {
        deps.store.recordTouches(
          request.projectId,
          request.storyId,
          request.runId,
          computedFiles.map((f) => f.path),
        );
      }
      // The story moves to Review before the run is reported as completed, so readers never see a completed run
      // with the story still In Progress.
      try {
        await deps.transitions.completed(request.projectId, request.storyId);
      } catch (e) {
        deps.store.setStatusNotice(
          request.projectId,
          request.storyId,
          `The run completed, but the story could not be moved to Review: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      deps.store.setRunStatus(
        request.runId,
        parsed.available ? 'completed' : 'completed_no_result',
        parsed.available ? undefined : parsed.reason,
      );
      return 'completed';
    }
    if (outcome.status === 'failed' && !entry.cancelRequested) return this.fail(request, outcome.reason);
    if (this.closing && !entry.cancelRequested) {
      deps.store.setRunStatus(request.runId, 'interrupted', 'SpecForge was closed while the run was active.');
      deps.store.setSubState(request.projectId, request.storyId, 'interrupted');
      deps.store.setStatusNotice(request.projectId, request.storyId, 'Interrupted: SpecForge was closed while the run was active.');
      return 'cancelled';
    }
    deps.store.setRunStatus(request.runId, 'cancelled');
    return 'cancelled';
  }

  private fail(request: LaunchRequest, reason: string, notice = `Failed: ${reason}`): RunEndOutcome {
    this.deps.store.setRunStatus(request.runId, 'failed', reason);
    this.deps.store.setSubState(request.projectId, request.storyId, 'failed');
    this.deps.store.setStatusNotice(request.projectId, request.storyId, notice);
    return 'failed';
  }
}

export function agentConfig(settings: AgentSettings, env: Record<string, string>): AgentConfig {
  const config: AgentConfig = { env };
  if (settings.model) config.model = settings.model;
  if (settings.effort) config.params = { effort: settings.effort };
  if (settings.maxTurns !== undefined) config.maxTurns = settings.maxTurns;
  return { ...config, env };
}

function redact(redactor: Redactor, event: AgentEvent): AgentEvent {
  return redactor.value(event);
}
