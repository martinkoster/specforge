# User Stories — SpecForge

_Last updated: 2026-11-19_

Scope: **Release 1 (MVP)** (US-001 – US-077) and **Release 2** (US-078 – US-114, intent D26: all R2 requirements; delivery order brownfield onboarding → feature workflow → chat changes → remaining Should-haves) per `spec/02_requirements/requirements_summary.md`.

Status values: `ready for development`, `in progress`, `blocked`, `done`.

## Index by epic

### Foundation & spikes

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-001](US-001-spike-claude-code-adapter.md) | Spike S1: validate Claude Code integration via Agent SDK | L | done |
| [US-002](US-002-spike-stacked-worktrees.md) | Spike S2: validate stacked worktrees and integration merges | M | done |
| [US-003](US-003-spike-process-trees.md) | Spike S3: validate process-tree termination per OS | S | done |
| [US-004](US-004-monorepo-scaffold.md) | Set up monorepo, tooling and layering rules | M | done |
| [US-005](US-005-electron-three-process-shell.md) | Create hardened Electron shell with three-process layout | M | done |
| [US-006](US-006-typed-ipc-contract.md) | Implement typed, validated IPC contract | M | done |
| [US-007](US-007-sqlite-persistence-foundation.md) | Set up SQLite persistence with migrations | M | done |
| [US-008](US-008-ci-pipeline.md) | Set up CI pipeline on Windows, macOS and Linux | M | done |
| [US-009](US-009-installers-per-os.md) | Build unsigned installers for all three OSes | M | done |

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
| [US-068](US-068-folder-first-project-creation.md) | Folder-first project creation | S | done |
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
| [US-045](US-045-claude-code-adapter.md) | Implement the Claude Code adapter | M | done |
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

### UI design system

Visual concept: `spec/03_design/functional_design/ui_design_concept.md` (intent D25, ADR-023).

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-069](US-069-design-tokens-and-css-foundation.md) | Design tokens, CSS architecture and light/dark foundation | M | done |
| [US-070](US-070-core-controls-and-icons.md) | Core controls, status badges, callouts and icons | M | done |
| [US-071](US-071-overlays-dialogs-menus-toasts.md) | Dialogs, menus, tooltips, toasts and drawers | M | done |
| [US-072](US-072-app-shell-redesign.md) | Redesign the application shell (sidebar, top bar, page header, phase stepper) | M | done |
| [US-073](US-073-start-and-setup-screens-redesign.md) | Redesign start wizard, setup wizard, empty and loading states | M | done |
| [US-074](US-074-dashboard-kanban-graph-redesign.md) | Redesign dashboard, Kanban board and dependency graph | M | done |
| [US-075](US-075-specs-editor-review-redesign.md) | Redesign intent, specifications, editor and review screens | M | done |
| [US-076](US-076-executions-settings-decisions-redesign.md) | Redesign executions, logs, pending decisions, chat and settings | M | done |
| [US-077](US-077-theme-setting.md) | Choose the colour theme (System / Light / Dark) | S | done |

## Release 2 index by epic

Design refresh for Release 2: intent D26/D27, ADR-024 – ADR-026 (`spec/03_design/technical_design/c4_architecture.md`).

### Brownfield onboarding (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-078](US-078-specification-root.md) | Per-project specification root | M | done |
| [US-079](US-079-adopt-existing-folder.md) | Adopt an existing code folder | M | done |
| [US-080](US-080-codebase-analysis-run.md) | Analyse an adopted codebase into draft specifications | M | done |

### Feature workflow (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-081](US-081-feature-intent-artifact.md) | Feature intent artifact, index and lifecycle | M | done |
| [US-082](US-082-feature-wizard-describe-save.md) | Add feature: entry points and wizard (describe, save, resume) | M | done |
| [US-083](US-083-feature-wizard-ai-review.md) | Feature wizard: AI review and clarification | M | done |
| [US-084](US-084-feature-page-stepper.md) | Feature page with feature-scoped phase stepper | M | done |
| [US-085](US-085-active-features-dashboard.md) | Active features on the dashboard | S | done |
| [US-087](US-087-feature-trace-impact.md) | Feature impact: trace-based analysis and confirmation | M | done |
| [US-088](US-088-feature-ai-impact.md) | Feature impact: AI analysis of specs and code | S | done |
| [US-089](US-089-delta-change-sets.md) | Delta generation as reviewable change sets | M | done |
| [US-090](US-090-apply-change-sets.md) | Apply accepted changes with stable IDs and feature links | M | done |
| [US-091](US-091-in-flight-protection.md) | In-flight protection when applying changes | M | done |
| [US-092](US-092-rework-stories.md) | Rework stories for Done functionality | S | done |
| [US-093](US-093-feature-epic-stories.md) | Feature epic and story breakdown | M | done |
| [US-094](US-094-feature-completion-withdrawal.md) | Feature completion and withdrawal | S | done |
| [US-095](US-095-idea-inbox.md) | Idea inbox | M | done |
| [US-096](US-096-spec-baselines.md) | Spec baselines | M | done |

### Change awareness (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-086](US-086-potentially-impacted-flags.md) | Potentially impacted flags | M | done |
| [US-106](US-106-artifact-history.md) | Artifact history and revision compare | M | ready for development |
| [US-107](US-107-overlap-detection.md) | Overlap warnings between parallel runs | S | ready for development |

### Chat changes (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-097](US-097-chat-write-permissions.md) | Chat may write through the permission relay | M | done |
| [US-098](US-098-chat-change-tracking.md) | Track chat changes per message | M | done |
| [US-099](US-099-chat-change-revert.md) | Revert chat changes | S | done |
| [US-100](US-100-chat-feature-suggestions.md) | Turn chat conversations into features and ideas | S | done |

### Epics & planning (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-101](US-101-derived-epic-dependencies.md) | Derived epic dependencies | S | done |
| [US-102](US-102-start-epic.md) | Start an epic | S | done |
| [US-103](US-103-implementation-plan-view.md) | Implementation plan view | M | done |
| [US-104](US-104-epic-review.md) | Epic review | M | ready for development |
| [US-105](US-105-epic-ai-completeness-check.md) | AI completeness check in the epic review | S | ready for development |

### Transparency & environment (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-108](US-108-execution-boundaries.md) | Show execution boundaries and model per run | S | ready for development |
| [US-109](US-109-usage-cost-overview.md) | Usage and cost overview | M | ready for development |
| [US-110](US-110-environment-status.md) | Environment status and re-run setup | S | ready for development |

### Decision review (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-111](US-111-decision-items.md) | Collect open decision items | M | ready for development |
| [US-112](US-112-decision-review-walkthrough.md) | Decision review walkthrough and write-back | M | ready for development |

### Specification phases (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-113](US-113-test-concepts.md) | Generate test concepts | M | ready for development |

### Quality & release readiness (Release 2)

| ID | Title | Size | Status |
|----|-------|------|--------|
| [US-114](US-114-r2-e2e-suite.md) | Release 2 end-to-end scenarios and capture-effort checks | M | ready for development |

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
| US-068 Folder-first project creation | US-018, US-019 |
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
| US-070 Core controls, status badges, callouts and icons | US-069 |
| US-071 Dialogs, menus, tooltips, toasts and drawers | US-070 |
| US-072 Redesign the application shell (sidebar, top bar, page header, phase stepper) | US-070, US-071 |
| US-073 Redesign start wizard, setup wizard, empty and loading states | US-072 |
| US-074 Redesign dashboard, Kanban board and dependency graph | US-072 |
| US-075 Redesign intent, specifications, editor and review screens | US-072 |
| US-076 Redesign executions, logs, pending decisions, chat and settings | US-072, US-077 |
| US-077 Choose the colour theme (System / Light / Dark) | US-069 |

| US-079 Adopt an existing code folder | US-078 |
| US-080 Analyse an adopted codebase into draft specifications | US-079 |
| US-081 Feature intent artifact, index and lifecycle | US-078 |
| US-082 Add feature: entry points and wizard (describe, save, resume) | US-081 |
| US-083 Feature wizard: AI review and clarification | US-082 |
| US-084 Feature page with feature-scoped phase stepper | US-081 |
| US-085 Active features on the dashboard | US-084 |
| US-086 Potentially impacted flags | US-078 |
| US-087 Feature impact: trace-based analysis and confirmation | US-084 |
| US-088 Feature impact: AI analysis of specs and code | US-087 |
| US-089 Delta generation as reviewable change sets | US-087 |
| US-090 Apply accepted changes with stable IDs and feature links | US-089, US-086 |
| US-091 In-flight protection when applying changes | US-090 |
| US-092 Rework stories for Done functionality | US-081 |
| US-093 Feature epic and story breakdown | US-090, US-092 |
| US-094 Feature completion and withdrawal | US-090 |
| US-095 Idea inbox | US-082 |
| US-096 Spec baselines | US-094 |
| US-097 Chat may write through the permission relay | US-078 |
| US-098 Track chat changes per message | US-097, US-086 |
| US-099 Revert chat changes | US-098 |
| US-100 Turn chat conversations into features and ideas | US-082, US-095 |
| US-103 Implementation plan view | US-101, US-102 |
| US-105 AI completeness check in the epic review | US-104 |
| US-106 Artifact history and revision compare | US-078 |
| US-111 Collect open decision items | US-078 |
| US-112 Decision review walkthrough and write-back | US-111 |
| US-113 Generate test concepts | US-078 |
| US-114 Release 2 end-to-end scenarios and capture-effort checks | US-080, US-094, US-099, US-095 |

**Longest dependency chain (critical path, 11 stories):** US-004 → US-005 → US-006 → US-014 → US-052 → US-027 → US-035 → US-039 → US-061 → US-063 → US-066

**Release 2 longest chain (8 stories):** US-078 → US-081 → US-084 → US-087 → US-089 → US-090 → US-094 → US-096

## Implementation waves (by dependency depth)

| Wave | Stories |
|---|---|
| 1 | US-001, US-002, US-003, US-004, US-069 |
| 2 | US-005, US-007, US-008, US-037, US-044, US-070, US-077 |
| 3 | US-006, US-009, US-011, US-020, US-046, US-047, US-071 |
| 4 | US-010, US-014, US-017, US-021, US-022, US-040, US-045, US-067, US-072 |
| 5 | US-012, US-015, US-018, US-019, US-025, US-038, US-042, US-052, US-073, US-074, US-075, US-076 |
| 6 | US-013, US-016, US-068, US-023, US-026, US-034, US-041, US-043, US-024, US-048, US-027, US-053, US-056 |
| 7 | US-033, US-049, US-050, US-051, US-028, US-029, US-030, US-031, US-032, US-035, US-054, US-060, US-064 |
| 8 | US-036, US-039, US-055, US-057 |
| 9 | US-058, US-059, US-061 |
| 10 | US-062, US-063, US-065 |
| 11 | US-066 |

## Release 2 delivery order (intent D26)

| Wave | Theme | Stories |
|---|---|---|
| R2-1 | Brownfield onboarding | US-078 → US-079 → US-080 |
| R2-2 | Feature workflow (incl. impact flags, idea inbox, baselines) | US-081, US-082, US-083, US-084, US-085, US-086, US-087, US-088, US-089, US-090, US-091, US-092, US-093, US-094, US-095, US-096 |
| R2-3 | Chat changes | US-097, US-098, US-099, US-100 |
| R2-4 | Remaining Should-haves | US-101 – US-113 |
| R2-5 | Release 2 end-to-end checks | US-114 |

US-086 (*Potentially impacted* flags, FR-017/FR-071) is a Should-have of wave 4 by D26 but is pulled into wave 2 because delta application (FR-107) and in-flight protection (FR-110) set these flags. Within a wave, respect the dependency summary; stories without dependencies in wave 4 can run in parallel.

## Totals

| Size | Count |
|---|---|
| XS | 0 |
| S | 35 |
| M | 74 |
| L | 5 |
| XL | 0 |
| **Total** | **114** |

| Status | Count |
|---|---|
| blocked | 1 |
| done | 89 |
| in progress | 0 |
| ready for development | 24 |

## Requirement coverage (Release 1)

All 86 Release 1 functional requirements are referenced by at least one story (FR-117 by US-077; NFR-033 by US-069 – US-076).

## Requirement coverage (Release 2)

All 27 Release 2 functional requirements and both Release 2 NFRs are referenced by at least one story.

| Requirement | Stories |
|---|---|
| FR-011 | US-113 |
| FR-015 | US-106 |
| FR-017 | US-086, US-090 |
| FR-057 | US-108 |
| FR-070 | US-107 |
| FR-071 | US-086 |
| FR-075 | US-110 |
| FR-079 | US-078, US-079, US-080, US-114 |
| FR-083 | US-111, US-112 |
| FR-084 | US-103 |
| FR-090 | US-109 |
| FR-091 | US-097, US-098, US-099, US-114 |
| FR-097 | US-101 |
| FR-098 | US-102 |
| FR-100 | US-104, US-105 |
| FR-102 | US-082, US-100 |
| FR-103 | US-082, US-083, US-114 |
| FR-104 | US-081, US-090, US-094 |
| FR-105 | US-084 |
| FR-106 | US-087, US-088 |
| FR-107 | US-089, US-090 |
| FR-108 | US-093 |
| FR-109 | US-092 |
| FR-110 | US-091 |
| FR-111 | US-095, US-100 |
| FR-112 | US-096 |
| FR-113 | US-085 |
| NFR-031 | US-098, US-099, US-114 |
| NFR-032 | US-082, US-087, US-095, US-114 |
