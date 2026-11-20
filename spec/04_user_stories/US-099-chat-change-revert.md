---
id: US-099
title: Revert chat changes
status: done
size: S
epic: Chat changes
---

## Business Value
Every chat change can be undone from the thread (NFR-031).

## Description
As a **SpecForge user**, I want to **revert the changes of a chat message, or a single file** so that **I can try things conversationally without risk**.

## Acceptance Criteria
- [x] AC-1: *Revert this change* (per message) and per-file revert restore the baseline content; added files are removed, deleted files restored.
- [x] AC-2: If a file changed since the message, a 3-way diff is shown and the revert needs confirmation.
- [x] AC-3: Reverts are recorded (`reverted_at`, activity entry) and the thread shows the reverted state.
- [x] AC-4: NFR-031 check: in a test thread with write-tool and shell changes, 100 % of changes are recorded with thread, message, permission decision and diff, and revert restores the original content (FR-091 acceptance completes).

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-026; service_design.md ChatService
- Related requirements: FR-091, NFR-031
- Release: R2

## Dependencies
- US-098 Track chat changes per message

## Implementation Details
Files created / modified:
- `packages/application/src/specs/chat-service.ts` — `revert({runId} | {changeId}, confirm?)`: restores the baseline content (modified/deleted files rewritten, added files removed); files changed since the message return `needsConfirmation` with baseline, chat and current content; reverted changes get `revertedAt`; `onReverted`
- `packages/application/src/board/dashboard.ts` — "Chat change reverted: <path>" at the time of the revert
- `packages/adapters/sqlite/src/feature-event-repository.ts` — `ChatChangeRepository.setReverted`
- `packages/ipc-contract/src/contract.ts` — `chat.revert`; `packages/core/src/composition.ts` — workspace files, re-index after a revert, thread refresh
- UI: `dashboard/ChatPanel.tsx` — *Revert this change* per message, *Revert* per file, confirmation dialog with "Changed by the chat" and "Changed since" diffs (*Revert anyway*), *Reverted* state

Decisions / deviations:
- The 3-way view shows two unified diffs (baseline → chat, chat → current) instead of a merged three-pane view.

## Test Coverage
- Coverage (lines): `chat-service.ts` 99.2 %, `dashboard.ts` 100 %, `feature-event-repository.ts` 100 %, `ChatPanel.tsx` 91.3 %; overall 95.2 %
- Test files: `packages/application/test/chat-service.test.ts` (+3), `dashboard.test.ts` (+1), `packages/core/test/chat-writes-ipc.test.ts` (+1: NFR-031 — write-tool and shell changes recorded with thread, message, permission decisions and diff; a later edit needs confirmation; the revert restores the original; FR-091 acceptance complete), `packages/ui/test/chat-panel.test.tsx` (+3)
- 8 new tests
