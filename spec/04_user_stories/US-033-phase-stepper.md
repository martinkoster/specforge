---
id: US-033
title: Guide users through phases with a stepper
status: done
size: M
epic: Specification phases
---

## Business Value
Gives users a clear path Intent → Requirements → Design → User stories → Kanban (FR-080, FR-081).

## Description
As a **SpecForge user**, I want **a stepper that shows where I am and what to do next in each phase** so that **I always know the next step**.

## Acceptance Criteria
- [x] AC-1: Stepper shows the five phases with derived status (not started / in progress / awaiting approval / approved / impacted) and the recommended phase.
- [x] AC-2: Each phase screen shows the loop Write/Generate → Quality check → Review & refine → Approve with the current step highlighted.
- [x] AC-3: Opening a phase with unapproved inputs shows a soft-gate warning (continue / go back).
- [x] AC-4: Kanban step is enabled once stories exist.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-031
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-09-guided-phases
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-017
- Related requirements: FR-080, FR-081
- PhaseStatus is a pure domain function (ADR-017).
- Release: R1

## Dependencies
- US-026 Approve artifacts (Draft / Approved)

## Implementation Details
Files created / modified:
- `packages/domain/src/project/phase.ts` — `phaseStepper` (status per phase, recommended phase, Kanban enabled once stories exist), `phaseLoopStep` (write → quality check → review & refine → approve), `unapprovedInputs` (soft gate)
- `packages/core/src/composition.ts` — `phases.status` (generations in progress, completed quality checks per phase)
- `packages/ui/src/shell/PhaseStepper.tsx` — stepper with status, recommendation, loop of the current phase and the soft-gate dialog (Continue / Go back); shown above the Intent, Specifications and Kanban areas; `SpecificationsArea` filters artifacts by the chosen phase

Decisions / deviations:
- PhaseStatus and the loop step are pure domain functions (ADR-017); the loop step "quality check" is complete once a quality check of the phase's artifacts ran (US-029).

## Test Coverage
- Coverage: `phase.ts` 100.0 % lines, `PhaseStepper.tsx` 100.0 % (workspace total 95.8 % lines)
- Test files: `packages/domain/test/project-phase.test.ts` (3 new), `packages/core/test/next-step-ipc.test.ts` (phases.status assertions), `packages/ui/test/phase-stepper.test.tsx` (3)
- 6 tests
