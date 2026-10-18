---
id: US-062
title: Read-only project chat with threads
status: done
size: M
epic: Dashboard & chat
---

## Business Value
Lets users ask questions about their project conversationally (FR-089, FR-092).

## Description
As a **SpecForge user**, I want **to chat with the agent about my project in resumable threads** so that **I get answers and suggestions without leaving SpecForge**.

## Acceptance Criteria
- [x] AC-1: Chat panel on the dashboard (expandable) with thread list, *New thread*, streamed answers and collapsed tool-use lines.
- [x] AC-2: Each thread is a resumable agent session in the main workspace with project context; threads survive restarts.
- [x] AC-3: All write requests are denied with an explanation (R1); story transitions/run starts proposed by the agent appear only as recommendation cards.
- [x] AC-4: Input is disabled in limited mode.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-035
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-13-project-chat
- Related design document: `spec/03_design/technical_design/service_design.md` — chatservice
- Related requirements: FR-089, FR-092, FR-023
- Write capability is Release 2 (FR-091).
- Release: R1

## Dependencies
- US-052 Permission broker and policy evaluation
- US-048 Run lifecycle, streaming and persistence
- US-061 Project dashboard

## Implementation Details
Files created / modified:
- `packages/application/src/specs/chat-service.ts` — threads as resumable `chat` sessions in the main workspace with project context; recommendations split from the answer and stored (never executed); denied requests are explained in the answer and marked in the tool uses
- `packages/adapters/sqlite/src/schema.ts` (migration 18), `execution-store.ts` — `chat_thread`, `chat_message`
- `packages/domain/src/permissions/built-in-denies.ts` — chat runs are read-only
- `packages/ipc-contract/src/contract.ts`, `packages/core/src/composition.ts` — `chat.*`, `chat.message` event
- `packages/ui/src/dashboard/ChatPanel.tsx`, `DashboardArea.tsx` — expandable panel, threads, *New thread*, streamed answers, collapsed tool uses, recommendation cards, input disabled in limited mode

Decisions / deviations:
- Write capability is Release 2 (FR-091).

## Test Coverage
- Coverage: `chat-service.ts` 98.5 % lines, `ChatPanel.tsx` 89.8 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/application/test/chat-service.test.ts` (7), `packages/ui/test/chat-panel.test.tsx` (4), `packages/core/test/chat-ipc.test.ts` (1, restart); limited mode end to end: `packages/main/test/scenarios.e2e.test.ts`
- 12 tests
