# Product Backlog

_Last updated: 2026-11-19_

## Summary

| Status | Count |
|--------|-------|
| ready for development | 38 |
| in progress | 0 |
| blocked | 1 |
| done | 75 |
| **Total** | **114** |

## Stories

| ID | Title | Epic | Size | Status |
|----|-------|------|------|--------|
| US-001 | Spike S1: validate Claude Code integration via Agent SDK | Foundation & spikes | L | done |
| US-002 | Spike S2: validate stacked worktrees and integration merges | Foundation & spikes | M | done |
| US-003 | Spike S3: validate process-tree termination per OS | Foundation & spikes | S | done |
| US-004 | Set up monorepo, tooling and layering rules | Foundation & spikes | M | done |
| US-005 | Create hardened Electron shell with three-process layout | Foundation & spikes | M | done |
| US-006 | Implement typed, validated IPC contract | Foundation & spikes | M | done |
| US-007 | Set up SQLite persistence with migrations | Foundation & spikes | M | done |
| US-008 | Set up CI pipeline on Windows, macOS and Linux | Foundation & spikes | M | done |
| US-009 | Build unsigned installers for all three OSes | Foundation & spikes | M | done |
| US-010 | Detect and verify the Claude Code runtime | Setup & configuration | S | done |
| US-011 | Store secrets in OS credential store and redact them | Setup & configuration | M | done |
| US-012 | First-start setup wizard | Setup & configuration | M | done |
| US-013 | Gate AI features with capabilities (limited mode) | Setup & configuration | S | done |
| US-014 | Manage global and project approval rules | Setup & configuration | M | done |
| US-015 | Configure agent and execution settings | Setup & configuration | M | done |
| US-016 | Configure project settings | Setup & configuration | S | done |
| US-017 | Start wizard with project registry and recent projects | Projects & workspace | M | done |
| US-018 | Create a new project with folder and Git | Projects & workspace | S | done |
| US-019 | Open an existing project and detect VCS mode | Projects & workspace | S | done |
| US-020 | Parse workspace artifacts into the index | Projects & workspace | M | done |
| US-021 | Reconcile external edits to artifacts | Projects & workspace | M | done |
| US-022 | Application shell and primary navigation | Projects & workspace | S | done |
| US-023 | Commit specification changes | Projects & workspace | S | done |
| US-024 | Detect branches merged by the user | Projects & workspace | S | done |
| US-025 | View and edit artifacts | Specification phases | M | done |
| US-026 | Approve artifacts (Draft / Approved) | Specification phases | S | done |
| US-027 | Run specification generation through the agent adapter | Specification phases | L | done |
| US-028 | Write the intent and clarify it with AI | Specification phases | M | done |
| US-029 | Run AI quality checks on artifacts | Specification phases | M | done |
| US-030 | Refine an artifact with AI instructions | Specification phases | S | done |
| US-031 | Generate requirements from the intent | Specification phases | S | done |
| US-032 | Generate the design including ADRs | Specification phases | S | done |
| US-033 | Guide users through phases with a stepper | Specification phases | M | done |
| US-034 | Navigate traceability between artifacts, stories and runs | Specification phases | M | done |
| US-035 | Generate and manage epics | Specification phases | M | done |
| US-036 | Generate user stories per epic with dependencies | Specification phases | M | done |
| US-037 | Implement story state machine and transition rules | Kanban & dependencies | M | done |
| US-038 | Kanban board with drag & drop | Kanban & dependencies | M | done |
| US-039 | Show epics as swimlanes on the board | Kanban & dependencies | M | done |
| US-040 | Manage story dependencies with cycle detection | Kanban & dependencies | M | done |
| US-041 | Visualise dependencies on the board and as a graph | Kanban & dependencies | M | done |
| US-042 | Scheduler: queue, slots and automatic start | Kanban & dependencies | L | done |
| US-043 | Show queued stories and queue controls | Kanban & dependencies | S | done |
| US-044 | Define AgentAdapter port and MockAdapter | Agent execution | M | done |
| US-045 | Implement the Claude Code adapter | Agent execution | M | done |
| US-046 | Prepare isolated worktree execution spaces | Agent execution | L | done |
| US-047 | Snapshots for non-git workspaces | Agent execution | M | done |
| US-048 | Run lifecycle, streaming and persistence | Agent execution | M | done |
| US-049 | Cancel runs and recover after close or crash | Agent execution | M | done |
| US-050 | Assemble agent context for story runs | Agent execution | M | done |
| US-051 | Parse structured results and compute changes | Agent execution | S | done |
| US-052 | Permission broker and policy evaluation | Agent execution | M | done |
| US-053 | Permission prompts, pending decisions and notifications | Agent execution | M | done |
| US-054 | Monitor runs in the execution view | Agent execution | M | done |
| US-055 | Retry, resume or discard failed and interrupted runs | Agent execution | S | done |
| US-056 | Enforce workspace consistency rules | Agent execution | S | done |
| US-057 | Review implementation results and diffs | Review | M | done |
| US-058 | Approve or reject an implementation | Review | S | done |
| US-059 | Request corrections with session resume | Review | S | done |
| US-060 | Rule-based phase status and next-step engine | Dashboard & chat | M | done |
| US-061 | Project dashboard | Dashboard & chat | M | done |
| US-062 | Read-only project chat with threads | Dashboard & chat | M | done |
| US-063 | End-to-end test suite with MockAdapter | Quality & release readiness | L | done |
| US-064 | Fault-injection tests for crash safety | Quality & release readiness | S | done |
| US-065 | Performance and accessibility verification | Quality & release readiness | M | done |
| US-066 | Manual MVP acceptance test with real Claude Code | Quality & release readiness | M | ready for development |
| US-067 | Sign and notarise installers | Quality & release readiness | S | blocked |
| US-068 | Folder-first project creation | Projects & workspace | S | done |
| US-069 | Design tokens, CSS architecture and light/dark foundation | UI design system | M | done |
| US-070 | Core controls, status badges, callouts and icons | UI design system | M | done |
| US-071 | Dialogs, menus, tooltips, toasts and drawers | UI design system | M | done |
| US-072 | Redesign the application shell (sidebar, top bar, page header, phase stepper) | UI design system | M | done |
| US-073 | Redesign start wizard, setup wizard, empty and loading states | UI design system | M | done |
| US-074 | Redesign dashboard, Kanban board and dependency graph | UI design system | M | done |
| US-075 | Redesign intent, specifications, editor and review screens | UI design system | M | done |
| US-076 | Redesign executions, logs, pending decisions, chat and settings | UI design system | M | done |
| US-077 | Choose the colour theme (System / Light / Dark) | UI design system | S | done |
| US-078 | Per-project specification root | Brownfield onboarding | M | ready for development |
| US-079 | Adopt an existing code folder | Brownfield onboarding | M | ready for development |
| US-080 | Analyse an adopted codebase into draft specifications | Brownfield onboarding | M | ready for development |
| US-081 | Feature intent artifact, index and lifecycle | Feature workflow | M | ready for development |
| US-082 | Add feature: entry points and wizard (describe, save, resume) | Feature workflow | M | ready for development |
| US-083 | Feature wizard: AI review and clarification | Feature workflow | M | ready for development |
| US-084 | Feature page with feature-scoped phase stepper | Feature workflow | M | ready for development |
| US-085 | Active features on the dashboard | Feature workflow | S | ready for development |
| US-086 | Potentially impacted flags | Change awareness | M | ready for development |
| US-087 | Feature impact: trace-based analysis and confirmation | Feature workflow | M | ready for development |
| US-088 | Feature impact: AI analysis of specs and code | Feature workflow | S | ready for development |
| US-089 | Delta generation as reviewable change sets | Feature workflow | M | ready for development |
| US-090 | Apply accepted changes with stable IDs and feature links | Feature workflow | M | ready for development |
| US-091 | In-flight protection when applying changes | Feature workflow | M | ready for development |
| US-092 | Rework stories for Done functionality | Feature workflow | S | ready for development |
| US-093 | Feature epic and story breakdown | Feature workflow | M | ready for development |
| US-094 | Feature completion and withdrawal | Feature workflow | S | ready for development |
| US-095 | Idea inbox | Feature workflow | M | ready for development |
| US-096 | Spec baselines | Feature workflow | M | ready for development |
| US-097 | Chat may write through the permission relay | Chat changes | M | ready for development |
| US-098 | Track chat changes per message | Chat changes | M | ready for development |
| US-099 | Revert chat changes | Chat changes | S | ready for development |
| US-100 | Turn chat conversations into features and ideas | Chat changes | S | ready for development |
| US-101 | Derived epic dependencies | Epics & planning | S | ready for development |
| US-102 | Start an epic | Epics & planning | S | ready for development |
| US-103 | Implementation plan view | Epics & planning | M | ready for development |
| US-104 | Epic review | Epics & planning | M | ready for development |
| US-105 | AI completeness check in the epic review | Epics & planning | S | ready for development |
| US-106 | Artifact history and revision compare | Change awareness | M | ready for development |
| US-107 | Overlap warnings between parallel runs | Change awareness | S | ready for development |
| US-108 | Show execution boundaries and model per run | Transparency & environment | S | ready for development |
| US-109 | Usage and cost overview | Transparency & environment | M | ready for development |
| US-110 | Environment status and re-run setup | Transparency & environment | S | ready for development |
| US-111 | Collect open decision items | Decision review | M | ready for development |
| US-112 | Decision review walkthrough and write-back | Decision review | M | ready for development |
| US-113 | Generate test concepts | Specification phases | M | ready for development |
| US-114 | Release 2 end-to-end scenarios and capture-effort checks | Quality & release readiness | M | ready for development |
