---
id: US-094
title: Feature completion and withdrawal
status: done
size: S
epic: Feature workflow
---

## Business Value
Features end cleanly — either delivered or withdrawn without leftovers (FR-104).

## Description
As a **SpecForge user**, I want to **see a feature complete automatically and be able to withdraw one** so that **the feature list reflects reality**.

## Acceptance Criteria
- [x] AC-1: A feature becomes *Done* when all stories linked to it are Done; the feature page shows a completion banner.
- [x] AC-2: *Withdraw* (confirmation) discards open change sets, keeps applied changes (with a hint that they can be deprecated) and lists linked not-started stories for a keep/delete decision; *Withdrawn* is terminal.
- [x] AC-3: Status changes are written to the feature intent file and appear in the activity feed.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-043, UC-045; business_processes.md BP-07
- Related requirements: FR-104
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links

## Implementation Details
Files created / modified:
- `packages/application/src/specs/feature-service.ts` — `FeatureEvent` (status changes recorded on every written status), `withdrawPreview` (open change sets, applied changes that stay, not-started stories, why it is blocked: Done, already withdrawn, generation running), `withdraw` (discards open change sets, deletes the chosen not-started stories, writes the terminal *Withdrawn*), `FeatureError`; feature detail carries `events`
- `packages/application/src/specs/delta-service.ts` — `openSets`, `discardOpen` (open items discarded; applied change sets stay)
- `packages/application/src/board/dashboard.ts` — feature status changes in *Recent activity* ("FI-001 Task comments: Done")
- `packages/adapters/sqlite/src/feature-event-repository.ts` (new) — `FeatureEventRepository`; `schema.ts` — migration 28 `feature_event`
- `packages/ipc-contract/src/contract.ts` — `features.withdrawPreview`, `features.withdraw`, feature `events`, activity `runId` nullable / `featureId`; `packages/core/src/composition.ts` — wiring (story files removed via the workspace, re-indexed)
- UI: `features/WithdrawDialog.tsx` (new: confirmation with discarded change sets, kept changes and the deprecation hint, keep/delete per not-started story), `features/FeaturePage.tsx` (completion banner, *Withdraw…*, status changes on the Activity tab), `dashboard/DashboardArea.tsx` (activity keys)

Decisions / deviations:
- *Done* stays derived (US-081 sync); the sync now records each written status change as an event, so completion appears in the activity feed and on the feature page.

## Test Coverage
- Coverage (lines): `feature-service.ts` 100 %, `dashboard.ts` 100 %, `feature-event-repository.ts` 100 %, `delta-service.ts` 96.6 %, `FeaturePage.tsx` 88.7 %, `WithdrawDialog.tsx` 81.5 %; overall 95.2 %
- Test files: `packages/application/test/feature-service.test.ts` (+4), `delta-service.test.ts` (+1), `dashboard.test.ts` (+1), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/core/test/delta-ipc.test.ts` (+2: completion written and in the activity feed; withdrawal discards the change set, deletes the chosen story, is terminal), `packages/ui/test/feature-page.test.tsx` (+4)
- Full suite: 1358 passed; lint, build and layering green
- 13 new tests
