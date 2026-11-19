---
id: US-109
title: Usage and cost overview
status: ready for development
size: M
epic: Transparency & environment
---

## Business Value
Token usage and cost are visible per run, phase and project, so users can control spending (FR-090).

## Description
As a **SpecForge user**, I want to **see token usage and cost per run, per phase and per project** so that **I know what the AI work costs**.

## Acceptance Criteria
- [ ] AC-1: Every run (incl. chat and specification runs) shows its usage from `run_result.usage` labelled "as reported by <runtime>", or "n/a".
- [ ] AC-2: The view `v_usage_by_phase` maps runs to phases (intent, requirements, design, stories, implementation, chat); the dashboard usage widget shows the project total and per-phase totals with a time filter.
- [ ] AC-3: The execution view shows usage per run and the filtered total.
- [ ] AC-4: FR-090 acceptance passes ($0.42 + $0.31 → Implementation $0.73).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-037; user_flows.md UF-12 (6); technical_design/data_model.md §2.4
- Related requirements: FR-090
- Release: R2
- Usage is already captured by the adapters and stored in `run_result.usage` (Release 1).

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
