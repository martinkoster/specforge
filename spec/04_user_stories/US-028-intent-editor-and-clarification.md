---
id: US-028
title: Write the intent and clarify it with AI
status: done
size: M
epic: Specification phases
---

## Business Value
Turns a rough idea into a clear intent with documented answers and assumptions (FR-005, FR-006).

## Description
As a **SpecForge user**, I want **to write my intent from a template and answer AI clarification questions** so that **ambiguities are resolved before requirements are generated**.

## Acceptance Criteria
- [x] AC-1: New projects offer an intent template; the intent is saved as `spec/01_intent/intent.md`.
- [x] AC-2: *Analyse intent* starts a `clarify` run returning questions, ambiguities, alternatives and assumptions shown as cards.
- [x] AC-3: Answers resume the same agent session (multi-turn); finishing proposes a "Clarified decisions" section as a diff to accept.
- [x] AC-4: Cancelling keeps answers given so far as a draft.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-004
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-005
- Related requirements: FR-005, FR-006
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/clarification-service.ts` — `INTENT_TEMPLATE`; `ClarificationService`: read-only `clarify` rounds returning questions / ambiguities / alternatives / assumptions (`parseClarification`), answers resume the same agent session, `finish` proposes a "## Clarified decisions" section via a refine proposal, `cancel` keeps the answers (`saveDraft`)
- `packages/adapters/sqlite` — migration 17 (`clarification`), `saveClarification`, `clarification`, `latestClarification`
- `packages/core/src/composition.ts` — `intent.create` (template, refused if the intent exists), `clarify.start` / `answer` / `saveDraft` / `finish` / `cancel` / `current`, event `clarify.updated`
- `packages/ui/src/intent/IntentArea.tsx` — template offer, editor with approval, AI panel (quality check / refine); `ClarificationPanel.tsx` — cards per item type (text answer, option choice, accept/reject assumption), Submit, Finish → review dialog, Cancel / Save draft

Decisions / deviations:
- The intent template is offered in the Intent area (it is not written automatically when a project is created).

## Test Coverage
- Coverage: `clarification-service.ts` 94.1 % lines, `ClarificationPanel.tsx` 90.7 %, `IntentArea.tsx` 82.8 % (workspace total 95.8 % lines)
- Test files: `packages/application/test/clarification-service.test.ts` (9), `packages/adapters/sqlite/test/execution-store.test.ts` (1 new), `packages/core/test/clarify-ipc.test.ts` (1), `packages/ui/test/intent-area.test.tsx` (8)
- 19 tests
