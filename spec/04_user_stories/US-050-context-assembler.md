---
id: US-050
title: Assemble agent context for story runs
status: done
size: M
epic: Agent execution
---

## Business Value
Gives agents everything needed to implement a story consistently within its epic and dependencies (FR-037, FR-068, FR-099).

## Description
As a **SpecForge user**, I want **agents to receive the story, specs, epic and dependency context automatically** so that **implementations match the specification and fit together**.

## Acceptance Criteria
- [x] AC-1: Context includes story + acceptance criteria, linked requirements/design/ADRs (budgeted), epic goal and sibling stories, blocking predecessors' summaries and changed files, concurrently running stories with touched files, project instructions, scope rule and result-schema instruction.
- [x] AC-2: Deterministic truncation within a size budget; the assembled context digest is stored on the run and viewable.
- [x] AC-3: Unit tests verify inclusion of acceptance criteria, epic goal and predecessor summaries.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — contextassembler
- Related requirements: FR-037, FR-068, FR-099
- Release: R1

## Dependencies
- US-020 Parse workspace artifacts into the index
- US-048 Run lifecycle, streaming and persistence

## Implementation Details
Files created / modified:
- `packages/application/src/execution/context-assembler.ts` — `assembleContext` (priority sections: story, project instructions, linked requirements/design elements in ID order, epic goal, siblings, predecessor summaries and touched files, concurrent runs, scope rules, result instruction; budget truncation with `truncated` flag), `extractElementSection`, `DEFAULT_CONTEXT_BUDGET` (60,000 characters)
- `packages/core/src/execution.ts` — `ContextPromptBuilder` (replaces `BasicPromptBuilder`): collects the inputs from the index and the execution store and records the assembled context on the run
- `packages/adapters/sqlite/src/index-repository.ts` — `storyEpicId`, `epicStoryIds`, `linkTargets`, `element`; `execution-store.ts` — `latestSummary`, `activeStories`, `setContextDigest`, `contextDigest`
- `packages/ipc-contract/src/contract.ts` — `runs.context`

Decisions / deviations:
- The budget is measured in characters (no tokenizer dependency); lower-priority sections are truncated first and the run context says so.

## Test Coverage
- Coverage: `context-assembler.ts` 100.0 % lines, `core/src/execution.ts` 96.1 % (workspace total 97.1 % lines)
- Test files: `packages/application/test/context-assembler.test.ts` (5), `packages/core/test/context-ipc.test.ts` (1, MockAdapter, real Git)
- 6 tests
