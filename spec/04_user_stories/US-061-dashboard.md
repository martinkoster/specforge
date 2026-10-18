---
id: US-061
title: Project dashboard
status: done
size: M
epic: Dashboard & chat
---

## Business Value
Gives an at-a-glance overview and access to everything in the project (FR-085, FR-087, FR-088, FR-101).

## Description
As a **SpecForge user**, I want **a project home showing phase, next step, story stats, runs, decisions, artifacts and epics** so that **I understand the project status and act from one place**.

## Acceptance Criteria
- [x] AC-1: Dashboard shows stepper, next-step card with action button, story counts per state and progress, active/queued runs, pending decisions, recent activity.
- [x] AC-2: Artifacts widget lists artifacts per phase with approval/impact state; clicking opens them.
- [x] AC-3: Epics widget shows status and progress per epic; clicking filters the board.
- [x] AC-4: Kanban link is disabled with hint and shortcut until at least one story exists.
- [x] AC-5: Renders in < 1 s for 1,000 stories/runs.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-034
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-12-dashboard-project-home
- Related design document: `spec/03_design/technical_design/service_design.md` — dashboardservice
- Related requirements: FR-085, FR-087, FR-088, FR-101, NFR-030
- Usage & cost widget is Release 2 (FR-090).
- Release: R1

## Dependencies
- US-060 Rule-based phase status and next-step engine
- US-022 Application shell and primary navigation
- US-039 Show epics as swimlanes on the board

## Implementation Details
Files created / modified:
- `packages/application/src/board/dashboard.ts` — dashboard read model (story counts, progress, active/queued runs, pending decisions, recent activity, artifacts per phase, epics, Kanban availability)
- `packages/core/src/composition.ts`, `packages/ipc-contract/src/contract.ts` — `dashboard.get`
- `packages/ui/src/dashboard/DashboardArea.tsx` — stepper, next-step card, widgets; User Timing mark `specforge:project-interactive` (NFR-003)
- `packages/ui/src/App.tsx` — navigation from the widgets (artifacts, filtered board, pending decisions, phases)

Decisions / deviations:
- Usage & cost widget is Release 2 (FR-090).

## Test Coverage
- Coverage: `dashboard.ts` 100 % lines, `DashboardArea.tsx` 100 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/application/test/dashboard.test.ts` (3), `packages/ui/test/dashboard.test.tsx` (5), `packages/application/test/dashboard.perf.test.ts` (1, 1,000 stories/runs), `packages/ui/test/dashboard.perf.test.tsx` (1)
- 10 tests
