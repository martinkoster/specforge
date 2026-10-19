---
id: US-030
title: Refine an artifact with AI instructions
status: done
size: S
epic: Specification phases
---

## Business Value
Lets users iterate on specs with targeted AI changes (FR-014).

## Description
As a **SpecForge user**, I want **to give an instruction and get a proposed change to an artifact** so that **I can improve specs quickly while reviewing each change**.

## Acceptance Criteria
- [x] AC-1: *Refine with AI* on an artifact or section accepts a free-text instruction and starts a `refine` run.
- [x] AC-2: The result is shown as a diff; Accept writes it and sets the artifact to Draft; Discard leaves it unchanged.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-008
- Related requirements: FR-014
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — `refine({path, section?, instruction})`: `refine` run whose write scope is the artifact (snapshot of its folder), optional section restriction in the prompt; overlapping undecided runs (folder vs. file) are refused
- `packages/adapters/sqlite/src/execution-store.ts` — `openSpecReviews`
- `packages/core/src/composition.ts` — `specs.refine`
- `packages/ui/src/specs/ArtifactAiPanel.tsx` — *Refine with AI* (section select, instruction) with the Review-changes dialog; Accept = Keep (artifact becomes Draft), Discard restores it; shown next to the editor in the Specifications and Intent areas
- `packages/application/src/specs/agent-run.ts` — shared agent-run helper (events, timers, permission relay, session resume) extracted from the spec run service

Decisions / deviations:
- A refine proposal is a specification run with the same validation and Keep / Discard / Ask-agent-to-fix review as generations (UC-008).

## Test Coverage
- Coverage: `spec-run-service.ts` 96.5 % lines, `agent-run.ts` 95.0 %, `ArtifactAiPanel.tsx` 92.9 % (workspace total 95.8 % lines)
- Test files: `packages/application/test/spec-run-service.test.ts` (4 new), `packages/ui/test/artifact-ai.test.tsx` (3 of 7)
- 7 tests
