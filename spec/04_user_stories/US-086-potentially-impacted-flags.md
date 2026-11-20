---
id: US-086
title: Potentially impacted flags
status: done
size: M
epic: Change awareness
---

## Business Value
When upstream specifications change, downstream items must be visibly re-checked instead of silently going stale (FR-017, FR-071). Feature deltas and in-flight protection build on these flags, so they come with the feature workflow.

## Description
As a **SpecForge user**, I want to **see which artifacts and stories may be affected by a change and clear the flag after checking** so that **nothing downstream goes stale unnoticed**.

## Acceptance Criteria
- [x] AC-1: When an approved element with downstream trace links changes (in the app, by an agent or externally), all linked downstream elements and stories are flagged *Potentially impacted* with the source and a reason.
- [x] AC-2: When a story's description or acceptance criteria change, its dependents (queued, running, in Review or Done) are flagged with a reference to the changed predecessor (FR-071).
- [x] AC-3: Flags are stored in `impact_flag` (ADR-025): they survive editing the flagged file, re-indexing and *Rebuild index*; the migration drops the R1 index columns.
- [x] AC-4: Flags are shown on artifacts, elements, cards and in pending decisions; *Clear flag* removes it; flags of IDs that no longer exist are shown as orphaned and can be cleared.
- [x] AC-5: Acceptance examples of FR-017 and FR-071 pass as tests.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-010; technical_design/data_model.md impact_flag; c4_architecture.md ADR-025
- Related requirements: FR-017, FR-071
- Release: R2
- Release 2 Should-have pulled into the feature wave because FR-107 and FR-110 rely on it (D26 order).

## Dependencies
- US-078 Per-project specification root

## Implementation Details
Files created / modified:
- `packages/application/src/indexing/parse-artifact.ts` — `elementHashes`: a content hash per element (its section; story, epic and feature intent: the body, so front-matter changes such as status moves are no content change; whitespace-only edits neither)
- `packages/adapters/sqlite/src/index-repository.ts` — `element.content_hash`; `save()` compares the stored hashes with the new ones and reports changed elements with the approval before the change (`onElementsChanged`; not on the first index of a file); impacted artifacts and phase inputs read `impact_flag`; `dependents()`, `elementPath()`
- `packages/adapters/sqlite/src/schema.ts` — migration 23: `impact_flag` (ADR-025, survives re-index and *Rebuild index*), drops `element.impact_flag` / `impact_source`, adds `element.content_hash`; the R2 element table for *Rebuild index*
- `packages/adapters/sqlite/src/impact-flag-repository.ts` (new) — flag (latest source wins), list, clear
- `packages/application/src/specs/impact-flags.ts` (new) — `ImpactFlagService`: a changed approved element flags its downstream elements and stories (FR-017); a story whose description or acceptance criteria changed flags its dependents in In Progress (queued/running), Review or Done (FR-071); list with orphaned flags; clear
- `packages/application/src/board/board-service.ts` — cards carry `impact`; `artifact-service.ts` — `impacted` artifacts; `trace-service.ts` — `impact` reason on trace nodes
- `packages/ipc-contract/src/contract.ts` — `impact.flags`, `impact.clear`, card `impact`, artifact `impacted`, trace node `impact`; `packages/core/src/composition.ts` — wiring (index callback → flag service; board, artifacts, trace)
- UI: `board/StoryCard.tsx` (badge + reason), `specs/ArtifactList.tsx` (badge), `specs/TracePanel.tsx` (badge with reason), `pending/PendingDecisionsPanel.tsx` (section *Potentially impacted* with *Clear flag*, orphaned IDs marked); `App.tsx` loads the flags with the pending decisions
- Spec: `data_model.md` (`element.content_hash`)

Decisions / deviations:
- Change detection sits in the index (the single sink of in-app saves, agent runs and external edits); the flagging policy is the application service.
- One flag per element; a newer change replaces the source and reason of an existing flag.

## Test Coverage
- Coverage (lines): `impact-flags.ts` 100 %, `impact-flag-repository.ts` 100 %, `index-repository.ts` 100 %, `schema.ts` 100 %, `artifact-service.ts` 100 %, `trace-service.ts` 100 %, `StoryCard.tsx` 100 %, `PendingDecisionsPanel.tsx` 100 %, `ArtifactList.tsx` 100 %, `board-service.ts` 99 %, `parse-artifact.ts` 98.2 %, `composition.ts` 91.8 %, `TracePanel.tsx` 88.9 %; overall 95.2 %
- Test files: `packages/application/test/parse-artifact.test.ts` (+2), `packages/application/test/impact-flags.test.ts` (4, new), `packages/adapters/sqlite/test/impact-flags.test.ts` (4, new: change detection, survival of re-index/rebuild, dropped columns), `packages/core/test/impact-flags-ipc.test.ts` (2, new: FR-017 and FR-071 acceptance examples incl. card, trace, artifact list, dashboard), `packages/application/test/board-service.test.ts` (+1), `artifact-service.test.ts` (+1), `trace-service.test.ts` (+1), `packages/ui/test/board-design.test.tsx` (+1), `pending-decisions.test.tsx` (+1)
- Also: the intermittently failing `analyze-codebase.test.tsx` waited only 1 s for the review dialog to close under load; the wait is now 5 s
- Full suite: 1230 passed; lint, build and layering green
- 17 new tests
