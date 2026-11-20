---
id: US-091
title: In-flight protection when applying changes
status: done
size: M
epic: Feature workflow
---

## Business Value
Changes must never silently invalidate queued, running or in-review work (FR-110).

## Description
As a **SpecForge user**, I want to **decide per affected in-flight story how an accepted change applies** so that **running work is not disrupted without my explicit decision**.

## Acceptance Criteria
- [x] AC-1: Before applying a change set (or story changes) linked to queued, running or in-review stories, a dialog lists each affected story with state and change summary and requires a choice per row; *Cancel* applies nothing.
- [x] AC-2: *Continue unchanged*: the change applies, the story is flagged *Potentially impacted*.
- [x] AC-3: *Cancel / dequeue*: a running run is cancelled (normal cancel), a queued story is dequeued; the story returns to Ready.
- [x] AC-4: *Apply in corrections*: for a story in Review the correction feedback is pre-filled; for a running/queued story the feedback is stored as pending and pre-filled into *Request corrections* when it reaches Review — the system never starts a correction itself.
- [x] AC-5: Decisions are stored in `in_flight_decision` and shown on the story and on the feature's Activity tab; FR-110 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-046; user_flows.md UF-18; service_design.md ImpactService
- Related requirements: FR-110, FR-045
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links

## Implementation Details
Files created / modified:
- `packages/application/src/specs/delta-service.ts` — before applying, the accepted elements are traced downstream (trace links) to stories that are queued/running (In Progress) or in Review; without a decision for every one of them `apply` returns `needsDecision` (story, state, sub-state, the changes that reach it) and writes nothing; after applying: *Continue unchanged* flags the story *Potentially impacted*, *Cancel / dequeue* moves it back to Ready (run cancelled / dequeued by the board), *Apply in corrections* stores the change summary as pending correction feedback; every decision is recorded (`InFlightDecisionRecord`)
- `packages/application/src/specs/impact-flags.ts` — `flagDirect`; `board/board-service.ts` — cards carry the latest in-flight decision; `specs/feature-service.ts` — `features.get` returns the feature's decisions
- `packages/adapters/sqlite/src/in-flight-repository.ts` (new), `schema.ts` — migration 26 `in_flight_decision` (incl. pending feedback, cleared when used)
- `packages/ipc-contract/src/contract.ts` — `delta.apply` with `decisions` and the `needsDecision` result, `inflight.feedback`, card `inFlight`, feature `decisions`; `packages/core/src/composition.ts` — wiring (trace links, board move to Ready, impact flags); *Request corrections* clears the pending feedback it used
- UI: `features/ChangesPanel.tsx` — dialog *Stories in flight* with a required choice per story (*Continue unchanged* / *Cancel / dequeue* / *Apply in corrections*), *Cancel* applies nothing; `review/ReviewPanel.tsx` — pending feedback pre-filled into *Request corrections* (the user still sends it; no system-initiated correction); `board/StoryCard.tsx` — "FI-x: <decision>"; `features/FeaturePage.tsx` — decisions on the Activity tab

Decisions / deviations:
- Affected stories are found via the trace links of the accepted elements (spec changes are not in `file_touch`, which records implementation files).
- For a story already in Review, *Apply in corrections* uses the same pending-feedback path as for running stories: the feedback is pre-filled when the user opens *Request corrections*.

## Test Coverage
- Coverage (lines): `in-flight-repository.ts` 100 %, `feature-service.ts` 100 %, `impact-flags.ts` 100 %, `StoryCard.tsx` 100 %, `board-service.ts` 99 %, `ChangesPanel.tsx` 98.5 %, `delta-service.ts` 95.6 %, `FeaturePage.tsx` 92.5 %, `ReviewPanel.tsx` 92 %, `composition.ts` 91.2 %; overall 95.3 %
- Test files: `packages/application/test/delta-service.test.ts` (+3), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/core/test/delta-ipc.test.ts` (+1: FR-110 acceptance — running US-011 needs a decision, *Continue* flags and records it; Review US-012 gets pending feedback), `packages/ui/test/changes-panel.test.tsx` (+1), `review-panel.test.tsx` (+1), `board-design.test.tsx` (+1), `feature-page.test.tsx` (+1)
- Full suite: 1282 passed; lint, build and layering green
- 9 new tests
