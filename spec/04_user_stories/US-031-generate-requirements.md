---
id: US-031
title: Generate requirements from the intent
status: done
size: S
epic: Specification phases
---

## Business Value
Produces structured, traceable requirements from the approved intent (FR-007).

## Description
As a **SpecForge user**, I want **to generate functional and non-functional requirements and constraints** so that **I don't have to write them from scratch**.

## Acceptance Criteria
- [x] AC-1: *Generate requirements* runs a generation into `spec/02_requirements/` with ID conventions (FR-/NFR-/CON-).
- [x] AC-2: Generated files are Draft, indexed and shown in the review dialog.
- [x] AC-3: SpecForge itself makes no model-API call (only the agent process is invoked).

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-006
- Related requirements: FR-007, CON-004
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — phase guidance for requirements generation: functional_requirements.md / non_functional_requirements.md / constraints.md, IDs `FR-001` / `NFR-001` / `CON-001` continuing after existing IDs, Description / Source / Priority (MoSCoW) / Release / Acceptance
- `tooling/test/no-model-api.test.ts` — CON-004 guard: no workspace package depends on a model-API SDK; the Agent SDK only in the Claude Code adapter
- Generation, Draft marking, indexing and the review dialog come from US-027 (`specs.generate`, Generate panel in the Specifications area)

Decisions / deviations:
- SpecForge itself only starts the agent process; the guard test fails the build if a model-API SDK is ever added as a dependency.

## Test Coverage
- Coverage: `spec-run-service.ts` 96.5 % lines (workspace total 95.8 % lines)
- Test files: `packages/application/test/spec-run-service.test.ts` (1 new), `tooling/test/no-model-api.test.ts` (1)
- 2 tests
