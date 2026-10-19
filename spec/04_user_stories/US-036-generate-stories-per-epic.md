---
id: US-036
title: Generate user stories per epic with dependencies
status: done
size: M
epic: Specification phases
---

## Business Value
Produces implementable stories with acceptance criteria, epic links and validated dependencies (FR-010, FR-063).

## Description
As a **SpecForge user**, I want **stories generated for approved epics including proposed dependencies** so that **I get a ready backlog with a valid dependency graph**.

## Acceptance Criteria
- [x] AC-1: *Generate stories* for all or selected approved epics writes story files with ID, acceptance criteria, requirement links, `epic`, `status: backlog`.
- [x] AC-2: Proposed blocking/related dependencies include a rationale; unknown IDs and cycles are reported.
- [x] AC-3: All new stories appear in Backlog in their epic lane.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-006
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-040
- Related requirements: FR-010, FR-063, FR-094
- Release: R1

## Dependencies
- US-035 Generate and manage epics
- US-040 Manage story dependencies with cycle detection

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — story generation for all or selected **approved** epics (server-side check; Draft/unknown epics and an empty selection are refused; projects without epics generate without), prompt conventions (Backlog, epic, requirements, dependencies with rationale)
- `packages/application/src/specs/spec-validation.ts` — produced stories: rationale for blocking **and related** dependencies, dependencies on unknown stories (`unknown_dependency`), cycles, acceptance criteria and requirement links (`incomplete`)
- `packages/application/src/indexing/parse-artifact.ts` — `related_to` entries may carry a rationale (`{ id, rationale }`), like `depends_on`
- `packages/domain/src/permissions/built-in-denies.ts` — new stories may only start in Backlog
- `packages/ipc-contract/src/contract.ts` — new issue kinds; `packages/core/src/composition.ts` — epics passed to the spec-run service
- `packages/ui/src/specs/GeneratePanel.tsx` — approved epics (all selected) for *Generate stories*

Decisions / deviations:
- data_model.md: `related_to` documented with an optional rationale (plain IDs stay valid); ADR-014 validation scope extended.

## Test Coverage
- Coverage: `spec-validation.ts` 100 % lines, `parse-artifact.ts` 97.3 %, `spec-run-service.ts` covered by 25 unit tests (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/application/test/spec-run-service.test.ts` (5), `packages/application/test/spec-validation.test.ts` (5), `packages/application/test/parse-artifact.test.ts` (1 new), `packages/ui/test/generate-panel.test.tsx` (1), `packages/core/test/story-generation-ipc.test.ts` (1, extended), `packages/domain/test/built-in-denies.test.ts` (2)
- 15 tests
