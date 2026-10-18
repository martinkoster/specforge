---
id: US-040
title: Manage story dependencies with cycle detection
status: done
size: M
epic: Kanban & dependencies
---

## Business Value
Makes blocking and related dependencies explicit and valid (FR-062, FR-063).

## Description
As a **SpecForge user**, I want **to add blocking or related dependencies between stories** so that **the order of work is clear and enforceable**.

## Acceptance Criteria
- [x] AC-1: Dependencies (`depends_on` with rationale, `related_to`) can be added/removed in the story drawer; front-matter is updated.
- [x] AC-2: DependencyGraph (pure domain) rejects self-references, unknown IDs and cycles with the cycle path in the message.
- [x] AC-3: Cycle detection for 1,000 stories / 3,000 dependencies completes in < 100 ms (property tests with fast-check).

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-013
- Related requirements: FR-062, FR-063, NFR-028
- Release: R1

## Dependencies
- US-020 Parse workspace artifacts into the index

## Implementation Details
Files created / modified:
- `packages/domain/src/dependencies/graph.ts` — `DependencyGraph` (pure): `validate` (self-reference, unknown IDs, duplicates, cycles with the cycle path), `findCycle` (iterative DFS), `predecessors`, `dependents`, `related`
- `packages/application/src/stories/front-matter.ts` — `editFrontMatter` (YAML document edit that keeps comments and the Markdown body)
- `packages/application/src/stories/dependency-service.ts` — `StoryDependencyService.add/remove` (validated against the graph, written to `depends_on` / `related_to`, re-indexed); ports `ArtifactFiles`, `DependencyIndex`
- `packages/adapters/sqlite/src/index-repository.ts` — `storyIds`, `storyPath`, `dependencies`
- `packages/ipc-contract/src/contract.ts` — query `stories.dependencies`, commands `stories.addDependency` / `stories.removeDependency`
- `packages/core/src/handlers/dependency-handlers.ts` — `createDependencyHandlers`
- `packages/ui/src/stories/DependencyEditor.tsx` — dependency section for the story drawer (list, add *depends on* with rationale / *related to*, remove, rejection reason incl. cycle path)

Decisions / deviations:
- The story drawer itself belongs to the Kanban board stories; `DependencyEditor` is the self-contained section it embeds.
- Blocking dependencies with a rationale are written as `{id, rationale}` maps, without as plain IDs; removing the last entry deletes the key.

## Test Coverage
- Coverage: `graph.ts` 100.0 % lines, `dependency-service.ts` + `front-matter.ts` 93.2 %, `dependency-handlers.ts` 100.0 %, `DependencyEditor.tsx` 100.0 % (workspace total 98.2 % lines)
- Test files: `packages/domain/test/dependency-graph.test.ts` (11, fast-check properties), `packages/domain/test/dependency-graph.perf.test.ts` (1, sequential: 1,000 stories / 3,000 dependencies < 100 ms), `packages/core/test/story-dependencies.test.ts` (5), `packages/core/test/settings-and-dependencies-ipc.test.ts` (1 of 2), `packages/ui/test/dependency-editor.test.tsx` (3)
- 21 tests
