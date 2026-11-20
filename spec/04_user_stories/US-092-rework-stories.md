---
id: US-092
title: Rework stories for Done functionality
status: done
size: S
epic: Feature workflow
---

## Business Value
Done work stays Done; changes to it become new, traceable rework stories with the right context (FR-109).

## Description
As a **SpecForge user**, I want to **have rework stories that reference the Done stories they change** so that **implemented functionality evolves without reopening finished work**.

## Acceptance Criteria
- [x] AC-1: Story front-matter `reworks: [US-008]` is validated: targets must exist and be Done.
- [x] AC-2: The original story stays Done and shows "Reworked by US-xxx" (card, drawer, traceability panel).
- [x] AC-3: The run context of a rework story includes the original story, its run summary and its changed files (FR-068); a ContextAssembler test verifies it.
- [x] AC-4: Rework stories otherwise behave like normal stories (Backlog, approval, Kanban, runs).

## Technical Notes
- Related design document: spec/03_design/functional_design/domain_model.md Story; technical_design/data_model.md §1.3; service_design.md ContextAssembler
- Related requirements: FR-109, FR-068
- Release: R2

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
Files created / modified:
- `packages/domain/src/story/rework.ts` (new) — `reworkIssues` (targets must exist and be Done, no self-rework) and `reworkedBy` (original → reworking stories)
- `packages/application/src/specs/spec-validation.ts` — issue kind `invalid_rework` for produced stories (statuses from the index view; a produced target uses its produced status); `packages/adapters/sqlite/src/index-repository.ts` — `specIndexView` carries story statuses, board rows carry `reworks`
- `packages/application/src/specs/approval-service.ts` — approving a story with invalid `reworks` targets is refused (`ApprovalError`, IPC `APPROVAL_REFUSED`); `packages/core/src/composition.ts` — story status lookup and error mapping
- `packages/application/src/board/board-service.ts` — cards carry `reworks` and `reworkedBy`; `packages/ipc-contract/src/contract.ts` — card fields, spec issue kind `invalid_rework`
- `packages/application/src/execution/context-assembler.ts` — section "Reworked Done stories" with the original story text, its run summary and changed files; `packages/core/src/execution.ts` — collects them for rework stories
- UI: `board/StoryCard.tsx` ("Reworked by US-xxx" / "Reworks US-xxx"), `board/StoryDrawer.tsx`, `specs/TracePanel.tsx` ("Reworked by" for a traced story with downstream `reworks` links)

Decisions / deviations:
- `reworks` is validated where stories enter the specification: produced files of specification/delta runs and the human *Approve* of a story; a hand-edited Draft story with an invalid target can still be saved (it cannot be approved).

## Test Coverage
- Coverage (lines): `rework.ts` 100 %, `spec-validation.ts` 100 %, `approval-service.ts` 100 %, `context-assembler.ts` 100 %, `index-repository.ts` 100 %, `StoryCard.tsx` 100 %, `StoryDrawer.tsx` 100 %, `board-service.ts` 99 %, `execution.ts` 92.4 %, `TracePanel.tsx` 89.7 %; overall 95.2 %
- Test files: `packages/domain/test/rework.test.ts` (2), `packages/application/test/spec-validation.test.ts` (+2), `approval-service.test.ts` (+2), `board-service.test.ts` (+2), `context-assembler.test.ts` (+2), `packages/adapters/sqlite/test/feature-index.test.ts` (+1), `packages/core/test/context-ipc.test.ts` (extended: FR-109 acceptance — the rework story's run context contains US-001's text and run summary), `packages/ui/test/board-design.test.tsx` (+1), `trace-panel.test.tsx` (+1)
- Full suite: 1358 passed; lint, build and layering green
- 13 new tests
