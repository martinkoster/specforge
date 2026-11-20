---
id: US-103
title: Implementation plan view
status: done
size: M
epic: Epics & planning
---

## Business Value
A plan of parallel waves and the critical path makes delivery predictable (FR-084).

## Description
As a **SpecForge user**, I want to **see implementation waves and the critical path and start a wave** so that **I can plan and run parallel work efficiently**.

## Acceptance Criteria
- [x] AC-1: The plan view shows waves as columns (topological levels of the blocking graph, split by the concurrency limit), the critical path highlighted and size totals per wave; a compact epic graph (US-101) is shown above.
- [x] AC-2: Cards are coloured by board state; *Group by epic* toggles grouping, with *Start epic* per group.
- [x] AC-3: *Start wave* moves the wave's Ready stories to In Progress (each a human authorisation; non-Ready listed as skipped).
- [x] AC-4: FR-084 acceptance passes (A→B→C, D, E: waves {A,D,E}, {B}, {C}; critical path A→B→C).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-036; user_flows.md UF-14; service_design.md PlanService
- Related requirements: FR-084, FR-022
- Release: R2

## Dependencies
- US-101 Derived epic dependencies
- US-102 Start an epic

## Implementation Details
Files created / modified:
- `packages/domain/src/planning/plan.ts` — `implementationPlan`: waves = topological levels of the blocking graph of the stories that are not Done (dependencies on Done stories are satisfied), each level split by the concurrency limit (ID order); size totals by size weight; critical path = longest blocking chain by size weight
- `packages/application/src/board/plan-service.ts` — `plan` (waves with story details, critical path, epic edges, limit), `wavePreview`, `startWave`
- `packages/ipc-contract/src/contract.ts` — `plan.get`, `plan.wavePreview`, `plan.startWave`; `packages/core/src/composition.ts` — limit from the project settings (1 in non-git mode)
- UI: `board/PlanView.tsx` (new: epic dependencies above, critical path, waves as columns with points, cards coloured by board state and bold on the critical path, *Start wave*, *Group by epic* with *Start epic*), `board/KanbanArea.tsx` (view *Plan* next to Board and Dependency graph), `styles/areas/graph.css`

Decisions / deviations:
- The plan covers the remaining work: Done stories are left out of the waves.
- The plan is reached from the Kanban area (view *Plan*); the epic graph above the waves is a compact list ("EP-002 depends on EP-001").

## Test Coverage
- Coverage (lines): `plan.ts` 100 %, `plan-service.ts` 100 %, `PlanView.tsx` ≥ 90 %
- Test files: `packages/domain/test/plan.test.ts` (3 incl. a fast-check property: every story planned once after its predecessors, waves within the limit, critical path along blocking edges), `packages/application/test/plan-service.test.ts` (2), `packages/core/test/plan-ipc.test.ts` (FR-084 acceptance), `packages/ui/test/plan-view.test.tsx` (3)
- 9 new tests
