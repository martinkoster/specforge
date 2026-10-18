---
id: US-066
title: Manual MVP acceptance test with real Claude Code
status: ready for development
size: M
epic: Quality & release readiness
---

## Business Value
Confirms the MVP success criterion with the real agent on every OS (intent §8, NFR-016).

## Description
As a **product owner**, I want **the MVP acceptance scenario executed with real Claude Code on Windows, macOS and Linux** so that **we know the MVP works for real users**.

## Acceptance Criteria
- [ ] AC-1: Checklist for the intent §8 acceptance scenario is documented in `docs/acceptance/mvp.md`.
- [ ] AC-2: Scenario completes successfully in ≥ 9 of 10 attempts per OS (SpecForge-attributable failures count).
- [ ] AC-3: Findings are recorded as new stories or defects.

## Technical Notes
- Related design document: spec/01_intent/intent.md §8
- Related requirements: NFR-016
- Release: R1

## Dependencies
- US-063 End-to-end test suite with MockAdapter
- US-045 Implement the Claude Code adapter
- US-009 Build unsigned installers for all three OSes

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
