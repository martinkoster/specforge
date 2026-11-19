---
id: US-114
title: Release 2 end-to-end scenarios and capture-effort checks
status: ready for development
size: M
epic: Quality & release readiness
---

## Business Value
The main Release 2 journeys are protected by end-to-end tests on all three OSes (NFR-032).

## Description
As a **product owner**, I want to **have the Release 2 journeys covered end to end with the scripted agent** so that **regressions in adoption, features and chat changes are caught in CI**.

## Acceptance Criteria
- [ ] AC-1: E2E: adopt a sample repository with an RSpec-style `spec/` folder into `docs/spec`, analyse it, keep the drafts; no source file changed.
- [ ] AC-2: E2E: add a feature through the wizard (AI review, clarify, save & approve) → impact → delta requirements accepted → epic & stories → stories on the board, with one in-flight decision.
- [ ] AC-3: E2E: chat edits a file after a permission prompt, the thread shows the diff, *Revert* restores it.
- [ ] AC-4: NFR-032 checks: capturing an idea takes ≤ 2 interactions from any screen; the trace part of the impact analysis is shown in < 2 s on the reference project.
- [ ] AC-5: All scenarios run in CI on Windows, macOS and Linux.

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §5
- Related requirements: NFR-032, NFR-031, FR-079, FR-103, FR-091
- Release: R2

## Dependencies
- US-080 Analyse an adopted codebase into draft specifications
- US-094 Feature completion and withdrawal
- US-099 Revert chat changes
- US-095 Idea inbox

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
