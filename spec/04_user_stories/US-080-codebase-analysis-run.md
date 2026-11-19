---
id: US-080
title: Analyse an adopted codebase into draft specifications
status: ready for development
size: M
epic: Brownfield onboarding
---

## Business Value
Drafting intent, requirements and design from existing code saves hours of manual documentation and gives the guided process a realistic starting point (FR-079).

## Description
As a **SpecForge user**, I want to **let the agent analyse my adopted codebase and draft the current-state specifications** so that **I start from a description of what already exists and only add the change I want**.

## Acceptance Criteria
- [ ] AC-1: The adopt dialog has *Analyse the codebase now* (checked by default); the Intent screen of an adopted project offers *Analyse codebase* while no intent is approved. Both are disabled in limited mode with the usual explanation.
- [ ] AC-2: The `analyze` specification run may read the whole workspace; writes are allowed only into the specification folder, which is snapshotted first (ADR-014). The user may limit the analysis to selected folders, passed in the run context.
- [ ] AC-3: The drafts are `approval: draft`: the intent with an as-is description and a "Desired change" section to complete, a current-state design naming detected languages, frameworks (with versions) and main components, and current-state requirements with FR/NFR IDs.
- [ ] AC-4: The drafts pass the existing spec-run validation and appear in the Keep/Discard review; *Discard* restores the snapshot; afterwards the guided process opens at Intent.
- [ ] AC-5: If the run's computed changes contain paths outside the specification folder, the run fails, lists the paths and restores them; a test with the scripted agent verifies that no source file changes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-030; business_processes.md BP-05; c4_architecture.md ADR-014
- Related requirements: FR-079, FR-007, FR-008
- Release: R2
- Extend the scripted test agent with an `analyze` behaviour (writes the three drafts; a variant also tries to write a source file).

## Dependencies
- US-079 Adopt an existing code folder

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
