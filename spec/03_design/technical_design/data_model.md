# SpecForge — Data Model

**Last updated:** 2026-10-14

SpecForge has two persistence layers (D2, ADR-004):

1. **Workspace files** (source of truth for specifications, story status and dependencies) — Markdown with YAML front-matter under `spec/` and `.specforge/` in the project workspace.
2. **Local database** (SQLite, one file per user in the OS app-data directory, ADR-005) — project registry, index of workspace artifacts (rebuildable), runs, events, permissions, queue, settings.

---

## 1. Workspace file formats

### 1.1 Folder layout

```
<workspace>/
├── .specforge/
│   ├── project.yaml          # id, name, schemaVersion
│   └── instructions.md       # project instructions & conventions (FR-050)
└── spec/
    ├── 01_intent/intent.md            # main intent
    ├── 01_intent/FI-xxx-<slug>.md     # feature intents (beside the main intent)
    ├── 01_intent/ideas.md             # idea inbox
    ├── 02_requirements/*.md   # FR-xxx, NFR-xxx, CON-xxx elements
    ├── 03_design/**/*.md      # UC-xxx, ADR-xxx, components
    ├── 04_user_stories/US-xxx-<slug>.md
    ├── 04_user_stories/epics/EP-xxx-<slug>.md
    └── 05_test_concepts/*.md  # TC-xxx
```

### 1.2 Common front-matter (all artifacts)

```yaml
---
specforge: 1                 # schema version
kind: requirements           # intent | feature_intent | idea_inbox | requirements | design | adr | epic | story | test_concept
approval: draft              # draft | approved   (approval state, same key in all artifact kinds)
approved_at: 2026-10-13T10:12:00Z   # optional
generated_by: run_8f3c…      # optional, last run that changed the file
---
```

`approval` is the only approval key in every artifact kind. `status` is used only for the story board state (1.3) and the feature-intent lifecycle (1.5).

**Element IDs** are recognised in headings: `### FR-012: Title`, `## UC-004: Title`, `### ADR-003: Title`. References to other IDs anywhere in the body (`FR-012`, `US-007`) become TraceLinks (`derives_from` / `addresses` depending on artifact kinds).

### 1.3 Story file

```yaml
---
specforge: 1
kind: story
id: US-005
title: Session handling for logged-in users
approval: approved          # draft | approved
status: ready               # backlog | ready | in_progress | review | done
size: M
epic: EP-001                # optional, at most one epic
requirements: [FR-003, FR-007]
design: [UC-004, ADR-002]
depends_on:                 # blocking
  - id: US-002
    rationale: Needs the user entity and login endpoint
related_to:                 # non-blocking; plain IDs ([US-006]) are accepted, agent proposals carry a rationale
  - id: US-006
    rationale: Shares the session timeout setting
branch: specforge/US-005    # set by SpecForge when a run starts (git mode)
---
## Description
As a … I want … so that …
## Acceptance criteria
- [ ] AC-1 …
```

Rules:
- `status` and `approval` are written only by SpecForge on human actions or system transitions. An externally made change to `status` is accepted only if it is a legal *human* transition (user editing the file manually) (FR-023).
- Story status, approval, epic and dependencies are read **only from the main workspace** (FR-116a): run worktrees are never indexed, implementation runs cannot write `spec/**` or `.specforge/**` (built-in deny, ADR-013), and "Commit spec changes" (FR-072) commits on the current branch of the main workspace.
- Execution sub-states (queued, running, failed …) are **not** written to files — they are DB-only and volatile per machine.

### 1.4 Epic file

```yaml
---
specforge: 1
kind: epic
id: EP-001
title: User authentication
approval: approved
requirements: [FR-001, FR-002, FR-003]
epic_review:                # written when the epic review is completed
  outcome: confirmed        # confirmed | skipped
  decided_at: 2026-11-02T14:00:00Z
---
## Goal
## Business value
## Epic acceptance criteria
- [ ] EAC-1 A user can register, log in, log out and reset the password end-to-end
## Scope notes
```
Derived epic status is **not** stored in the file (computed from stories, FR-095); only the epic review outcome is. Adding a story to an epic whose review outcome is `confirmed` / `skipped` removes the stored `epic_review` block, so the epic returns to *In progress*. Epics created for a feature carry `feature: FI-xxx` (Release 2).

### 1.5 Feature intent file (Release 2)

```yaml
---
specforge: 1
kind: feature_intent
id: FI-003
title: Task comments
approval: approved
status: in_delivery         # draft | approved | in_delivery | done | withdrawn (lifecycle, SpecForge-managed; withdrawn is terminal)
priority: should
related_epics: [EP-002]
related_requirements: [FR-034]
source_idea: IDEA-007
baseline: spec-v1.3         # set when baseline created
---
## Problem
## Goal
## Scope
### In scope
### Out of scope
## Success criteria
## Constraints
## Assumptions
## Clarified decisions
| # | Question | Decision |
```

Elements introduced or changed by a feature carry the feature ID: requirement/design headings get a metadata line `**Feature**: FI-003` (new) or a changelog entry `Changed by FI-003` (modified); story front-matter gets `feature: FI-003` and, for rework stories, `reworks: [US-008]`. A feature intent is *done* when all stories linked to it (`feature: FI-xxx`) are Done (FR-104). On *withdraw*, open change sets are discarded, already-applied delta changes stay (the user may deprecate them manually), and linked not-started stories are flagged for a keep/delete decision.

### 1.6 Idea inbox file (`spec/01_intent/ideas.md`, Release 2)

```markdown
## IDEA-007: Export board as PDF
- created: 2026-10-20 · source: chat · state: turned_into_feature → FI-004
Optional note text.
```

---

## 2. Database schema (SQLite)

Conventions: `TEXT` UUIDs, timestamps as ISO-8601 `TEXT` (UTC), JSON columns as `TEXT` with `json_valid` check. WAL mode, `foreign_keys=ON`. Migrations versioned (`schema_migrations`).

### 2.1 Registry and configuration

**project**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | = `.specforge/project.yaml` id |
| name | TEXT NOT NULL | |
| workspace_path | TEXT NOT NULL UNIQUE | normalised absolute path |
| vcs_mode | TEXT NOT NULL | `git` / `none` (last detected) |
| base_branch | TEXT | |
| created_at, last_opened_at | TEXT | |

**project_settings**
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT PK FK→project | |
| concurrency_limit | INTEGER NOT NULL DEFAULT 3 | effective = 1 when vcs_mode = none |
| max_run_duration_s | INTEGER DEFAULT 3600 | |
| max_idle_s | INTEGER DEFAULT 600 | |
| worktree_root | TEXT | default `<appdata>/wt/<projectShortId>`; worktree path `<root>/<storyId>` (ADR-010) |
| branch_pattern | TEXT DEFAULT 'specforge/{storyId}' | |
| snapshot_exclusions | TEXT (JSON array) | defaults: `node_modules/**`, `.venv/**`, build dirs |
| log_retention_days | INTEGER DEFAULT 30 | |
| merge_check_interval_s | INTEGER DEFAULT 60 | periodic merge detection (FR-115) |
| log_level | TEXT DEFAULT 'info' | |
| agent_overrides | TEXT (JSON AgentConfig) | |
| runtime_id | TEXT FK→agent_runtime | |

**agent_runtime**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| adapter_type | TEXT NOT NULL | `claude-code` (MVP), `mock` (tests) |
| executable_path | TEXT NOT NULL | |
| detected_version | TEXT | |
| capabilities | TEXT (JSON) | |
| default_config | TEXT (JSON AgentConfig) | runtime-specific config (secret env values as `{ "secretRef": "<key>" }`); the user-facing global agent defaults live in `app_setup.agent_defaults` |
| verified_at | TEXT | |

**permission_rule**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| scope | TEXT NOT NULL | `global` / `project` (ADR-019) |
| project_id | TEXT FK→project NULL | NULL for global rules |
| effect | TEXT | `allow` / `deny` |
| tool_name | TEXT | e.g. `Bash`, `Edit`, `*` |
| pattern | TEXT | command prefix or path glob |
| applies_to | TEXT DEFAULT 'all' | `implementation` / `chat` / `spec` / `all` (bucket per run kind, see below) |
| created_from | TEXT | `setup` / `settings` / `prompt` / `suggestion` |
| created_at | TEXT | |
Index: `(scope, project_id, tool_name)` — rule lookup on every permission request.

Run kind → `applies_to` bucket (ADR-013):

| Run kind | Bucket |
|---|---|
| implement, correct | `implementation` |
| chat | `chat` |
| clarify, generate, refine, quality_check, decision_options, analyze, feature_review, impact | `spec` |
| connection_test | none — no tools needed; no rules applied, all writes denied |

**project_rule_override** — global rules disabled per project
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT FK | PK (project_id, rule_id) |
| rule_id | TEXT FK→permission_rule | |

**app_setup** (single row)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK CHECK (id = 1) | |
| setup_state | TEXT | not_started / incomplete / complete |
| completed_steps | TEXT (JSON) | |
| runtime_ok, provider_ok, git_detected | INTEGER | last health check |
| provider_kind | TEXT | `anthropic_api_key` / `bedrock` / `vertex` / `foundry` (secrets in keychain) |
| provider_config | TEXT (JSON) | provider environment for the agent (`{env: [{name, value} \| {name, secretRef}]}`); secret values only as keychain references |
| agent_defaults | TEXT (JSON AgentConfig) | global agent defaults (model, effort, max turns, env with secret refs); kept here rather than on `agent_runtime` so they can be set before a runtime is detected (2026-10-15, US-015) |
| exec_defaults | TEXT (JSON) | max run duration, idle timeout, notifications, log retention, log level |
| last_health_check_at | TEXT | |

### 2.2 Workspace index (rebuildable from files)

**artifact**
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT FK | |
| path | TEXT | relative path; PK (project_id, path) |
| kind | TEXT | front-matter `kind` (see 1.2) |
| approval_state | TEXT | front-matter `approval` |
| content_hash | TEXT | change detection |
| parse_state | TEXT | `valid` / `invalid` |
| parse_error | TEXT | |
| generated_by_run | TEXT FK→run NULL | |
| indexed_at | TEXT | |

**element**
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT | PK (project_id, element_id) |
| element_id | TEXT | `FR-012`, `UC-004`, `US-005` … |
| type | TEXT | `fr`, `nfr`, `con`, `uc`, `adr`, `story`, `tc`, … |
| title | TEXT | |
| artifact_path | TEXT | FK→artifact |
| anchor | TEXT | heading anchor |
| impact_flag | INTEGER (bool) | |
| impact_source | TEXT | element id that changed |
Index: `(project_id, artifact_path)` — re-index per file.

**trace_link**
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| project_id | TEXT | |
| artifact_path | TEXT | artifact the link was parsed from (replaced per artifact on reindex; US-020) |
| source_ref | TEXT | element id / `run:<id>` / `file:<path>` |
| target_ref | TEXT | |
| link_type | TEXT | |
| origin | TEXT | `ws` / `run` |
Indexes: `(project_id, source_ref)`, `(project_id, target_ref)` — bidirectional navigation and impact traversal.

**story** (extends element; one row per story)
| Column | Type | Notes |
|---|---|---|
| project_id, story_id | TEXT | PK; FK→element |
| epic_id | TEXT NULL | from file; FK→epic |
| feature_id | TEXT NULL | from file (`feature:`, Release 2) |
| reworks | TEXT (JSON array) | from file (`reworks:`, Release 2) |
| size | TEXT NULL | from file (`size:`) |
| board_status | TEXT | from file |
| approval_state | TEXT | from file |
| title | TEXT | from file |
| branch | TEXT | from file |
Indexes: `(project_id, board_status)`, `(project_id, epic_id, board_status)` — board rendering and lanes.

**story_state** (DB-only, **not** part of the rebuildable index — survives "Rebuild index"; US-007)
| Column | Type | Notes |
|---|---|---|
| project_id, story_id | TEXT | PK |
| exec_substate | TEXT | FR-021: none/queued/blocked_conflict/preparing/running/awaiting_permission/failed/interrupted |
| board_order | REAL | fractional ordering |
| rejected_branches | TEXT (JSON array) | branches marked rejected |
| merged_at | TEXT NULL | detected via `git merge-base --is-ancestor` (FR-115) |
| authorised_at | TEXT NULL | last human move to In Progress |
| correction_feedback | TEXT NULL | review feedback of requested corrections (US-059); cleared when the correction run ends |
| correction_fresh | INTEGER (bool) NULL | the correction starts a fresh agent session on the same branch (session not resumable, FR-045) |

**epic** (extends element)
| Column | Type | Notes |
|---|---|---|
| project_id, epic_id | TEXT | PK; FK→element |
| title | TEXT | from file |
| approval_state | TEXT | from file |
| review_outcome | TEXT NULL | from file (`confirmed` / `skipped`) |
| review_decided_at | TEXT NULL | |
| feature_id | TEXT NULL | from file (Release 2) |

**epic_layout** (DB-only, survives "Rebuild index"): `project_id, epic_id` (PK), `lane_order REAL`, `colour TEXT` (auto-assigned). The epic review checklist and AI-check run are stored with the review decision (DB-only) when the epic review is implemented.

View `v_epic_status` computes derived status and progress from `story` (counts per board_status, size-weighted, merged flags). Index on `story(project_id, epic_id, board_status)` — lane rendering and epic progress.

**story_dependency**
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT | |
| from_story | TEXT | dependent |
| to_story | TEXT | predecessor |
| type | TEXT | `blocking` / `related` |
| rationale | TEXT | |
| origin | TEXT | `user` / `agent_proposed` |
| approved | INTEGER (bool) | derived: dependent story approved (agent-proposed edges are Draft until then) |
PK `(project_id, from_story, to_story, type)`; Index `(project_id, to_story)` — find dependents when a story becomes Done.

### 2.3 Execution

**run**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT FK | |
| story_id | TEXT NULL | NULL for specification runs |
| kind | TEXT | clarify/generate/refine/quality_check/feature_review/impact/decision_options/analyze/chat/connection_test/implement/correct (identical to domain Run.kind) |
| start_kind | TEXT NULL | implement / correct / retry / resume for scheduler-launched runs |
| created_at | TEXT | row creation (queue → run); `started_at` is set when the agent starts |
| feature_id | TEXT NULL | feature runs (Release 2) |
| chat_thread_id | TEXT FK→chat_thread NULL | chat runs |
| parent_run_id | TEXT FK→run NULL | correction/resume chain |
| runtime_id | TEXT FK | |
| config_snapshot | TEXT (JSON) | effective AgentConfig (secrets as refs) |
| agent_session_id | TEXT | for resume (D5) |
| status | TEXT | preparing/running/awaiting_approval/completed/completed_no_result/failed/cancelled/interrupted (waiting is a `queue_entry`, not a run status) |
| failure_reason | TEXT | |
| start_trigger | TEXT | |
| authorised_by, authorised_at | TEXT | |
| started_at, ended_at | TEXT | |
| pid | INTEGER | process registry for orphan cleanup |
| context_digest | TEXT | assembled prompt/context (FR-037) |
| last_event_seq | INTEGER | |
Indexes: `(project_id, status)` — slot counting and startup recovery; `(project_id, story_id, started_at)` — story history.

**execution_space**
| Column | Type | Notes |
|---|---|---|
| run_id | TEXT PK FK→run | correction runs reference parent's space via `shared_with_run` |
| mode | TEXT | `worktree` / `in_place` |
| branch | TEXT | |
| worktree_path | TEXT | |
| base_ref | TEXT | commit SHA the branch was created from |
| stacked_on | TEXT (JSON array) | predecessor branches |
| integration_ref | TEXT | temp merge commit (multi-predecessor) |
| snapshot_id | TEXT | non-git |
| shared_with_run | TEXT NULL | |
| cleaned_up | INTEGER | |

**run_event** (append-only, high volume)
| Column | Type | Notes |
|---|---|---|
| run_id | TEXT | PK (run_id, seq) |
| seq | INTEGER | |
| ts | TEXT | |
| type | TEXT | |
| payload | TEXT | redacted |
Indexed by PK; full-text search via FTS5 virtual table `run_event_fts(payload)` (NFR-005). Large raw output (> 64 KB per event) stored in a sidecar log file under `<appdata>/logs/<run_id>/` with a pointer.

**permission_request**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| run_id | TEXT FK | |
| tool_name | TEXT | |
| input | TEXT (JSON, redacted) | |
| cwd | TEXT | |
| outside_workspace | INTEGER | |
| requested_at | TEXT | |
| decision | TEXT NULL | |
| decided_by | TEXT | `user` / `rule:<id>` / `built_in` (built-in deny, ADR-013) / `default_deny` |
| decided_at | TEXT | |
| message | TEXT | |
Index: `(decision) WHERE decision IS NULL` (partial) — pending prompts; `(run_id)`. Rows are immutable after decision (enforced by trigger).

**run_result**
| Column | Type | Notes |
|---|---|---|
| run_id | TEXT PK FK | |
| outcome | TEXT | |
| summary | TEXT | |
| tests_run, tests_passed, tests_failed | INTEGER | |
| coverage | REAL | |
| reported_files | TEXT (JSON) | |
| computed_files | TEXT (JSON) | `[{path, change: A/M/D, additions, deletions}]` |
| open_issues | TEXT (JSON) | |
| usage | TEXT (JSON) | cost/tokens if reported |
| raw_result | TEXT | original structured payload |

**review_decision**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| run_id | TEXT FK | |
| story_id | TEXT | |
| decision | TEXT | approve / request_corrections / reject |
| feedback | TEXT | |
| decided_at | TEXT | |

**queue_entry**
| Column | Type | Notes |
|---|---|---|
| project_id, story_id | TEXT | PK |
| queued_at | TEXT | |
| priority | INTEGER | 0 = correction / resume, 1 = normal (incl. retry) |
| start_kind | TEXT | implement / correct / retry / resume — all launched via the Scheduler (FR-027) |
| parent_run_id | TEXT NULL | run being corrected / retried / resumed |
| reason | TEXT | dependency / slot / workspace / conflict (`conflict` = *Blocked (conflict)*; `workspace` = non-git mode with a write-capable chat/spec run active, FR-116b) |
| waiting_for | TEXT (JSON array) | |
Index: `(project_id, priority, queued_at)` — scheduler FIFO.

**recommendation**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| run_id | TEXT FK | |
| type | TEXT | |
| payload | TEXT (JSON) | |
| state | TEXT | open / accepted / dismissed |

**file_touch** (overlap detection, FR-070)
| Column | Type | Notes |
|---|---|---|
| project_id | TEXT | |
| story_id | TEXT | |
| run_id | TEXT | |
| path | TEXT | |
PK `(project_id, path, story_id)`; rows removed when the story's branch is merged or rejected. Index `(project_id, path)` — overlap query.

**snapshot** (non-git, FR-039)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| created_at | TEXT | |
| manifest | TEXT (JSON) | path → content hash, size, mtime |
Blobs are stored content-addressed under `<appdata>/snapshots/<project_id>/objects/<hash>` (deduplicated across snapshots).

### 2.4 Workflow, dashboard and chat

**quality_finding**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| run_id | TEXT FK→run | |
| artifact_path | TEXT | |
| element_id | TEXT NULL | |
| severity | TEXT | critical / major / minor / info |
| category | TEXT | |
| explanation | TEXT | |
| suggested_fix | TEXT | |
| state | TEXT | open / applied / dismissed |
| dismiss_reason | TEXT | |
Index: `(project_id, artifact_path, state)` — badges and pending decisions.

**decision_item**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| type | TEXT | question / assumption / adr / recommendation |
| source_ref | TEXT | artifact path#anchor or recommendation id |
| context | TEXT | |
| options | TEXT (JSON) | `[{label, description, recommended}]` |
| state | TEXT | open / decided / deferred |
| decision | TEXT (JSON) | |
| decided_at | TEXT | |
Index: `(project_id, state)`.

**chat_thread**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT FK | |
| title | TEXT | |
| agent_session_id | TEXT | |
| created_at, last_used_at | TEXT | |
| archived | INTEGER | |
Index: `(project_id, last_used_at DESC)`.

**chat_message**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| thread_id | TEXT FK | |
| seq | INTEGER | |
| role | TEXT | user / agent |
| text | TEXT | redacted |
| run_id | TEXT FK→run NULL | agent messages reference their run (events, permissions, usage) |
| tool_uses | TEXT (JSON) | tool calls of the agent turn, shown collapsed (US-062) |
| recommendations | TEXT (JSON) | proposed story transitions / run starts, shown as recommendation cards only (US-062) |
| error | INTEGER | the agent could not answer (message holds the reason) |
| created_at | TEXT | |

**chat_change**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| run_id | TEXT FK | |
| thread_id | TEXT | |
| path | TEXT | |
| change_type | TEXT | A / M / D |
| before_ref | TEXT | git blob SHA or snapshot object hash |
| after_hash | TEXT | |
| is_spec | INTEGER | |
| reverted_at | TEXT NULL | |

**activity** (append-only feed for the dashboard)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| project_id | TEXT | |
| ts | TEXT | |
| type | TEXT | generated / approved / run_started / run_finished / reviewed / chat_change / … |
| ref | TEXT | element/story/run id |
| summary | TEXT | |
Index: `(project_id, ts DESC)`.

Usage (FR-090) is stored in `run_result.usage` (JSON: input/output/cache tokens, cost_usd, reported_by); view `v_usage_by_phase` maps run kind / story to phase.

### 2.5 Feature evolution (Release 2)

**feature_intent** (extends element)
| Column | Type | Notes |
|---|---|---|
| project_id, feature_id | TEXT | PK; FK→element |
| title | TEXT | |
| approval_state | TEXT | from file |
| status | TEXT | lifecycle (from file, SpecForge-managed) |
| wizard_state | TEXT (JSON) | resumable wizard draft (step, draft text, open questions, session id) |
| source_idea | TEXT NULL | |
| baseline_tag | TEXT NULL | |

**impact_item**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id, feature_id | TEXT | |
| category | TEXT | requirement_change / … / code_area |
| target_ref | TEXT | element id, story id or path |
| reason | TEXT | |
| confidence | REAL | |
| origin | TEXT | trace / agent / user |
| confirmed | INTEGER | |
Index `(project_id, feature_id)`.

**change_set** / **change_item** — delta proposals per feature phase (produced as described in ADR-021)
| Column | Type | Notes |
|---|---|---|
| change_set.id | TEXT PK | |
| change_set.feature_id, phase, run_id, state | | phase: requirements_delta / design_delta / stories; state: open / applied / discarded |
| change_item.id, change_set_id, path, element_id, kind (new/modified/deprecated), patch, state (open/accepted/discarded) | | |

**in_flight_decision**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| story_id, feature_id, change_set_id | TEXT | |
| decision | TEXT | continue / cancel / apply_in_corrections |
| pending_feedback | TEXT NULL | apply_in_corrections for a running story: stored and pre-filled into "Request corrections" when the story reaches Review (FR-110); cleared when used |
| decided_at | TEXT | |

**idea** (index of `ideas.md`)
| Column | Type | Notes |
|---|---|---|
| project_id, idea_id | TEXT | PK |
| text, note, source, created_at, state, feature_id, dismiss_reason | | |

**baseline** (index of Git tags created by SpecForge)
| Column | Type | Notes |
|---|---|---|
| project_id, tag | TEXT | PK |
| commit_sha, created_at | TEXT | |
| feature_ids, epic_ids | TEXT (JSON) | |
| notes | TEXT | |

Feature columns on `story` (`feature_id`, `reworks`), `epic` (`feature_id`) and `run` (`feature_id`) are listed in their tables above; trace link types add `introduces`, `changes`, `reworks`.

**artifact_revision** (non-git versioning, FR-015, Release 2)
| Column | Type | Notes |
|---|---|---|
| project_id, path, rev | | PK |
| content_hash | TEXT | blob in snapshot object store |
| created_at, run_id | | |

---

## 3. ERD

```
project 1──1 project_settings ──n permission_rule
   │  └─n agent_runtime (via runtime_id)
   │
   ├─n artifact 1──n element ──n trace_link n── element/run/file
   │                   │
   │                   ├─1 epic 1──n story (epic_id)
   │                   └─1 story ──n story_dependency n── story
   │                         │  └─0..1 queue_entry
   │                         │
   ├─n run ──────────────────┘ (story_id)
        │ 1──1 execution_space ──0..1 snapshot
        │ 1──n run_event
        │ 1──n permission_request ──0..1 permission_rule (decided_by)
        │ 1──1 run_result
        │ 1──n review_decision
        │ 1──n recommendation
        │ 1──n file_touch
        │ 1──n quality_finding
        │ 1──n chat_change
        └─0..1 parent run

project 1──n chat_thread 1──n chat_message ──0..1 run
project 1──n decision_item · project 1──n activity
(Release 2) feature_intent 1──n change_set 1──n change_item · feature_intent 1──n impact_item · in_flight_decision n──1 story
app_setup (1 row) · permission_rule (global | project) ──n project_rule_override
```

## 4. Domain ↔ data mapping

| Domain entity | Table(s) | Source of truth |
|---|---|---|
| Project | project, `.specforge/project.yaml` | DB registry + WS id |
| ProjectSettings | project_settings, permission_rule, `.specforge/instructions.md` | DB / WS |
| AgentRuntime, AgentConfig | agent_runtime, JSON columns | DB (secrets: OS keychain) |
| Artifact, ArtifactElement, TraceLink | artifact, element, trace_link | WS (DB = index) |
| Story, StoryDependency | story, story_dependency | WS (DB = index + exec_substate, order, rejected branches, merged_at) |
| Epic | epic, `v_epic_status` | WS (DB = index + lane order, colour, review checklist / AI check run; status derived) |
| Run, RunEvent, RunResult, ExecutionSpace | run, run_event, run_result, execution_space | DB |
| PermissionRequest, PermissionRule | permission_request, permission_rule | DB |
| ReviewDecision | review_decision (+ story status in WS) | DB / WS |
| QueueEntry, Recommendation | queue_entry, recommendation | DB |
| PendingDecision | SQL view `v_pending_decision` | derived |
| AppSetup | app_setup | DB |
| PhaseStatus, NextStep | computed (ADR-017) | derived |
| QualityFinding | quality_finding | DB |
| DecisionItem | decision_item (decisions written back to WS) | DB / WS |
| ChatThread, ChatChange | chat_thread, chat_message, chat_change | DB |
| UsageRecord | run_result.usage, `v_usage_by_phase` | DB |
| FeatureIntent | feature_intent (+ FI file) | WS (DB = index + wizard state) |
| ImpactItem, InFlightDecision | impact_item, in_flight_decision | DB |
| ChangeSet, ChangeItem | change_set, change_item (accepted items applied to WS files) | DB → WS |
| Idea | idea (+ `ideas.md`) | WS → DB |
| Baseline | baseline (+ Git tag) | Git → DB |

## 5. Migration notes

No predecessor system — no data migration. Schema evolution via numbered SQL migrations run at startup inside a transaction; the workspace index tables can be dropped and rebuilt at any time (`Rebuild index` command). Front-matter carries `specforge: <schemaVersion>`; older files are upgraded lazily on write.
