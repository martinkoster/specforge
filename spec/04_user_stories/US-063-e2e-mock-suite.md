---
id: US-063
title: End-to-end test suite with MockAdapter
status: done
size: L
epic: Quality & release readiness
---

## Business Value
Proves the complete workflow automatically on all OSes (NFR-016, NFR-023, NFR-025).

## Description
As a **SpecForge developer**, I want **automated E2E tests for the main workflows** so that **regressions in the end-to-end flow are caught before release**.

## Acceptance Criteria
- [x] AC-1: Playwright-for-Electron suite covers: setup → create project → intent → generate specs/epics/stories → move stories → parallel runs + queue → permission prompt → review → approve.
- [x] AC-2: Scenarios for non-git mode, cancel, crash recovery (kill core) and limited mode.
- [x] AC-3: Suite runs in CI on all three OSes (xvfb on Linux).

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §5
- Related requirements: NFR-016, NFR-023, NFR-025
- L: covers several workflows; can be split per scenario if needed.
- Release: R1

## Dependencies
- US-061 Project dashboard
- US-058 Approve or reject an implementation
- US-043 Show queued stories and queue controls
- US-031 Generate requirements from the intent

## Implementation Details
Files created / modified:
- `packages/core/src/test-agent.ts` — scripted agent for test mode (`SPECFORGE_MOCK_AGENT=1`): spec artifacts, stories, implementation writes through the permission path; `slow`, `hang` and `stream` stories
- `packages/main/test/e2e-support.ts` — shared helpers (`createProject`, `allowPending`, `moveTo`, `waitForColumn`, `columnOf`, `storyFile`)
- `packages/main/test/workflow.e2e.test.ts` — setup wizard → project → intent → requirements, epics, stories → board → parallel runs + queue → permission prompt → review → approve (queued dependent starts)
- `packages/main/test/scenarios.e2e.test.ts` — non-git mode (reject with restore), cancel, crash recovery (core killed during a run → interrupted → recover), limited mode
- `packages/ui/src/board/KanbanArea.tsx`, `packages/ui/src/App.tsx` — fix found by the suite: the board re-reads when the shell state changes (`refreshKey`), so run progress shows without reopening the board
- `.github/workflows/ci.yml` — `pnpm test:e2e` on Windows/macOS, `xvfb-run -a pnpm test:e2e` on Linux

Decisions / deviations:
- AC-3: the workflow runs the suite on all three OSes; the first GitHub Actions run is pending with US-008 (needs a remote).

## Test Coverage
- Coverage: `test-agent.ts` 100 % lines; the E2E suite itself is not part of the coverage run (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/main/test/workflow.e2e.test.ts` (1), `packages/main/test/scenarios.e2e.test.ts` (4), `packages/core/test/test-agent.test.ts` (3), `packages/ui/test/merge-check.test.tsx` (1 new, board refresh)
- 9 tests
