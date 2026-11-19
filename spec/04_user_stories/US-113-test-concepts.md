---
id: US-113
title: Generate test concepts
status: ready for development
size: M
epic: Specification phases
---

## Business Value
Test concepts describe how requirements and stories will be validated, before implementation starts (FR-011).

## Description
As a **SpecForge user**, I want to **generate test concepts linked to requirements and stories** so that **validation is planned together with the specification**.

## Acceptance Criteria
- [ ] AC-1: The Specifications area offers *Generate test concepts* (target `test_concepts`), writing `05_test_concepts/*.md` with `TC-xxx` scenarios and expected outcomes.
- [ ] AC-2: Validation rejects scenarios without a reference to at least one requirement or story ID; references become trace links.
- [ ] AC-3: Test concepts follow the normal Keep/Discard review, quality check and approval.
- [ ] AC-4: FR-011 acceptance passes with the scripted agent.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-006; technical_design/data_model.md §1.1
- Related requirements: FR-011
- Release: R2

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
