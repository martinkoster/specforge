---
id: US-101
title: Derived epic dependencies
status: done
size: S
epic: Epics & planning
---

## Business Value
Seeing which epics depend on others helps plan delivery order (FR-097).

## Description
As a **SpecForge user**, I want to **see epic-level dependencies derived from story dependencies** so that **I can plan epics in the right order**.

## Acceptance Criteria
- [x] AC-1: A pure domain function derives "EP-B depends on EP-A" when a story of EP-B has a blocking dependency on a story of EP-A (property-tested).
- [x] AC-2: Lane headers show "depends on EP-001"; the dependency graph can group by epic and shows the derived epic edges.
- [x] AC-3: FR-097 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-041; user_flows.md UF-03
- Related requirements: FR-097
- Release: R2

## Dependencies
- None

## Implementation Details
Files created / modified:
- `packages/domain/src/planning/plan.ts` (new) — `epicDependencies`: EP-B depends on EP-A when a story of EP-B blocks on a story of EP-A (sorted, unique; stories without epic and same-epic edges ignored)
- `packages/application/src/board/board-service.ts` — lanes carry `dependsOn`; `packages/ipc-contract/src/contract.ts` — lane `dependsOn`
- UI: `board/KanbanBoard.tsx` (lane header "depends on EP-001"), `board/DependencyGraph.tsx` (*Group by epic*: one node per epic with the derived epic edges), `styles/areas/graph.css`

Decisions / deviations:
- None; epic dependencies are always derived, never stored.

## Test Coverage
- Coverage (lines): `plan.ts` 100 %, `board-service.ts` 99 %, `KanbanBoard.tsx` and `DependencyGraph.tsx` ≥ 90 %
- Test files: `packages/domain/test/plan.test.ts` (2 incl. a fast-check property), `packages/application/test/board-service.test.ts` (+1), `packages/core/test/plan-ipc.test.ts` (FR-097 acceptance: EP-002's lane header depends on EP-001), `packages/ui/test/plan-view.test.tsx` (2)
- 6 new tests
