---
id: US-037
title: Implement story state machine and transition rules
status: done
size: M
epic: Kanban & dependencies
---

## Business Value
Enforces human control over story transitions in the domain, not just the UI (FR-021, CON-005).

## Description
As a **SpecForge user**, I want **only legal, correctly initiated story transitions to be possible** so that **agents can never start work or mark it done on their own**.

## Acceptance Criteria
- [x] AC-1: Pure domain state machine implements the FR-021 transition table including initiator (human/system) and the In Progress sub-states with their exits.
- [x] AC-2: Backlog → Ready requires the story to be Approved; illegal moves return an explanation.
- [x] AC-3: Transitions initiated by an agent or not matching the initiator are rejected (FR-023).
- [x] AC-4: Exhaustive unit tests (≥ 90 % coverage) cover every allowed and forbidden transition.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-014
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-015
- Related design document: spec/03_design/functional_design/domain_model.md (Story)
- Related requirements: FR-019, FR-021, FR-023, FR-025
- Release: R1

## Dependencies
- US-004 Set up monorepo, tooling and layering rules

## Implementation Details
Files created / modified:
- `packages/domain/src/story/state-machine.ts` — board statuses, execution sub-states, 19 commands with initiator and allowed source states (FR-021), `applyStoryCommand()`, `moveStory()` (drag & drop → command), `isValidStoryState()`
- `packages/domain/src/index.ts` — exports the state machine
- `packages/domain/test/story-state-machine.test.ts`

Decisions:
- Transitions are modelled as named commands (e.g. `startImplementation`, `completeRun`, `cancelRun`) rather than raw target states, so each FR-021 row and each sub-state exit has one explicit rule with its initiator.
- The test encodes the FR-021 table independently of the implementation and checks every valid state × command × initiator combination.
- Agents can never change story state (FR-023); wrong initiators and invalid states are rejected with explanations.

## Test Coverage
- Coverage (`packages/domain/src`): **100 %** lines, statements, branches and functions
- Test file: `packages/domain/test/story-state-machine.test.ts`
- 87 tests (table-driven, exhaustive over states × commands × initiators)
