---
id: US-041
title: Visualise dependencies on the board and as a graph
status: done
size: M
epic: Kanban & dependencies
---

## Business Value
Shows dependencies where planning happens (FR-064).

## Description
As a **SpecForge user**, I want **dependency badges, highlighting and a graph view** so that **I can see blockers and impact at a glance**.

## Acceptance Criteria
- [x] AC-1: Cards show "Blocked by n", "Blocks n" and "Related" badges; badges update when predecessors become Done.
- [x] AC-2: Selecting a card highlights predecessors and successors and draws connector lines; unrelated cards dim.
- [x] AC-3: A dependency graph view (React Flow + elk layout) shows all stories coloured by column.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-03-planning-on-the-kanban-board
- Related requirements: FR-064
- Graph view is Should Have within R1.
- Release: R1

## Dependencies
- US-038 Kanban board with drag & drop
- US-040 Manage story dependencies with cycle detection

## Implementation Details
Files created / modified:
- `packages/ui/src/board/dependencies.ts` — `badgesFor` (open blocking predecessors, open dependents, related), `relationsOf`
- `packages/ui/src/board/StoryCard.tsx` — "Blocked by n", "Blocks n", "Related" badges and the *Show dependencies* toggle; `KanbanBoard.tsx` — highlighting (predecessors amber, successors blue, related dashed, others dimmed) with SVG connector lines; Escape clears
- `packages/ui/src/board/DependencyGraph.tsx` — React Flow graph with a layered dagre layout, nodes coloured by column, blocking and related edges, legend; `KanbanArea.tsx` — Board / Dependency graph toggle
- `packages/application/src/board/board-service.ts` — `dependsOn` and `related` (both directions) per card

Decisions / deviations:
- Deviation: the layout uses `@dagrejs/dagre` (MIT) instead of elkjs, which is licensed EPL-2.0 OR GPL-3.0 and would be flagged by the licence check for review (technical_decisions.md updated).

## Test Coverage
- Coverage: `dependencies.ts` 100.0 % lines, `DependencyGraph.tsx` 100.0 %, `KanbanBoard.tsx` 95.0 %, `KanbanArea.tsx` 84.0 % (workspace total 97.3 % lines)
- Test files: `packages/ui/test/board-dependencies.test.ts` (2 of 4), `packages/ui/test/kanban-dependencies.test.tsx` (2 of 7), `packages/ui/test/dependency-graph.test.tsx` (2), `packages/application/test/board-service.test.ts` (1 shared), `packages/ui/test/app.test.tsx` (1, shared with US-043)
- 8 tests
