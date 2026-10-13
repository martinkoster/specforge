# SpecForge — Service Design (Core service components)

**Last updated:** 2026-10-14

All services run inside the Core utilityProcess (ADR-002). "Public interface" = IPC commands/queries/events exposed to the UI (via `ipc-contract`, ADR-015) and internal ports used by other services. Dependency direction is strictly top-down (no cycles): **Application services → Domain ← Infrastructure adapters**; application services may depend on Scheduler, PermissionBroker and infrastructure ports, never on each other except where listed.

Dependency order (acyclic; generated from each service's **Dependencies** list below — Persistence omitted):
```
ProjectService ───► WorkspaceIndexer, ExecutionSpaceManager, ExecutionService (startup recovery), Git port
SettingsService ──► AgentAdapter registry, SecretVault (main)
SetupService ─────► AgentAdapter registry, SettingsService, ExecutionService (connection test), Git port, SecretVault
SpecService ──────► WorkspaceIndexer, ExecutionService, ContextAssembler, DependencyGraph, SnapshotStore, Git port
BoardService ─────► WorkspaceIndexer, Scheduler, ExecutionSpaceManager (working-copy status)
ReviewService ────► BoardService, Scheduler, ExecutionSpaceManager
ExecutionService ─► Scheduler (post), ExecutionSpaceManager, ContextAssembler, PermissionBroker, AgentAdapter registry,
                    ResultParser, SecretRedactor, ProcessRegistry, SecretVault
Scheduler ────────► SchedulingPolicy, DependencyGraph, ExecutionSpaceManager, RunLauncher port (implemented by ExecutionService)
ChatService ──────► ExecutionService, ContextAssembler, PermissionBroker, ExecutionSpaceManager / SnapshotStore, WorkspaceIndexer
QualityService ───► ExecutionService, ContextAssembler, SpecService
DecisionService ──► WorkspaceIndexer, ExecutionService, SpecService                       (Release 2)
PlanService ──────► BoardService, SettingsService, DependencyGraph                         (Release 2)
FeatureService ───► ExecutionService, ContextAssembler, ImpactService, SpecService,
                    BoardService, ReviewService, WorkspaceIndexer, Git port                (Release 2)
ImpactService ────► WorkspaceIndexer, ExecutionService                                     (Release 2)
DashboardService ─► PhaseStatusPolicy, NextStepPolicy, NotificationHub (read models)
PermissionBroker ─► PermissionPolicy, NotificationHub
ContextAssembler ─► WorkspaceIndexer
WorkspaceIndexer ─► ArtifactStore ─► FileSystem port
ExecutionSpaceManager ─► Git port, SnapshotStore ─► FileSystem port
NotificationHub ◄── domain events (subscribe only)
```
The Scheduler calls back into execution through a `RunLauncher` port implemented by ExecutionService, keeping the graph acyclic at module level.

---

## ProjectService
**Purpose**: Create, open, adopt, list, rename, remove projects; detect their VCS mode; detect merged story branches.
**Public Interface**: `project.create({name, path, initGit?})`, `project.open(id)`, `project.adopt(path)` (brownfield registration; the UI then offers `spec.analyze`, FR-079, Release 2), `project.list()`, `project.rename`, `project.remove(id)`, `merge.refresh(projectId)` (manual *Refresh*, FR-115); events `ProjectOpened`, `VcsModeChanged`, `StoryMerged`.
**Merge detection (FR-115)**: for every approved story with an unmerged branch, calls `ExecutionSpaceManager.isMerged(branch, base)` (`git merge-base --is-ancestor`) on project open, on window focus, after git operations SpecForge performs, every `merge_check_interval_s` (default 60 s) and on `merge.refresh`; sets `story.merged_at`, emits `StoryMerged` (→ epic *Merged* status, "merged" count, "Merge n approved branches" next step; later stacked bases use the base branch).
**Dependencies**: WorkspaceIndexer, ExecutionSpaceManager (merge detection), Git port, Persistence, ExecutionService (startup recovery).
**Data Owned**: `project`, `.specforge/project.yaml`, `story.merged_at`.
**Scalability Notes**: ≥ 20 projects; only the open project is watched/indexed.
**Resilience Notes**: Missing folder → "Locate / Remove" flow; removal blocked while runs are active.

## SettingsService
**Purpose**: Manage runtimes, project settings, approval rules and secrets.
**Public Interface**: `runtime.detect()`, `runtime.verify(path)`, `runtime.update(cfg)`, `settings.get/update(projectId)`, `rules.list/add/remove`, `secret.set/delete(key)` (value goes to main process `safeStorage`).
**Dependencies**: AgentAdapter registry (detect/verify), Persistence, main-process SecretVault (IPC).
**Data Owned**: `agent_runtime`, `project_settings`, `permission_rule`, `project_rule_override`, `.specforge/instructions.md`.
**Resilience Notes**: Concurrency limit changes emit `LimitChanged` to the Scheduler; non-git forces 1.

## WorkspaceIndexer (+ FileWatcher, ArtifactStore)
**Purpose**: Keep the DB index consistent with workspace artifacts and write artifacts atomically.
**Public Interface**: internal `indexAll(projectId)`, `reindex(path)`, `writeArtifact(path, content, {expectedHash})`, `updateFrontMatter(path, patch)`; events `ArtifactChanged`, `StoryStatusChanged`, `DependenciesChanged`, `ArtifactInvalid`; query `artifacts.list`, `element.get`, `trace.get(ref)`.
**Dependencies**: FileSystem port (chokidar, fs), Markdown parser (unified/remark, gray-matter), Persistence.
**Data Owned**: `artifact`, `element`, `trace_link`, `story`, `story_dependency`, `epic` (index columns), `feature_intent` and `idea` (index columns, Release 2), `artifact_revision` (non-git, Release 2).
**Scalability Notes**: Incremental per-file re-index, debounced 200 ms; full index of 1,000 stories < 2 s.
**Resilience Notes**: Self-writes identified by content hash (no echo); parse errors keep last valid state; optimistic concurrency on writes (`expectedHash`) → conflict error to UI. Indexes only the main workspace; run worktrees are never indexed (FR-116a).

## SpecService
**Purpose**: Intent/spec editing, approval, AI generation/refinement/clarification, impact flags.
**Public Interface**: `spec.save(path, content)`, `spec.approve(path)`, `spec.generate({target: requirements|design|epics|stories|test_concepts, epicIds?})` (stories generated per epic), `epic.create/update/merge/split/delete`, `epic.coverage(projectId)` (requirements not covered by any epic), `spec.refine({path, section?, instruction})`, `spec.clarify.start(intentPath)`, `spec.clarify.answer(runId, answers)`, `spec.applyProposal(runId, keep|discard)`, `impact.clear(ref)`, `spec.commitChanges({message})` (FR-072: commits only `spec/` and `.specforge/` on the current branch of the main workspace), `spec.history(path)` / `spec.compare(path, revA, revB)` (FR-015, Release 2; git log or `artifact_revision`), `spec.analyze(projectId, {folders?})` (`analyze` run, FR-079, Release 2), direct-edit new-scope hint on `spec.save` of approved specs ("create a feature intent instead?", FR-114, Release 3).
**Dependencies**: WorkspaceIndexer, ExecutionService (`startSpecRun`), ContextAssembler, DependencyGraph (validation of proposed dependencies), SnapshotStore (target-folder snapshot), Git port (commit, history).
**Data Owned**: approval state (via front-matter), impact flags.
**Resilience Notes**: Discard restores the pre-run snapshot of the target folder; validation issues listed with "Ask agent to fix". In non-git mode, write-capable spec runs are denied writes while an implementation run is active (FR-116b, PermissionBroker).

## BoardService
**Purpose**: Kanban state, transitions and dependency editing.
**Public Interface**: `board.get(projectId, {view: byEpic | flat, epicFilter?})` (lanes with epic header — derived status, progress, derived epic dependencies — and cards with status, sub-state, badges, queue reason, epic tag), `board.move(storyId, toStatus, position)`, `board.reorder`, `board.reorderLanes`, `story.setEpic(storyId, epicId | null)`, `epic.start(epicId)` (Release 2; moves all Ready stories, each as human authorisation), `queue.remove(storyId)` (→ Ready, `StoryDequeued`), `queue.recheck(storyId)` (*Re-check* on *Blocked (conflict)* cards → `ConflictResolved`), `dependency.add/remove(from, to, type)`, `graph.get(projectId, {groupByEpic})`; events `CardUpdated`, `EpicStatusChanged`.
**Dependencies**: Domain (StoryStateMachine, DependencyGraph), WorkspaceIndexer (front-matter writes), Scheduler (`StoryAuthorised`, `StoryDequeued`, `DependencyChanged`, `ConflictResolved`), ExecutionSpaceManager (working-copy status).
**Data Owned**: board order, `epic.lane_order` / `epic.colour`; transitions' authorisation records.
**Resilience Notes**: Transition validation in domain; illegal moves return explanation (FR-021). A move to In Progress is persisted (status + `authorised_at`) **before** the Scheduler is notified, so a crash between the two is recovered by re-evaluating the queue at startup. In git mode, if the main working copy has uncommitted changes, the move returns a warning that these changes are not part of the run's base (FR-116c).

## Scheduler
**Purpose**: Decide when authorised stories, corrections, retries and resumes start, respecting dependencies, the concurrency limit and the shared working copy in non-git mode.
**Public Interface**: internal `post(event)` (`StoryAuthorised`, `CorrectionRequested`, `RetryRequested`, `ResumeRequested`, `RunFinished`, `StoryApproved`, `DependencyChanged`, `LimitChanged`, `ConflictResolved`, `StoryDequeued`, `WorkspaceWriterChanged`); port `RunLauncher.launch(storyId, {startKind: implement|correct|retry|resume, parentRunId?, feedback?, reuseBranch?}, trigger)`; query `queue.get(projectId)`.
**Policy**: implementation, correction, retry and resume runs count toward the limit; corrections/resumes first, then FIFO by authorisation time; failed, interrupted and cancelled runs free their slot (FR-027). Non-git mode: an implementation run does not start while a write-capable chat or spec run is active → queued with reason `workspace` ("waiting for workspace", FR-116b); re-evaluated on `WorkspaceWriterChanged`.
**Dependencies**: Domain `SchedulingPolicy`, DependencyGraph, Persistence (`queue_entry`, `run`), RunLauncher (implemented by ExecutionService), ExecutionSpaceManager (conflict pre-check).
**Data Owned**: `queue_entry`.
**Scalability Notes**: Evaluation O(queued × predecessors); negligible at 1,000 stories.
**Resilience Notes**: Single serialised event loop + DB transaction per evaluation (ADR-009); at startup re-evaluates all queues; idempotent `launch` (a story with a non-terminal run is never launched twice).

## ExecutionService
**Purpose**: Own the lifecycle of runs: prepare, launch, stream, finish, cancel, resume, retry, timeouts, recovery.
**Public Interface**: `run.list(projectId)`, `run.get(id)`, `run.stream.subscribe(id)` (batched events), `run.cancel(id)`, `run.retry(storyId, {reuseBranch})` and `run.resume(id)` (both post `RetryRequested` / `ResumeRequested` to the Scheduler — never started directly), `run.discard(id)`; internal `startSpecRun(...)` (outside the limit; emits `WorkspaceWriterChanged` for write-capable chat/spec runs in non-git mode), `RunLauncher.launch(...)` (the only start path for implement/correct/retry/resume runs); events `RunStarted`, `RunStatusChanged`, `RunFinished`.
**Dependencies**: Scheduler (`post`), AgentAdapter registry, ExecutionSpaceManager, ContextAssembler, PermissionBroker, ResultParser, SecretRedactor, ProcessRegistry, Persistence, main-process SecretVault (env secrets).
**Data Owned**: `run`, `run_event`, `run_result`, `execution_space` (with ExecutionSpaceManager), `recommendation`, `file_touch`.
**Scalability Notes**: One agent process per run; event writes batched in transactions every 100 ms or 200 events; per-run memory ring buffer for live UI.
**Resilience Notes**: Timeouts (max duration and idle; time in `awaiting_approval` pauses both, FR-042; no permission prompt timeout); persisted log loses at most the last 1 s on crash (FR-040, NFR-015); adapter errors → `failed` with reason (NFR-017); startup: non-terminal runs → `interrupted`, orphan PIDs killed via ProcessRegistry; on app close: abort all, mark `interrupted` (FR-041).

## ExecutionSpaceManager
**Purpose**: Provide isolated execution spaces and compute changes.
**Public Interface**: internal `prepare(run, story) → ExecutionSpace | Conflict` (unmerged predecessors only; merged ones are based on the base branch, FR-115), `diff(space) → ChangedFile[]` + per-file patch, `restore(snapshotId)`, `isMerged(branch, base)` (`git merge-base --is-ancestor`), `workingCopyStatus()` (uncommitted changes in the main workspace, FR-116c), `cleanup(space)`, `markRejected(branch)`; query `diff.file(runId, path)`.
**Dependencies**: Git port (git CLI via execFile), SnapshotStore, Persistence.
**Data Owned**: worktrees, integration refs, `execution_space` (with ExecutionService); snapshots via SnapshotStore.
**Resilience Notes**: Worktree creation failures (locked, path exists) → retry with suffix, else `failed`; `git worktree prune` at startup; integration scratch worktree always removed in `finally`.

## ContextAssembler
**Purpose**: Build prompts and system-prompt appendices for runs.
**Public Interface**: internal `forImplementation(story, run) → {prompt, systemAppend, digest}`, `forSpec(kind, inputs)`, `forCorrection(parentRun, feedback)` (feedback pre-filled from `in_flight_decision.pending_feedback` when present, FR-110, Release 2).
**Dependencies**: WorkspaceIndexer (story, linked elements, instructions), Persistence (predecessor results, concurrent runs, file touches).
**Content (implementation)**: story + acceptance criteria; epic goal, epic acceptance criteria and sibling stories (status; summaries and changed files of Done ones) (FR-099); linked requirements/design/ADRs (full text up to a budget, then titles + paths); project instructions; blocking predecessors with summary + changed files; related and concurrently running stories with status + touched files; scope rule ("implement only this story; do not modify `spec/`; report missing dependencies"); test expectation; result schema instruction (ADR-008). **Rework stories** (`reworks:`, FR-109, Release 2): additionally the original story text, its last run summary and changed files.
**Resilience Notes**: Size budget with deterministic truncation; digest stored on the run (FR-037).

## PermissionBroker
**Purpose**: Single decision point for agent permission requests.
**Public Interface**: adapter-facing `ask(runId, PermissionAsk) → Promise<PermissionAnswer>`; UI `permission.pending()`, `permission.decide(id, allow|deny, {message, alwaysAllow})`; events `PermissionRequested`, `PermissionDecided`.
**Built-in denies** (before rules, ADR-013): writes to `spec/**` / `.specforge/**` in implementation runs (FR-116a); in non-git mode chat/spec writes while an implementation run is active (FR-116b); story status changes by agents; all chat writes in Release 1 (FR-089).
**Dependencies**: Domain `PermissionPolicy`, Persistence (`permission_request`, `permission_rule`), NotificationHub.
**Data Owned**: `permission_request`.
**Resilience Notes**: Pending asks survive UI reloads (held in memory + DB); no prompt timeout; run abort cancels its pending asks (→ deny); dismissal/shutdown → deny all pending (`decided_by = default_deny`).

## ReviewService
**Purpose**: Review outcomes for implementation runs.
**Public Interface**: `review.get(storyId)` (result, diff summary, warnings, merge order), `review.approve(storyId)`, `review.requestCorrections(storyId, feedback)` (feedback pre-filled from pending in-flight feedback, Release 2; emits `CorrectionRequested` to the Scheduler, which launches via `RunLauncher` with priority *correction*), `review.reject(storyId, {reason, restoreSnapshot})`; epic review (Release 2): `epicReview.get(epicId)` (stories + outcomes, union of changed files with per-story diffs, epic acceptance criteria), `epicReview.aiCheck(epicId)` (`quality_check` run, target epic), `epicReview.confirm(epicId, checklist)`, `epicReview.skip(epicId)`, `epicReview.addFollowUp(epicId, storyDraft)`.
**Dependencies**: BoardService (status writes), Scheduler (`StoryApproved`, `CorrectionRequested`), ExecutionSpaceManager (diff, restore, markRejected), Persistence (`review_decision`).
**Data Owned**: `review_decision`.
**Resilience Notes**: Approval is a single transaction (decision + status write + event); session not resumable → fallback fresh run with feedback (UC-022 2a).

## NotificationHub
**Purpose**: Pending-decisions read model and notifications.
**Public Interface**: `pending.list(projectId)`, `pending.count()`; events `PendingChanged`, `Notify` (→ main process OS notification when window unfocused).
**Dependencies**: subscribes to domain events; Persistence view `v_pending_decision`.
**Data Owned**: none (derived).

## AgentAdapter: ClaudeCodeAdapter
**Purpose**: Implement the AgentAdapter port (ADR-008) for Claude Code using the Agent SDK (ADR-006).
**Public Interface**: `detect()`, `verify()`, `start(req, hooks)`.
**Mapping**:
| Port concept | Agent SDK |
|---|---|
| start | `query({ prompt, options: { cwd, model, pathToClaudeCodeExecutable, permissionMode: "default", systemPrompt: {type: "preset", preset: "claude_code", append}, resume?, abortController, env, maxTurns? } })` |
| onEvent | iterate `SDKMessage`: `system/init` → sessionId; `assistant` → output/tool_use; `user` → tool_result; `result` → outcome, usage, cost |
| onPermission | `canUseTool(toolName, input, {signal, toolUseID})` → `hooks.onPermission` → `{behavior:"allow", updatedInput: input}` / `{behavior:"deny", message}` |
| cancel | `abortController.abort()`; then ProcessRegistry tree-kill if the process remains after 5 s |
| resume | `options.resume = sessionId` with same `cwd` |
**Dependencies**: Agent SDK (pinned range), ProcessRegistry.
**Resilience Notes**: `result.subtype` error variants → failed with reason; SDK exceptions captured; executable version checked at verify; `--bare`-like modes not used.

## AgentAdapter: MockAdapter
**Purpose**: Deterministic scripted agent for unit/E2E tests (NFR-022/023): scripted events, permission asks, file edits in cwd, results, failures, hangs.

## SetupService
**Purpose**: Run the first-start setup wizard, health checks and publish capabilities (limited mode).
**Public Interface**: `setup.state()`, `setup.detectRuntime()`, `setup.saveProvider({kind, …})` (secrets → SecretVault), `setup.testConnection()` (tiny `connection_test` run), `setup.detectGit()`, `setup.suggestRules()`, `setup.saveDefaults(rules, execDefaults)`, `setup.complete()`, `setup.skip()`, `health.run()`; event `CapabilitiesChanged`.
**Dependencies**: AgentAdapter registry, SettingsService (global rules, defaults), ExecutionService (connection test), Git port, SecretVault.
**Data Owned**: `app_setup`.
**Resilience Notes**: Each step idempotent and resumable; health check at startup; capability loss (e.g. executable removed) switches to limited mode without crashing (ADR-018).

## DashboardService
**Purpose**: Provide the dashboard read model: phase statuses, next step, story stats, runs, pending decisions, artifacts, usage, activity.
**Public Interface**: `dashboard.get(projectId)`, `activity.list(projectId, {limit, before})`, `usage.summary(projectId, {from, to})` (Release 2); event `DashboardChanged` (debounced 250 ms).
**Dependencies**: Domain `PhaseStatusPolicy`, `NextStepPolicy` (ADR-017), Persistence (views), NotificationHub (pending decisions).
**Data Owned**: `activity` (append-only feed).
**Scalability Notes**: Aggregates via indexed SQL (`story` by status, `run` by status, `run_result.usage`); < 1 s for 1,000 stories/runs (NFR-030).

## QualityService
**Purpose**: Run AI quality checks and manage findings.
**Public Interface**: `quality.check(artifactPath)`, `quality.findings(artifactPath)`, `quality.applyFix(findingId)` (→ refine proposal), `quality.dismiss(findingId, reason)`.
**Dependencies**: ExecutionService (`quality_check` spec run, read-only policy), ContextAssembler (phase criteria templates), SpecService (proposals).
**Data Owned**: `quality_finding`.

## DecisionService (Release 2)
**Purpose**: Collect open decision items and run decision review.
**Public Interface**: `decisions.open(projectId)`, `decisions.proposeOptions(itemId)` (agent `decision_options` run when options missing), `decisions.decide(itemId, {option | answer | defer})`, `decisions.applyAll(projectId)` (→ artifact proposals).
**Dependencies**: WorkspaceIndexer (parses "Open questions", "Assumptions", ADR `Status: Proposed`), Persistence (`recommendation`), ExecutionService, SpecService.
**Data Owned**: `decision_item`.

## PlanService (Release 2)
**Purpose**: Compute implementation waves and critical path; start a wave.
**Public Interface**: `plan.get(projectId, {groupByEpic})` → waves, critical path, derived epic graph; `plan.startWave(projectId, waveNo)` → delegates per story to `BoardService.move(…, in_progress)` (each a human authorisation).
**Dependencies**: Domain DependencyGraph (topological levels, longest path weighted by size), BoardService, SettingsService (concurrency limit).
**Data Owned**: none (derived).

## ChatService
**Purpose**: Manage chat threads, run chat messages through the agent, track and revert changes (ADR-016).
**Public Interface**: `chat.threads(projectId)`, `chat.create(projectId, title?)`, `chat.rename/archive(threadId)`, `chat.send(threadId, text)` → streams like a run, `chat.changes(runId)` and `chat.revert(runId | changeId)` (Release 2, FR-091 — Release 1 chat is read-only, FR-089); events `ChatMessageAdded`, `ChatChangeRecorded`.
**Dependencies**: ExecutionService (`chat` runs, session resume), ContextAssembler (project context: intent summary, artifact index, board state, instructions), PermissionBroker (chat policy), ExecutionSpaceManager / SnapshotStore (before-content), WorkspaceIndexer (spec changes → Draft, impact).
**Data Owned**: `chat_thread`, `chat_message`, `chat_change`.
**Resilience Notes**: Session not resumable (expired) → new session seeded with thread summary; revert conflicts (file changed since) → show 3-way diff and require confirmation.

## FeatureService (Release 2)
**Purpose**: Manage feature intents end-to-end: wizard, lifecycle, feature-scoped phases, ideas and baselines.
**Public Interface**: `feature.wizard.start({text, details})`, `feature.wizard.review(wizardId)` (`feature_review` run), `feature.wizard.answer(wizardId, answers)` (resume), `feature.wizard.save(wizardId, {approve})`, `feature.list(projectId)`, `feature.get(featureId)` (stepper, impact, change sets, epics), `feature.withdraw(featureId)`, `feature.generateDelta(featureId, phase)` (`generate` run scoped by impact list), `changeSet.accept/discard(itemIds)` → in-flight check, `idea.capture/list/turnIntoFeature/merge/dismiss`, `baseline.offer/create(featureId?)`; events `FeatureStatusChanged`, `IdeaCaptured`.
**Dependencies**: ExecutionService (runs), ContextAssembler (main intent, requirement/epic index, ADR titles, impact scope), ImpactService, SpecService (writes, approvals), BoardService (in-flight decisions → cancel/dequeue), ReviewService (apply in corrections), Git port (tags), WorkspaceIndexer.
**Data Owned**: `feature_intent.wizard_state` (index columns of `feature_intent` / `idea` are owned by WorkspaceIndexer), `change_set`, `change_item`, `baseline`.
**Resilience Notes**: Wizard state persisted after each step (resume after restart); change sets produced from a scratch copy of the target folder and applied atomically per accepted subset with optimistic concurrency on files (ADR-021). `feature.withdraw` discards open change sets, keeps applied changes and flags linked not-started stories for keep/delete; adding stories to a reviewed epic clears its `epic_review` outcome.

## ImpactService (Release 2)
**Purpose**: Compute feature impact from the trace graph and an agent analysis; detect in-flight conflicts.
**Public Interface**: `impact.trace(featureId)` (synchronous, < 2 s), `impact.analyse(featureId)` (`impact` run, streams items), `impact.confirm(featureId, items)`, `impact.inFlight(changeSet)` → affected queued/running/review stories; `inFlight.decide(storyId, decision)`.
**Dependencies**: WorkspaceIndexer (trace links), Persistence (`file_touch`, runs, stories), ExecutionService.
**Data Owned**: `impact_item`, `in_flight_decision` (incl. `pending_feedback` for *Apply in corrections* on running stories — stored, then pre-filled into *Request corrections* when the story reaches Review; never starts a correction itself).

## SnapshotStore
**Purpose**: Content-addressed file snapshots for non-git runs (ADR-011), spec-run target folders (ADR-014), feature delta scratch copies (ADR-021) and chat before-content.
**Public Interface**: internal `snapshot(root, {include?, exclusions}) → snapshotId`, `diff(snapshotId, root) → ChangedFile[]`, `restore(snapshotId, root)`, `copyTo(snapshotId, scratchPath)`, `blob(hash)`, `gc(projectId)`.
**Dependencies**: FileSystem port, Persistence (`snapshot`).
**Data Owned**: `snapshot`, blobs under `<appdata>/snapshots/<project_id>/objects`.

## ResultParser
**Purpose**: Extract and validate the structured `specforge-result` block (FR-036, ADR-008).
**Public Interface**: internal `parse(kind, finalText) → RunResult | ResultUnavailable` (zod schema per run kind).
**Dependencies**: none (pure).

## SecretRedactor
**Purpose**: Remove known secret values and common key patterns from every event, log line and UI payload before persistence or display (NFR-006, ADR-012).
**Public Interface**: internal `register(runId, values[])`, `redact(text | json) → redacted`.
**Dependencies**: none (values supplied just-in-time by ExecutionService from SecretVault).

## ProcessRegistry
**Purpose**: Track and terminate agent process trees cross-platform.
**Public Interface**: `register(runId, pid)`, `killTree(pid)`, `cleanupOrphans()`.
**Notes**: Windows `taskkill /PID <pid> /T /F`; POSIX: signal process group (SIGTERM, then SIGKILL after 5 s). Orphan check validates PID + start time/command line before killing to avoid PID reuse.
