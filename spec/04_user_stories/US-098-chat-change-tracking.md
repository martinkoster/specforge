---
id: US-098
title: Track chat changes per message
status: ready for development
size: M
epic: Chat changes
---

## Business Value
Every change the chat makes is attributable and visible in the conversation (NFR-031, ADR-026).

## Description
As a **SpecForge user**, I want to **see under each chat answer which files it changed, with diffs** so that **I always know what the chat did to my project**.

## Acceptance Criteria
- [ ] AC-1: Before each write-capable agent turn a baseline is stored (git: temporary index + `write-tree`, the user's index and working tree untouched; non-git: incremental snapshot) in `chat_message.baseline_ref`.
- [ ] AC-2: After the turn, the workspace is diffed against the baseline; each changed path becomes a `chat_change` — including files changed by approved shell commands (tested with a scripted shell write).
- [ ] AC-3: The answer shows "Changed n files" with expandable diffs and labels *spec (now Draft)* / *code — outside Kanban flow*; ignored files are noted as not tracked.
- [ ] AC-4: Changed specification files become Draft and trigger impact flags (US-086); code changes appear in the activity feed as "Chat change outside Kanban flow".

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-016, ADR-026; data_model.md chat_change; service_design.md ChatService
- Related requirements: FR-091, NFR-031
- Release: R2
- Measure the baseline cost on Windows; budget ~1 s per write-capable turn (ADR-026).

## Dependencies
- US-097 Chat may write through the permission relay
- US-086 Potentially impacted flags

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
