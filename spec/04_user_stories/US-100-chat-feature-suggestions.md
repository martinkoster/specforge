---
id: US-100
title: Turn chat conversations into features and ideas
status: done
size: S
epic: Chat changes
---

## Business Value
Ideas often come up while chatting; they should flow straight into the feature workflow (FR-102, FR-111).

## Description
As a **SpecForge user**, I want to **create a feature intent or an idea from a chat conversation** so that **nothing discussed in the chat gets lost**.

## Acceptance Criteria
- [x] AC-1: When the agent's structured result suggests new functionality, the thread shows a card "Create a feature intent from this conversation?" that opens the feature wizard pre-filled with the agent's summary.
- [x] AC-2: Each chat message has *Save as idea*, which captures the message text (editable) into the idea inbox with source *chat*.
- [x] AC-3: Neither action changes files until the user saves in the wizard or the idea popover.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-13 (3b), UF-19; use_cases.md UC-043, UC-047
- Related requirements: FR-102, FR-111
- Release: R2

## Dependencies
- US-082 Add feature: entry points and wizard (describe, save, resume)
- US-095 Idea inbox

## Implementation Details
Files created / modified:
- `packages/application/src/specs/chat-service.ts` — the chat context asks for a `{"type":"feature","text":"<summary>"}` recommendation when the conversation describes unspecified functionality
- UI: `dashboard/ChatPanel.tsx` — card "Create a feature intent from this conversation?" with *Create feature intent*, *Save as idea* on every message; `features/CaptureIdeaDialog.tsx` — `initialText` (editable); `features/FeatureWizard.tsx` — `initialText`; `dashboard/DashboardArea.tsx`, `App.tsx` — wizard / idea popover opened from the chat (source *chat*)

Decisions / deviations:
- Both actions only open the wizard or the idea popover; files change only when the user saves there (AC-3).

## Test Coverage
- Coverage (lines): `chat-service.ts` 99.2 %, `CaptureIdeaDialog.tsx` 85 %, `FeatureWizard.tsx` 94 %, `ChatPanel.tsx` 91.3 %; overall 95.2 %
- Test files: `packages/application/test/chat-service.test.ts` (+1), `packages/ui/test/chat-panel.test.tsx` (+2), `idea-inbox.test.tsx` (+1), `feature-wizard.test.tsx` (+1)
- 5 new tests
