---
id: US-032
title: Generate the design including ADRs
status: done
size: S
epic: Specification phases
---

## Business Value
Produces architecture, components, interfaces, data model and ADRs linked to requirements (FR-008, FR-009).

## Description
As a **SpecForge user**, I want **to generate design documents and architecture decision records** so that **implementation is guided by explicit design and decisions**.

## Acceptance Criteria
- [x] AC-1: *Generate design* writes design files into `spec/03_design/` referencing requirement IDs.
- [x] AC-2: At least one ADR with context, decision, alternatives and consequences is produced when decisions are needed.
- [x] AC-3: Files are Draft and reviewed via the review dialog.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-006
- Related requirements: FR-008, FR-009
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — phase guidance for design generation: functional_design/ and technical_design/, every element references the requirement IDs it addresses, decisions as `### ADR-001: …` with Context, Decision, Alternatives and Consequences
- Draft marking and the review dialog come from US-027

Decisions / deviations:
- Whether an ADR is needed is the agent's judgement; the prompt requires one for every needed architectural decision.

## Test Coverage
- Coverage: `spec-run-service.ts` 96.5 % lines (workspace total 95.8 % lines)
- Test files: `packages/application/test/spec-run-service.test.ts` (1 new)
- 1 tests
