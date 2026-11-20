---
id: US-097
title: Chat may write through the permission relay
status: done
size: M
epic: Chat changes
---

## Business Value
The chat becomes a real working tool: it may change specifications and code, but only with the user's approval (FR-091, D17).

## Description
As a **SpecForge user**, I want to **allow the chat agent to edit files after I approve each write** so that **I can make quick changes conversationally without losing control**.

## Acceptance Criteria
- [x] AC-1: Chat runs no longer deny all writes: every permission-requiring action goes through PermissionBroker with rules for `appliesTo ∈ {chat, all}`; the Release 1 read-only notice is removed.
- [x] AC-2: Built-in denies stay: story `status` changes, SpecForge-internal paths (`.specforge/**` except specification content), starting runs.
- [x] AC-3: In non-git mode, writes are denied with an explanation while an implementation run is active, and a write-capable chat run holds back implementation starts (FR-116b).
- [x] AC-4: A write to a file in `file_touch` of an active or unmerged story shows *Overlap with US-x* in the prompt.
- [x] AC-5: FR-091 acceptance up to the permission prompt passes with the scripted agent (README typo fix → prompt → allow → file changed).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-035; business_processes.md BP-06; c4_architecture.md ADR-016
- Related requirements: FR-091, FR-032, FR-051
- Release: R2

## Dependencies
- US-078 Per-project specification root

## Implementation Details
Files created / modified:
- `packages/domain/src/permissions/built-in-denies.ts` — the Release 1 read-only deny for chat runs is gone; chat file writes to `.specforge/**` stay built-in denied; story status changes and the non-git rule (no writes while an implementation run is active, FR-116b) apply to chat runs as to other runs
- `packages/application/src/permissions/permission-broker.ts` — relayed writes of non-implementation runs carry `overlaps` (stories whose `file_touch` contains a written file); `packages/core/src/composition.ts` — overlaps from `file_touch` (rows exist only for active or unmerged stories)
- `packages/application/src/specs/chat-service.ts` — chat context: changes and shell commands need the user's approval, changed specifications become Draft, no story moves / status changes / run starts
- `packages/ipc-contract/src/contract.ts` — pending permission `overlaps`
- `packages/core/src/test-agent.ts` — scripted chat: "typo" → Edit README.md (and a Bash build when asked)
- UI: `pending/PermissionPrompt.tsx` ("The project chat asks to use …", *Overlap with US-x* callout), `dashboard/ChatPanel.tsx` (read-only wording removed)

Decisions / deviations:
- "Starting runs" needs no permission rule: the chat has no tool that starts SpecForge runs; recommendations stay cards.
- A write-capable chat run already counted as a workspace writer (`activeWorkspaceWriters`), so it holds back implementation starts in non-git mode; a test now covers it.

## Test Coverage
- Coverage (lines): `built-in-denies.ts` 100 %, `permission-broker.ts` 100 %, `PermissionPrompt.tsx` 100 %, `test-agent.ts` 100 %, `chat-service.ts` 99.2 %, `composition.ts` 91.2 %; overall 95.2 %
- Test files: `packages/domain/test/built-in-denies.test.ts` (3, replacing the R1 read-only test), `packages/application/test/permission-broker.test.ts` (+1, R1 chat test replaced), `chat-service.test.ts` (adapted), `packages/adapters/sqlite/test/execution-store.test.ts` (+1: chat run holds back implementation starts in non-git mode), `packages/core/test/chat-writes-ipc.test.ts` (1: FR-091 up to the prompt — README typo fix → prompt → allow → file changed), `chat-ipc.test.ts` (adapted), `packages/ui/test/pending-decisions.test.tsx` (+1)
- Full suite: 1387 passed; lint, build and layering green
- 7 new tests
