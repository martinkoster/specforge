---
id: US-108
title: Show execution boundaries and model per run
status: ready for development
size: S
epic: Transparency & environment
---

## Business Value
Users understand what leaves their machine and which model did the work (FR-057).

## Description
As a **SpecForge user**, I want to **see what the agent runtime sends to its provider and which model each run used** so that **I can judge privacy and cost implications**.

## Acceptance Criteria
- [ ] AC-1: The Claude Code settings show the external-provider notice ("Claude Code sends prompts and code to its configured AI provider") and the configured provider.
- [ ] AC-2: Every run record shows provider and model as reported by the adapter, or "n/a".
- [ ] AC-3: FR-057 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-025 (4); service_design.md AgentAdapter
- Related requirements: FR-057
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
