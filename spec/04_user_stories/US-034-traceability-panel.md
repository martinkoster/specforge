---
id: US-034
title: Navigate traceability between artifacts, stories and runs
status: done
size: M
epic: Specification phases
---

## Business Value
Makes the chain intent → requirements → design → epics → stories → runs → files navigable (FR-016, FR-055).

## Description
As a **SpecForge user**, I want **to see and follow links up and down the trace chain** so that **I understand why something exists and what it affects**.

## Acceptance Criteria
- [x] AC-1: Trace panel shows upstream and downstream links for the selected element, story, run or file.
- [x] AC-2: Links navigate to the target; changed files open as diff or in the default editor.
- [x] AC-3: Links to unknown IDs are reported as validation issues.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-009
- Related requirements: FR-016, FR-055
- Release: R1

## Dependencies
- US-020 Parse workspace artifacts into the index
- US-025 View and edit artifacts

## Implementation Details
Files created / modified:
- `packages/application/src/specs/trace-service.ts` — `TraceService.trace()` (element, story, run, file: upstream/downstream links) and `issues()` (links to unknown IDs)
- `packages/adapters/sqlite/src/index-repository.ts`, `execution-store.ts` — link sources/targets, runs of a story, files of a run
- `packages/ipc-contract/src/contract.ts`, `packages/core/src/composition.ts` — `trace.get`, `trace.issues`
- `packages/ui/src/specs/TracePanel.tsx` — trace panel (upstream/downstream, unknown links marked, Back, diff via `DiffView`, *Open in editor*); `root` prop traces a story, run or file directly
- `packages/ui/src/specs/SpecificationsArea.tsx` — panel next to the open artifact, jump to the element heading, project-wide *Link issues* banner
- `packages/ui/src/board/StoryDrawer.tsx`, `KanbanBoard.tsx`, `KanbanArea.tsx` — trace of the story in the story drawer (`renderDetails`)
- `packages/ui/src/executions/ExecutionsArea.tsx` — *Trace* tab per run
- `packages/ui/src/App.tsx` — links open artifacts in Specifications/Intent (`openArtifactPath`)

Decisions / deviations:
- The trace is reachable from the selected artifact element, the story drawer on the board and the run panel in Executions; files are reached through their run (diff or default editor).

## Test Coverage
- Coverage: `trace-service.ts` 100 % lines, `TracePanel.tsx` 88.9 %, `StoryDrawer.tsx` 100 %, `ExecutionsArea.tsx` 93.2 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/application/test/trace-service.test.ts` (5), `packages/ui/test/trace-panel.test.tsx` (4), `packages/core/test/trace-ipc.test.ts` (1), `packages/ui/test/executions.test.tsx` (1 new), `packages/ui/test/kanban-board.test.tsx` (1 new)
- 12 tests
