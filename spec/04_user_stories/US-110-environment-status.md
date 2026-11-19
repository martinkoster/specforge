---
id: US-110
title: Environment status and re-run setup
status: ready for development
size: S
epic: Transparency & environment
---

## Business Value
Users can check and repair their environment at any time instead of only at first start (FR-075).

## Description
As a **SpecForge user**, I want to **see the environment status and re-open the setup wizard from Settings** so that **I can fix problems with the runtime, credentials or Git myself**.

## Acceptance Criteria
- [ ] AC-1: Settings → *Environment* shows runtime (path, version, verified), provider credentials (configured / not configured — never the value), Git (version, capability) and default rules.
- [ ] AC-2: *Re-run health check* refreshes the status and the capabilities (limited mode updates immediately).
- [ ] AC-3: *Open setup wizard* re-opens the wizard with current values.
- [ ] AC-4: FR-075 acceptance passes (missing runtime → status missing, limited mode).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-028; service_design.md SetupService
- Related requirements: FR-075
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
