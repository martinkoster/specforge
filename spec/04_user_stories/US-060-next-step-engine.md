---
id: US-060
title: Rule-based phase status and next-step engine
status: done
size: M
epic: Dashboard & chat
---

## Business Value
Always tells users what to do next, instantly and predictably (FR-086, ADR-017).

## Description
As a **SpecForge user**, I want **a single recommended next action for my project** so that **I never wonder what to do next**.

## Acceptance Criteria
- [x] AC-1: Pure domain function computes NextStep by the fixed priority (setup → permissions → failed runs → reviews → conflicts → phase action → decisions → start stories → merge).
- [x] AC-2: PhaseStatus per phase derived from artifact approvals and impact flags.
- [x] AC-3: Recomputed on relevant domain events; updates reach the UI within 2 s.
- [x] AC-4: Unit tests cover each priority level.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-017
- Related design document: spec/03_design/functional_design/domain_model.md (NextStep, PhaseStatus)
- Related requirements: FR-080, FR-086, NFR-030
- Release: R1

## Dependencies
- US-037 Implement story state machine and transition rules
- US-026 Approve artifacts (Draft / Approved)

## Implementation Details
Files created / modified:
- `packages/domain/src/project/next-step.ts` — `nextStep()`: pure function with the fixed priority of domain_model.md (setup → permissions → failed/interrupted runs → reviews → conflicts → epic review → decisions in flight → phase action → open decisions → start stories → merge → plan next increment), each step with code, label, target and reason
- `packages/domain/src/project/phase.ts` (existing) — PhaseStatus per phase from approvals and impact flags
- `packages/core/src/composition.ts` — `nextStepOf()` over the indexed state (stories, queue, pending permissions, running spec generations, free slots, unmerged Done stories); `shell.state.nextStep`; event `project.changed` on board transitions, external index changes, spec reviews and merges
- `packages/core/src/project-context.ts` — `onIndexed` hook after external changes are reconciled
- `packages/ui/src/App.tsx` — re-reads the shell state on `project.changed`, `spec.reviewReady`, `capabilities.changed` and finished runs

Decisions / deviations:
- Epic review (5b), in-flight decisions (5c) and open decision items (7) are Release 2 features; their inputs are 0 / empty until those stories exist. The dashboard that displays the step is US-061.

## Test Coverage
- Coverage: `next-step.ts` 100.0 % lines, `phase.ts` 100.0 % (workspace total 96.6 % lines)
- Test files: `packages/domain/test/next-step.test.ts` (12, one per priority level), `packages/core/test/next-step-ipc.test.ts` (1)
- 13 tests
