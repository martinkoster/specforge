---
id: US-098
title: Track chat changes per message
status: done
size: M
epic: Chat changes
---

## Business Value
Every change the chat makes is attributable and visible in the conversation (NFR-031, ADR-026).

## Description
As a **SpecForge user**, I want to **see under each chat answer which files it changed, with diffs** so that **I always know what the chat did to my project**.

## Acceptance Criteria
- [x] AC-1: Before each write-capable agent turn a baseline is stored (git: temporary index + `write-tree`, the user's index and working tree untouched; non-git: incremental snapshot) in `chat_message.baseline_ref`.
- [x] AC-2: After the turn, the workspace is diffed against the baseline; each changed path becomes a `chat_change` — including files changed by approved shell commands (tested with a scripted shell write).
- [x] AC-3: The answer shows "Changed n files" with expandable diffs and labels *spec (now Draft)* / *code — outside Kanban flow*; ignored files are noted as not tracked.
- [x] AC-4: Changed specification files become Draft and trigger impact flags (US-086); code changes appear in the activity feed as "Chat change outside Kanban flow".

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-016, ADR-026; data_model.md chat_change; service_design.md ChatService
- Related requirements: FR-091, NFR-031
- Release: R2
- Measure the baseline cost on Windows; budget ~1 s per write-capable turn (ADR-026).

## Dependencies
- US-097 Chat may write through the permission relay
- US-086 Potentially impacted flags

## Implementation Details
Files created / modified:
- `packages/adapters/git/src/workspace-trees.ts` (new) — `WorkspaceTrees`: baseline tree from a temporary index (copy of the user's index, `git add -A`, `write-tree`; the user's index and working tree untouched), `changes` via `diff-tree --raw` (blob SHAs before/after), `content` of a blob, `ignored` (`check-ignore`); `git-client.ts` — `env` option and `object()`
- `packages/adapters/snapshot/src/index.ts` — `SnapshotBaselines` for non-git workspaces: incremental snapshots before/after the turn compared by content hash, content from the object store, excluded paths as untracked
- `packages/application/src/specs/chat-service.ts` — `WorkspaceBaselines` port; baseline before every agent turn (`baselineRef` on the answer), diff afterwards → `ChatChangeRecord` per path (spec or code), untracked files of allowed write tools, `changeDiff`, `onChanges`
- `packages/application/src/board/dashboard.ts` — "Chat change outside Kanban flow: <path>" in the activity feed
- `packages/adapters/sqlite/src/feature-event-repository.ts` — `ChatChangeRepository`; `execution-store.ts` — `chat_message.baseline_ref` / `untracked`; `schema.ts` — migration 31 (`chat_change`)
- `packages/ipc-contract/src/contract.ts` — message `changes` / `untracked`, `chat.changeDiff`; `packages/core/src/composition.ts` — git/non-git baselines, changed spec files → Draft (`markDraftAfterAiChange`) and re-indexed (impact flags)
- UI: `dashboard/ChatPanel.tsx` — "Changed n files" with *spec (now Draft)* / *code — outside Kanban flow*, diffs on demand, "Not tracked (ignored)"

Decisions / deviations:
- Every chat turn is write-capable now, so every turn takes a baseline. Measured on this repository (Windows, 743 tracked files): capture ≈ 0.9–1.1 s warm (2.4 s for the very first capture), diff ≈ 0.85–1.05 s — within the ~1 s budget of ADR-026.
- A file present in the baseline (also if untracked by Git) that the chat edits is a modification (`M`).

## Test Coverage
- Coverage (lines): `workspace-trees.ts` 100 %, `dashboard.ts` 100 %, `feature-event-repository.ts` 100 %, `chat-service.ts` 99.2 %, `ChatPanel.tsx` 91.3 %; overall 95.2 %
- Test files: `packages/adapters/git/test/workspace-trees.test.ts` (1), `packages/adapters/snapshot/test/snapshot.test.ts` (+1), `packages/application/test/chat-service.test.ts` (+3), `dashboard.test.ts` (+1), `packages/adapters/sqlite/test/execution-store.test.ts` (+1), `packages/core/test/chat-writes-ipc.test.ts` (+2: write tool and shell change recorded with diffs and activity; changed spec becomes Draft), `packages/ui/test/chat-panel.test.tsx` (+1)
- 10 new tests
