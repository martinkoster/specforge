---
id: US-099
title: Revert chat changes
status: ready for development
size: S
epic: Chat changes
---

## Business Value
Every chat change can be undone from the thread (NFR-031).

## Description
As a **SpecForge user**, I want to **revert the changes of a chat message, or a single file** so that **I can try things conversationally without risk**.

## Acceptance Criteria
- [ ] AC-1: *Revert this change* (per message) and per-file revert restore the baseline content; added files are removed, deleted files restored.
- [ ] AC-2: If a file changed since the message, a 3-way diff is shown and the revert needs confirmation.
- [ ] AC-3: Reverts are recorded (`reverted_at`, activity entry) and the thread shows the reverted state.
- [ ] AC-4: NFR-031 check: in a test thread with write-tool and shell changes, 100 % of changes are recorded with thread, message, permission decision and diff, and revert restores the original content (FR-091 acceptance completes).

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-026; service_design.md ChatService
- Related requirements: FR-091, NFR-031
- Release: R2

## Dependencies
- US-098 Track chat changes per message

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
