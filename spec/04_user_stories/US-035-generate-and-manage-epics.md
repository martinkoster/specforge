---
id: US-035
title: Generate and manage epics
status: done
size: M
epic: Specification phases
---

## Business Value
Groups functionality into epics before stories are written (FR-093, FR-094).

## Description
As a **SpecForge user**, I want **the AI to propose epics that I can edit and approve** so that **I review the feature structure before detailed stories**.

## Acceptance Criteria
- [x] AC-1: *Generate epics* writes `spec/04_user_stories/epics/EP-xxx-*.md` with goal, value, linked requirements and epic acceptance criteria.
- [x] AC-2: A coverage strip lists Must-have requirements not covered by any epic.
- [x] AC-3: Epics can be created, edited, merged, split, reordered and deleted (stories move to *No epic* after confirmation).
- [x] AC-4: *Approve epic structure* approves all epics.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-040
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-15-epics-in-the-user-stories-phase
- Related requirements: FR-093, FR-094
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/epic-service.ts` — create, merge, split, reorder (lane order), delete with *No epic* preview, approve all Draft epics, Must-have coverage (`mustHaveRequirementIds`, `uncovered`)
- `packages/application/src/specs/spec-run-service.ts` — epics target (`spec/04_user_stories/epics`) with prompt conventions (goal, value, requirements, acceptance criteria)
- `packages/application/src/specs/spec-validation.ts` — produced epics are checked for linked requirements and the *Goal*, *Value* and *Acceptance criteria* sections (`incomplete` issues)
- `packages/application/src/indexing/parse-artifact.ts`, `packages/adapters/sqlite/src/index-repository.ts` — epic parsing and index
- `packages/ipc-contract/src/contract.ts`, `packages/core/src/composition.ts` — `epics.*` commands and queries
- `packages/ui/src/specs/EpicsPanel.tsx`, `GeneratePanel.tsx`, `SpecificationsArea.tsx` — epic list with coverage strip, create/merge/split/reorder/delete (confirmation), *Approve epic structure*

Decisions / deviations:
- Editing an epic uses the artifact editor (US-025); the panel opens the epic file.

## Test Coverage
- Coverage: `epic-service.ts` 100 % lines, `EpicsPanel.tsx` 94.3 %, `spec-validation.ts` 100 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/application/test/epic-service.test.ts` (8), `packages/ui/test/epics-panel.test.tsx` (8), `packages/core/test/epics-ipc.test.ts` (1), `packages/application/test/spec-run-service.test.ts` (1), `packages/application/test/spec-validation.test.ts` (2 new)
- 20 tests
