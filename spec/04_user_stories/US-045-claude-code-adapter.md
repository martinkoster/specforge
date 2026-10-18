---
id: US-045
title: Implement the Claude Code adapter
status: ready for development
size: M
epic: Agent execution
---

## Business Value
Connects SpecForge to the user's Claude Code installation for real runs (FR-029).

## Description
As a **SpecForge user**, I want **SpecForge to run Claude Code for my stories and spec generation** so that **I never have to invoke the CLI manually**.

## Acceptance Criteria
- [ ] AC-1: Adapter maps Agent SDK messages to adapter events (session id, output, tool use/results, usage, final result) per the ADR-006 mapping.
- [ ] AC-2: `canUseTool` routes to the PermissionBroker and awaits the decision without timeout; abort and resume work as specified.
- [ ] AC-3: Provider credentials are injected only into the agent environment; `--bare`-like modes are not used.
- [ ] AC-4: Contract test suite passes against the real adapter (opt-in, requires credentials) on all three OSes.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — agentadapter-claudecodeadapter
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-006
- Related requirements: FR-029, FR-034, FR-045; ADR-006, ADR-007
- Implements the outcome of spike US-001.
- Release: R1

## Dependencies
- US-001 Spike S1: validate Claude Code integration via Agent SDK
- US-044 Define AgentAdapter port and MockAdapter
- US-011 Store secrets in OS credential store and redact them

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
