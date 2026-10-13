# SpecForge — Domain Model

**Last updated:** 2026-10-14

Persistence column: **WS** = stored in workspace Markdown/YAML (source of truth, D2); **DB** = stored in the local database; **WS→DB** = workspace is source of truth, DB holds a rebuildable index.

## Overview

```
                        ┌──────────────┐
                        │ AgentRuntime │ (global config)
                        └──────┬───────┘
                               │ used by
┌─────────┐ 1   n ┌────────────┴───┐
│ Project │───────│ ProjectSettings│ (instructions, limits, rules, overrides)
└────┬────┘       └────────────────┘
     │ 1
     │ n                 n ┌──────────────┐ n
     ├───────────────────│ Artifact     │───────┐ contains
     │                   │ (Intent,     │       │
     │                   │ Requirements,│   ┌───┴──────────────┐
     │                   │ Design, ADR, │   │ ArtifactElement  │ (FR-001, NFR-003, ADR-002, …)
     │                   │ TestConcept) │   └───┬──────────────┘
     │                   └──────────────┘       │ n  TraceLink  n (any element/story/run ↔ any)
     │ n                                        │
     ├──────────────┐ n   0..1 ┌────────┐        │
     │ Story        │──────────│ Epic   │────────┤ addresses (TraceLink)
     │              │ belongs  │ EP-001 │        │
     │              │ to       └────────┘        │
     │              │───────────────────────────┘ implements (TraceLink)
     │ (US-001)     │◄────┐
     └──┬───────┬───┘     │ StoryDependency (blocking | related)
        │ 1     └─────────┘
        │ n
     ┌──┴─────────┐ 1   n ┌──────────────────┐
     │ Run        │───────│ RunEvent         │ (output, tool use, status change)
     │            │───────│ PermissionRequest│──── decided by ─── PermissionRule (optional)
     │            │ 1   1 │ RunResult        │
     │            │ 1   1 │ ExecutionSpace   │ (branch+worktree | snapshot)
     └──┬─────────┘       └──────────────────┘
        │ 1  n
     ┌──┴──────────┐
     │ ReviewDecision │ (approve | corrections | reject)
     └─────────────┘

  QueueEntry (Story waiting to start) · PendingDecision (derived view) · Recommendation (from agent)
  AppSetup (global) · PermissionRule (global | project) · PhaseStatus (derived) · QualityFinding · DecisionItem
  ChatThread 1──n Run(kind=chat) 1──n ChatChange
  (Release 2) Idea ──0..1 FeatureIntent 1──n ImpactItem · FeatureIntent ──introduces/changes── ArtifactElement
  (Release 2) FeatureIntent 1──n ChangeSet 1──n ChangeItem · FeatureIntent 1──n Epic · Story ──reworks── Story(Done) · Baseline (git tag) ──n FeatureIntent
```

---

## Project
**Description**: A software project managed by SpecForge, bound to one local workspace folder.
**Key Attributes**: id (UUID), name (string), workspacePath (path), vcsMode (`git` | `none`), baseBranch (string, git), createdAt, lastOpenedAt.
**Persistence**: DB (registry) + WS `.specforge/project.yaml` (id, name, conventions version).
**Business Rules**:
- A workspace path belongs to at most one registered project.
- vcsMode is re-detected on every open; switching to `none` forces concurrency limit 1 (D12).
- Removing a project never deletes workspace files.
**Relationships**: Has one ProjectSettings; has many Artifacts, Stories, Runs.

## ProjectSettings
**Description**: Project-level configuration.
**Key Attributes**: instructions (markdown), conventions (markdown), concurrencyLimit (int, default 3), maxRunDuration (duration), maxIdleTime (duration), worktreeRoot (path), branchPattern (string, default `specforge/{storyId}`), snapshotExclusions (glob[]), logRetentionDays (int), logLevel, agentOverrides (AgentConfig).
**Persistence**: instructions/conventions in WS (`.specforge/instructions.md`); remaining values in DB.
**Business Rules**:
- concurrencyLimit ≥ 1; effective limit = 1 if vcsMode = `none`.
- Secret environment values are referenced by key; values live in the OS credential store.
**Relationships**: Belongs to Project; has many PermissionRules.

## AgentRuntime
**Description**: An installed coding-agent runtime available to SpecForge (MVP: Claude Code).
**Key Attributes**: id, adapterType (`claude-code`), executablePath, detectedVersion, capabilities (models[], supportsResume, supportsPermissionRelay, supportsStructuredOutput), defaultConfig (AgentConfig), boundaryNotice (text).
**Persistence**: DB.
**Business Rules**:
- A runtime must be verified (executable runs, version ≥ minimum) before it can be used.
**Relationships**: Used by many Runs.

## AgentConfig (value object)
**Key Attributes**: model?, effort/params (map), allowedTools[], disallowedTools[], env (map of plain values or secret refs), extraArgs[] (validated allow-list).

## Artifact
**Description**: A specification document in the workspace.
**Key Attributes**: path (relative), kind (`intent` | `feature_intent` | `idea_inbox` | `requirements` | `design` | `adr` | `epic` | `story` | `test_concept` | `other`), approvalState (`draft` | `approved`), approvedAt?, generatedByRunId?, contentHash, parseState (`valid` | `invalid`), parseError?.
**Persistence**: WS (front-matter: `approval`, `approved_at`, `generated_by` — `approval` in all kinds; `status` only for story board state and feature-intent lifecycle) → DB index.
**Business Rules**:
- Any AI-made change sets approvalState to `draft` (FR-013).
- Only a User action sets `approved`.
- Invalid files keep their last valid indexed state.
**Relationships**: Has many ArtifactElements.

## ArtifactElement
**Description**: An identified element within an artifact: requirement, NFR, constraint, use case, component, ADR, test scenario.
**Key Attributes**: elementId (string, e.g. `FR-012`; unique per project), type, title, artifactPath, anchor, impactFlag (bool), impactSource?.
**Persistence**: WS → DB index.
**Business Rules**:
- elementId is stable; renumbering is not allowed (deprecate instead).
- impactFlag is set when an upstream linked element changes; cleared only by User.
**Relationships**: Belongs to Artifact; participates in many TraceLinks.

## Story
**Description**: An implementable work item with acceptance criteria; a card on the Kanban board.
**Key Attributes**: storyId (e.g. `US-007`), epicId?, featureId?, reworks (storyId[]), title, description, acceptanceCriteria[], size?, boardStatus (`backlog` | `ready` | `in_progress` | `review` | `done`), execSubState (`none` | `queued` | `blocked_conflict` | `preparing` | `running` | `awaiting_approval` | `failed` | `interrupted`; FR-021 In Progress sub-states, `awaiting_approval` displayed as "Awaiting permission"), approvalState, dependsOn (storyId[]), relatedTo (storyId[]), branch?, mergedAt?, rejectedBranches[], boardOrder (int), impactFlag.
**Persistence**: WS story file front-matter for storyId, title, status, approval, size, epic, feature, reworks, depends_on, related_to, requirement links, branch; DB for execSubState, boardOrder, rejectedBranches, mergedAt (derived, FR-115). Read only from the main workspace — run worktrees are never indexed (FR-116a).
**Business Rules**:
- Transitions per FR-021; `ready` requires approvalState = `approved` (artifact approval; there is no separate story approval).
- Only a User can set `ready`, `in_progress` (from ready), `done`, and the review outcomes; only the Scheduler sets `review` (run completed) and execSubState changes.
- In Progress sub-state exits (FR-021): Queued → Running (system); Queued / Blocked → Ready (user: remove from queue); Blocked → Queued (user: *Re-check* → `ConflictResolved`); Running / Awaiting → Review (system: completed) or → Failed (system); Failed / Interrupted → Running (user: Retry / Resume, via Scheduler); Failed / Interrupted / Running / Awaiting → Ready (user: Cancel / Discard). No system-initiated Review → In Progress.
- An agent writing `status` in a story file is rejected (FR-023).
- A story may start only if every `dependsOn` story is `done` (D11).
**Relationships**: Has many Runs; has many StoryDependencies (out/in); has many TraceLinks to ArtifactElements.

## Epic
**Description**: A group of user stories that together form a bigger feature (D21). Planning and tracking unit — never executed by agents.
**Key Attributes**: epicId (e.g. `EP-001`), title, goal, businessValue, requirements[] (element IDs), acceptanceCriteria[], scopeNotes, approvalState, laneOrder (int), colour, derivedStatus (`not_started` | `in_progress` | `ready_for_review` | `done` | `merged`), progress (doneCount/total, size-weighted), epicReview? ({decidedAt, outcome: confirmed | skipped, checklist[], aiCheckRunId?}).
**Persistence**: WS (epic file, front-matter: id, title, approval, requirements, epic review outcome + decidedAt) → DB index; laneOrder, colour, review checklist, aiCheckRunId in DB; derivedStatus computed.
**Business Rules**:
- A story belongs to at most one epic; stories without an epic are allowed.
- derivedStatus: not_started if no story beyond Ready; in_progress if any story In Progress/Review/Done and not all Done; ready_for_review if all Done and no review outcome; done after review confirmed or skipped; merged when done and all story branches merged (merge detection, FR-115). Adding a story to an epic whose review outcome is confirmed/skipped clears the stored epic review outcome and the epic returns to in_progress.
- Epic dependencies are derived: EP-B depends on EP-A iff ∃ blocking dependency from a story of EP-B to a story of EP-A.
- An epic is never moved on the board and has no runs of its own (except quality-check runs).
**Relationships**: Has many Stories; has many TraceLinks to requirement elements.

## FeatureIntent (Release 2)
**Description**: A delta intent describing a new feature or change for an existing project (D22), stored beside the main intent.
**Key Attributes**: featureId (`FI-xxx`), title, problem, goal, scopeIn[], scopeOut[], successCriteria[], constraints[], assumptions[], clarifiedDecisions[], relatedEpics[], relatedRequirements[], priority?, status (`draft` | `approved` | `in_delivery` | `done` | `withdrawn`), sourceIdeaId?, impactList (confirmed ImpactItems), baselineTag?.
**Persistence**: WS (`spec/01_intent/FI-xxx-<slug>.md`) → DB index; wizard draft state and impact list in DB.
**Business Rules**:
- `in_delivery` once any delta change or story linked to it exists; `done` when all stories linked to it (`feature: FI-xxx`) are Done; `withdrawn` only by the user and terminal.
- On withdraw: open ChangeSets are discarded; already-applied delta changes stay (the user may deprecate them manually); linked not-started stories are flagged for a user decision (keep / delete).
- Elements created/changed for the feature carry `feature: FI-xxx` and trace links `introduces` / `changes`.
- Delta changes never renumber or delete elements; removals are deprecations.
**Relationships**: Has many ImpactItems and ChangeSets; introduces/changes many ArtifactElements; has one or more Epics; may originate from an Idea.

## ChangeSet (Release 2)
**Description**: A delta proposal produced by one feature delta run for one phase (FR-107).
**Key Attributes**: changeSetId, featureId, phase (`requirements_delta` | `design_delta` | `stories`), runId, state (`open` | `applied` | `discarded`).
**Persistence**: DB; accepted items are applied to WS files.
**Business Rules**: Produced by diffing the run's scratch copy of the target folder against the current files (ADR-021); applying first runs the in-flight check; withdrawn feature → open change sets discarded.
**Relationships**: Belongs to FeatureIntent; has many ChangeItems; produced by one Run.

## ChangeItem (Release 2)
**Key Attributes**: changeItemId, changeSetId, path, elementId, kind (`new` | `modified` | `deprecated`), patch, state (`open` | `accepted` | `discarded`).
**Business Rules**: Applied with optimistic concurrency on the target file; a stale item must be regenerated; IDs never renumbered.

## ImpactItem (Release 2)
**Key Attributes**: featureId, category (`requirement_change` | `requirement_deprecate` | `requirement_add` | `design` | `adr` | `epic_extend` | `epic_new` | `story_adjust` | `story_in_flight` | `story_rework` | `code_area`), targetRef, reason, confidence, origin (`trace` | `agent` | `user`), confirmed (bool).

## InFlightDecision (Release 2)
**Key Attributes**: storyId, featureId, changeSetId, decision (`continue` | `cancel` | `apply_in_corrections`), pendingFeedback?, decidedAt.
**Business Rules**: `apply_in_corrections` for a story in Review pre-fills the correction feedback (user confirms); for a running story the feedback is stored as pendingFeedback and pre-filled into *Request corrections* when the story reaches Review. The user always triggers the correction.

## Idea (Release 2)
**Key Attributes**: ideaId, text, note?, source (`dashboard` | `chat` | `shortcut`), createdAt, state (`open` | `turned_into_feature` | `merged` | `dismissed`), featureId?, dismissReason?.
**Persistence**: WS (`spec/01_intent/ideas.md`, one entry per idea with ID) → DB index.

## Baseline (Release 2)
**Key Attributes**: tag, commit, createdAt, featureIds[], epicIds[], notes.
**Persistence**: Git annotated tag (source of truth) → DB index.

## StoryDependency
**Description**: Directed relationship between two stories.
**Key Attributes**: fromStoryId (dependent), toStoryId (predecessor), type (`blocking` | `related`), rationale?, origin (`user` | `agent_proposed`), approved (bool).
**Persistence**: WS (front-matter of the dependent story) → DB index.
**Business Rules**:
- No self-dependencies; the graph of `blocking` edges must be acyclic.
- `related` is symmetric for display, stored once.
- Agent-proposed dependencies are Draft until the story is approved.
**Relationships**: Connects two Stories.

## TraceLink
**Description**: A navigable relationship used for traceability and impact analysis.
**Key Attributes**: sourceRef, targetRef (element, story, run, or file), linkType (`derives_from` | `implements` | `addresses` | `decided_by` | `verifies` | `changed_file`), origin (`ws` | `run`).
**Persistence**: WS-declared links (IDs referenced in artifacts) → DB index; run-derived links (story ↔ changed file) in DB.
**Business Rules**:
- Links referencing unknown IDs are reported as validation issues.

## Run
**Description**: One execution of an agent — either a specification run or an implementation run (including correction rounds).
**Key Attributes**: runId (UUID), projectId, storyId? (implementation), chatThreadId? (chat), featureId? (feature runs), kind (`clarify` | `generate` | `refine` | `quality_check` | `feature_review` | `impact` | `decision_options` | `analyze` | `chat` | `connection_test` | `implement` | `correct`), parentRunId? (for correction rounds/resume), runtimeId, configSnapshot (AgentConfig), agentSessionId?, status (`preparing` | `running` | `awaiting_approval` | `completed` | `completed_no_result` | `failed` | `cancelled` | `interrupted`), failureReason?, startTrigger (`user_move` | `queue:<event>` | `retry` | `resume` | `correction`), authorisedBy, authorisedAt, startedAt, endedAt, pid?, contextDigest (assembled prompt, stored).
**Persistence**: DB (continuously written).
**Business Rules**:
- At most `effectiveConcurrencyLimit` implementation, correction, retry and resume runs per project in status `preparing | running | awaiting_approval`; all of them are started via the Scheduler (corrections/resumes first, then FIFO). Failed, interrupted and cancelled runs free their slot (FR-027).
- Spec, chat, quality_check, impact, feature_review, analyze, decision_options and connection_test runs do not count towards the limit (they are user-attended), but are subject to permission relay.
- Waiting to start is modelled by QueueEntry, not by a run status.
- Time in `awaiting_approval` pauses both the idle and the max-duration timeout (FR-042).
- Status transitions are monotonic towards a terminal state; terminal states: completed*, failed, cancelled, interrupted.
- On startup, non-terminal runs become `interrupted`.
**Relationships**: Belongs to Project (and Story); has many RunEvents and PermissionRequests; has one RunResult; has one ExecutionSpace; has many ReviewDecisions.

## ExecutionSpace
**Description**: Where a run executes.
**Key Attributes**: mode (`worktree` | `in_place`), branch?, worktreePath?, baseRef (commit SHA), stackedOn (branch[]), integrationRef? (temporary merge commit), snapshotId? (non-git), cleanedUp (bool).
**Persistence**: DB; snapshots in app data dir.
**Business Rules**:
- Each concurrent implementation run has its own worktree.
- A correction round reuses the parent run's ExecutionSpace.

## RunEvent
**Description**: An item of the run's stream.
**Key Attributes**: runId, seq (int), ts, type (`output` | `tool_use` | `tool_result` | `status` | `system` | `error`), payload (redacted JSON/text).
**Persistence**: DB (append-only).
**Business Rules**: Secret values are redacted before persistence (NFR-006).

## PermissionRequest
**Description**: A request from an agent to perform an action needing approval.
**Key Attributes**: requestId, runId, toolName, input (JSON, redacted), cwd, outsideWorkspace (bool), requestedAt, decision (`allow` | `deny` | null), decidedBy (`user` | `rule:<id>` | `default_deny`), decidedAt, message?.
**Persistence**: DB (immutable after decision; NFR-012).
**Business Rules**:
- Undecided requests block only their run.
- outsideWorkspace requests can never be decided by a rule.
- No prompt timeout; dismissal or shutdown → deny (`default_deny`).

## PermissionRule
**Description**: Auto-decision rule, either global default (set in setup, inherited by all projects) or project-specific.
**Key Attributes**: ruleId, scope (`global` | `project`), projectId? (project scope), effect (`allow` | `deny`), toolName, pattern (e.g. command prefix `npm test`, path glob), appliesTo (`implementation` | `chat` | `spec` | `all`), createdFrom (`setup` | `settings` | `prompt` | `suggestion`), disabledInProject (bool, for global rules overridden per project), createdAt.
**Persistence**: DB.
**Business Rules**: effective rules = global rules (minus those disabled in the project) + project rules; deny rules win over allow rules; default with no match = relay to user; outside-workspace actions are never rule-decided.

## AppSetup
**Description**: Global installation state and defaults.
**Key Attributes**: setupState (`not_started` | `incomplete` | `complete`), completedSteps[], runtimeOk, providerOk, gitDetected, defaults (concurrency, timeouts, notifications, logRetention), lastHealthCheckAt.
**Persistence**: DB (app scope).
**Business Rules**: `mode = full` only if runtimeOk ∧ providerOk; otherwise `limited` (AI functions disabled). Health check re-evaluates on start and on demand.

## PhaseStatus (derived)
**Description**: Status of a guided phase (intent, requirements, design, stories, kanban) for a project.
**Key Attributes**: phase, state (`not_started` | `in_progress` | `awaiting_approval` | `approved` | `impacted`), artifacts[], recommended (bool).
**Business Rules**: Exists at project level (initial delivery; switches to *maintenance* when all initial epics are Done) and per FeatureIntent (phases: feature_intent, impact, requirements_delta, design_delta, epic_stories, kanban, epic_review). Derived from artifact approval states and impact flags: no artifacts → not_started; any Draft → awaiting_approval (in_progress while a generation run is active); all Approved → approved; any impact flag → impacted. `kanban` is available when ≥ 1 story exists. Current phase = first phase not approved (soft gate — any phase may be opened).

## QualityFinding
**Description**: A finding from an AI quality check on an artifact.
**Key Attributes**: findingId, runId, artifactPath, elementId?, severity (`critical` | `major` | `minor` | `info`), category (e.g. ambiguity, testability, coverage, consistency, INVEST), explanation, suggestedFix?, state (`open` | `applied` | `dismissed`), dismissReason?.
**Persistence**: DB.

## DecisionItem
**Description**: An open item for decision review: open question, assumption, proposed ADR, or agent recommendation.
**Key Attributes**: itemId, source (artifact path + anchor, or recommendationId), type (`question` | `assumption` | `adr` | `recommendation`), context, options[] ({label, description, recommended}), state (`open` | `decided` | `deferred`), decision?, decidedAt?.
**Persistence**: DB (collected from artifacts; decisions written back to artifacts on acceptance).

## ChatThread
**Description**: A resumable conversation with the project agent.
**Key Attributes**: threadId, projectId, title, createdAt, lastUsedAt, agentSessionId, messages (ordered), archived (bool).
**Persistence**: DB; each user message starts a `chat` Run (resuming the session); message ↔ run linkage.
**Business Rules**: chat runs never change story status or start implementation runs; in Release 1 the chat is read-only (all write requests denied by policy with explanation, FR-089); from Release 2 (FR-091) writes follow PermissionPolicy with `appliesTo ∈ {chat, all}`; in non-git mode writes are denied while an implementation run is active (FR-116b).

## ChatChange (Release 2)
**Description**: A file change produced by a chat message.
**Key Attributes**: changeId, runId, threadId, path, changeType (A/M/D), beforeRef (git blob or snapshot blob), afterHash, revertedAt?.
**Persistence**: DB (+ blob store for non-git before-content).
**Business Rules**: revert restores `beforeRef`; spec paths set artifact Draft and trigger impact analysis.

## UsageRecord (value object on Run, Release 2)
**Key Attributes**: inputTokens?, outputTokens?, cacheTokens?, costUsd?, reportedBy (runtime), phase (derived from run kind/story).

## RunResult
**Description**: Structured outcome reported by the agent and validated by SpecForge.
**Key Attributes**: outcome (`success` | `partial` | `failure`), summary, testsRun, testsPassed, testsFailed, coverage?, changedFiles[] (as reported), openIssues[], recommendations[] (e.g. dependency suggestions), computedChangedFiles[] (from git/snapshot diff — authoritative), costUsage? (if adapter reports).
**Persistence**: DB.

## ReviewDecision
**Description**: The human outcome of a review.
**Key Attributes**: runId, storyId, decision (`approve` | `request_corrections` | `reject`), feedback?, decidedAt.
**Persistence**: DB; approve/reject also reflected in story front-matter (status).

## QueueEntry
**Description**: A story authorised for execution but not yet started.
**Key Attributes**: storyId, queuedAt (= human authorisation time), startKind (`implement` | `correct` | `retry` | `resume`), reason (`dependency` | `slot` | `workspace` | `conflict`), waitingFor (storyId[]), priority (`normal` | `correction`).
**Persistence**: DB.
**Business Rules**: FIFO by queuedAt within priority; `correction` (corrections, resumes) before `normal`. `workspace` = non-git mode while a write-capable chat or specification run is active (FR-116b); `conflict` = *Blocked (conflict)*, left only by the user's *Re-check* (`ConflictResolved`) or removal from the queue.

## Recommendation
**Description**: A suggestion produced by an agent (dependency, status transition, follow-up).
**Key Attributes**: id, runId, type (`add_dependency` | `ready_suggestion` | `other`), payload, state (`open` | `accepted` | `dismissed`).
**Business Rules**: Never applied automatically.

## PendingDecision (derived)
**Description**: Read model aggregating everything awaiting the user: open PermissionRequests, stories in Review, failed/interrupted runs, blocked queue entries, open Recommendations, impact flags, unapproved generated artifacts, open critical/major QualityFindings, open DecisionItems, approved-but-unmerged branches (from merge detection, FR-115).

## NextStep (derived)
**Description**: The single recommended next action shown on the dashboard.
**Key Attributes**: code, label, target (screen/action), reason.
**Business Rules**: evaluated by fixed priority: (1) setup incomplete; (2) pending permission requests; (3) failed/interrupted runs; (4) stories in Review; (5) blocked queue (conflict); (5b) epics ready for epic review; (5c) in-flight decisions pending; (6) current phase action (incl. "Approve epic structure" before story generation) — in maintenance mode: the most advanced active feature's next phase action ("Answer questions for FI-002", "Review impact of FI-001", "Approve delta requirements for FI-001") (write intent → quality check → approve → generate next phase …); (7) open decision items; (8) Ready stories with free slots → "Start stories / wave"; (9) approved unmerged branches → "Merge n approved branches" (count from merge detection, FR-115); (10) all Done → "Plan next increment".
