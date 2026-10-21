# User Stories — SpecForge

_Last updated: 2026-10-18_

Scope: **Release 1 (MVP)** per `spec/02_requirements/requirements_summary.md`. Release 2 stories will be generated in a later run.

Status values: `ready for development`, `in progress`, `blocked`, `done`.

## Index by epic

### Foundation & spikes

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-001](US-001-spike-claude-code-adapter.md) | Spike S1: validate Claude Code integration via Agent SDK | L | in progress |
| [US-002](US-002-spike-stacked-worktrees.md) | Spike S2: validate stacked worktrees and integration merges | M | done |
| [US-003](US-003-spike-process-trees.md) | Spike S3: validate process-tree termination per OS | S | done |
| [US-004](US-004-monorepo-scaffold.md) | Set up monorepo, tooling and layering rules | M | done |
| [US-005](US-005-electron-three-process-shell.md) | Create hardened Electron shell with three-process layout | M | done |
| [US-006](US-006-typed-ipc-contract.md) | Implement typed, validated IPC contract | M | done |
| [US-007](US-007-sqlite-persistence-foundation.md) | Set up SQLite persistence with migrations | M | done |
| [US-008](US-008-ci-pipeline.md) | Set up CI pipeline on Windows, macOS and Linux | M | done |
| [US-009](US-009-installers-per-os.md) | Build unsigned installers for all three OSes | M | in progress |

### Setup & configuration

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-010](US-010-agent-runtime-detection.md) | Detect and verify the Claude Code runtime | S | done |
| [US-011](US-011-secret-vault-and-redaction.md) | Store secrets in OS credential store and redact them | M | done |
| [US-012](US-012-setup-wizard.md) | First-start setup wizard | M | done |
| [US-013](US-013-capabilities-limited-mode.md) | Gate AI features with capabilities (limited mode) | S | done |
| [US-014](US-014-approval-rules-engine-and-defaults.md) | Manage global and project approval rules | M | done |
| [US-015](US-015-runtime-and-execution-settings.md) | Configure agent and execution settings | M | done |
| [US-016](US-016-project-settings.md) | Configure project settings | S | done |

### Projects & workspace

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-017](US-017-start-wizard-and-registry.md) | Start wizard with project registry and recent projects | M | done |
| [US-018](US-018-create-new-project.md) | Create a new project with folder and Git | S | done |
| [US-019](US-019-open-existing-project.md) | Open an existing project and detect VCS mode | S | done |
| [US-020](US-020-artifact-parser-and-index.md) | Parse workspace artifacts into the index | M | done |
| [US-021](US-021-file-watcher-reconciliation.md) | Reconcile external edits to artifacts | M | done |
| [US-022](US-022-app-shell-navigation.md) | Application shell and primary navigation | S | done |
| [US-023](US-023-commit-spec-changes.md) | Commit specification changes | S | done |
| [US-024](US-024-merge-detection.md) | Detect branches merged by the user | S | done |

### Specification phases

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-025](US-025-artifact-viewer-editor.md) | View and edit artifacts | M | done |
| [US-026](US-026-artifact-approval.md) | Approve artifacts (Draft / Approved) | S | done |
| [US-027](US-027-spec-run-infrastructure.md) | Run specification generation through the agent adapter | L | done |
| [US-028](US-028-intent-editor-and-clarification.md) | Write the intent and clarify it with AI | M | done |
| [US-029](US-029-ai-quality-check.md) | Run AI quality checks on artifacts | M | done |
| [US-030](US-030-refine-with-ai.md) | Refine an artifact with AI instructions | S | done |
| [US-031](US-031-generate-requirements.md) | Generate requirements from the intent | S | done |
| [US-032](US-032-generate-design.md) | Generate the design including ADRs | S | done |
| [US-033](US-033-phase-stepper.md) | Guide users through phases with a stepper | M | done |
| [US-034](US-034-traceability-panel.md) | Navigate traceability between artifacts, stories and runs | M | done |
| [US-035](US-035-generate-and-manage-epics.md) | Generate and manage epics | M | done |
| [US-036](US-036-generate-stories-per-epic.md) | Generate user stories per epic with dependencies | M | done |

### Kanban & dependencies

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-037](US-037-story-state-machine.md) | Implement story state machine and transition rules | M | done |
| [US-038](US-038-kanban-board-ui.md) | Kanban board with drag & drop | M | done |
| [US-039](US-039-epic-swimlanes.md) | Show epics as swimlanes on the board | M | done |
| [US-040](US-040-story-dependencies.md) | Manage story dependencies with cycle detection | M | done |
| [US-041](US-041-dependency-visualisation.md) | Visualise dependencies on the board and as a graph | M | done |
| [US-042](US-042-scheduler-queue.md) | Scheduler: queue, slots and automatic start | L | done |
| [US-043](US-043-queue-ui.md) | Show queued stories and queue controls | S | done |

### Agent execution

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-044](US-044-agent-adapter-port-and-mock.md) | Define AgentAdapter port and MockAdapter | M | done |
| [US-045](US-045-claude-code-adapter.md) | Implement the Claude Code adapter | M | in progress |
| [US-046](US-046-worktree-execution-spaces.md) | Prepare isolated worktree execution spaces | L | done |
| [US-047](US-047-non-git-snapshots.md) | Snapshots for non-git workspaces | M | done |
| [US-048](US-048-run-lifecycle-and-persistence.md) | Run lifecycle, streaming and persistence | M | done |
| [US-049](US-049-cancel-and-recovery.md) | Cancel runs and recover after close or crash | M | done |
| [US-050](US-050-context-assembler.md) | Assemble agent context for story runs | M | done |
| [US-051](US-051-result-parsing-and-changed-files.md) | Parse structured results and compute changes | S | done |
| [US-052](US-052-permission-broker.md) | Permission broker and policy evaluation | M | done |
| [US-053](US-053-permission-prompts-and-pending-decisions.md) | Permission prompts, pending decisions and notifications | M | done |
| [US-054](US-054-execution-view.md) | Monitor runs in the execution view | M | done |
| [US-055](US-055-retry-resume-runs.md) | Retry, resume or discard failed and interrupted runs | S | done |
| [US-056](US-056-workspace-consistency-guards.md) | Enforce workspace consistency rules | S | done |

### Review

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-057](US-057-review-screen.md) | Review implementation results and diffs | M | done |
| [US-058](US-058-approve-or-reject.md) | Approve or reject an implementation | S | done |
| [US-059](US-059-request-corrections.md) | Request corrections with session resume | S | done |

### Dashboard & chat

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-060](US-060-next-step-engine.md) | Rule-based phase status and next-step engine | M | done |
| [US-061](US-061-dashboard.md) | Project dashboard | M | done |
| [US-062](US-062-read-only-project-chat.md) | Read-only project chat with threads | M | done |

### Quality & release readiness

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-063](US-063-e2e-mock-suite.md) | End-to-end test suite with MockAdapter | L | done |
| [US-064](US-064-fault-injection-crash-safety.md) | Fault-injection tests for crash safety | S | done |
| [US-065](US-065-performance-accessibility-checks.md) | Performance and accessibility verification | M | done |
| [US-066](US-066-real-agent-acceptance.md) | Manual MVP acceptance test with real Claude Code | M | ready for development |
| [US-067](US-067-code-signing.md) | Sign and notarise installers | S | blocked |

## Dependency summary

| Story | Depends on |
|---|---|
| US-005 Create hardened Electron shell with three-process layout | US-004 |
| US-006 Implement typed, validated IPC contract | US-005 |
| US-007 Set up SQLite persistence with migrations | US-004 |
| US-008 Set up CI pipeline on Windows, macOS and Linux | US-004 |
| US-009 Build unsigned installers for all three OSes | US-005, US-008 |
| US-010 Detect and verify the Claude Code runtime | US-006, US-007 |
| US-011 Store secrets in OS credential store and redact them | US-005, US-007 |
| US-012 First-start setup wizard | US-010, US-011, US-014 |
| US-013 Gate AI features with capabilities (limited mode) | US-012 |
| US-014 Manage global and project approval rules | US-006, US-007 |
| US-015 Configure agent and execution settings | US-010, US-011 |
| US-016 Configure project settings | US-019 |
| US-017 Start wizard with project registry and recent projects | US-006, US-007 |
| US-018 Create a new project with folder and Git | US-017 |
| US-019 Open an existing project and detect VCS mode | US-017, US-020 |
| US-020 Parse workspace artifacts into the index | US-007 |
| US-021 Reconcile external edits to artifacts | US-020 |
| US-022 Application shell and primary navigation | US-006 |
| US-023 Commit specification changes | US-019 |
| US-024 Detect branches merged by the user | US-019, US-046 |
| US-025 View and edit artifacts | US-020, US-022 |
| US-026 Approve artifacts (Draft / Approved) | US-025 |
| US-027 Run specification generation through the agent adapter | US-044, US-047, US-052, US-025 |
| US-028 Write the intent and clarify it with AI | US-027 |
| US-029 Run AI quality checks on artifacts | US-027 |
| US-030 Refine an artifact with AI instructions | US-027 |
| US-031 Generate requirements from the intent | US-027 |
| US-032 Generate the design including ADRs | US-027 |
| US-033 Guide users through phases with a stepper | US-026 |
| US-034 Navigate traceability between artifacts, stories and runs | US-020, US-025 |
| US-035 Generate and manage epics | US-027 |
| US-036 Generate user stories per epic with dependencies | US-035, US-040 |
| US-037 Implement story state machine and transition rules | US-004 |
| US-038 Kanban board with drag & drop | US-037, US-021, US-022 |
| US-039 Show epics as swimlanes on the board | US-038, US-035 |
| US-040 Manage story dependencies with cycle detection | US-020 |
| US-041 Visualise dependencies on the board and as a graph | US-038, US-040 |
| US-042 Scheduler: queue, slots and automatic start | US-037, US-040, US-007 |
| US-043 Show queued stories and queue controls | US-042, US-038 |
| US-044 Define AgentAdapter port and MockAdapter | US-004 |
| US-045 Implement the Claude Code adapter | US-001, US-044, US-011 |
| US-046 Prepare isolated worktree execution spaces | US-002, US-007 |
| US-047 Snapshots for non-git workspaces | US-007 |
| US-048 Run lifecycle, streaming and persistence | US-044, US-042, US-011 |
| US-049 Cancel runs and recover after close or crash | US-048, US-003 |
| US-050 Assemble agent context for story runs | US-020, US-048 |
| US-051 Parse structured results and compute changes | US-048, US-046, US-047 |
| US-052 Permission broker and policy evaluation | US-014, US-044 |
| US-053 Permission prompts, pending decisions and notifications | US-052, US-022 |
| US-054 Monitor runs in the execution view | US-048, US-022 |
| US-055 Retry, resume or discard failed and interrupted runs | US-049, US-042 |
| US-056 Enforce workspace consistency rules | US-042, US-052 |
| US-057 Review implementation results and diffs | US-051, US-038 |
| US-058 Approve or reject an implementation | US-057, US-042 |
| US-059 Request corrections with session resume | US-057, US-042, US-045 |
| US-060 Rule-based phase status and next-step engine | US-037, US-026 |
| US-061 Project dashboard | US-060, US-022, US-039 |
| US-062 Read-only project chat with threads | US-052, US-048, US-061 |
| US-063 End-to-end test suite with MockAdapter | US-061, US-058, US-043, US-031 |
| US-064 Fault-injection tests for crash safety | US-048, US-020 |
| US-065 Performance and accessibility verification | US-054, US-061, US-038 |
| US-066 Manual MVP acceptance test with real Claude Code | US-063, US-045, US-009 |
| US-067 Sign and notarise installers | US-009 |

**Longest dependency chain (critical path, 11 stories):** US-004 → US-005 → US-006 → US-014 → US-052 → US-027 → US-035 → US-039 → US-061 → US-063 → US-066

## Implementation waves (by dependency depth)

| Wave | Stories |
|---|---|
| 1 | US-001, US-002, US-003, US-004 |
| 2 | US-005, US-007, US-008, US-037, US-044 |
| 3 | US-006, US-009, US-011, US-020, US-046, US-047 |
| 4 | US-010, US-014, US-017, US-021, US-022, US-040, US-045, US-067 |
| 5 | US-012, US-015, US-018, US-019, US-025, US-038, US-042, US-052 |
| 6 | US-013, US-016, US-023, US-026, US-034, US-041, US-043, US-024, US-048, US-027, US-053, US-056 |
| 7 | US-033, US-049, US-050, US-051, US-028, US-029, US-030, US-031, US-032, US-035, US-054, US-060, US-064 |
| 8 | US-036, US-039, US-055, US-057 |
| 9 | US-058, US-059, US-061 |
| 10 | US-062, US-063, US-065 |
| 11 | US-066 |

## Totals

| Size | Count |
|---|---|
| XS | 0 |
| S | 21 |
| M | 41 |
| L | 5 |
| XL | 0 |
| **Total** | **67** |

| Status | Count |
|---|---|
| blocked | 1 |
| done | 50 |
| in progress | 2 |
| ready for development | 14 |

## Requirement coverage (Release 1)

All 85 Release 1 functional requirements are referenced by at least one story.
