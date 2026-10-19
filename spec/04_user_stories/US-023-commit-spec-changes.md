---
id: US-023
title: Commit specification changes
status: done
size: S
epic: Projects & workspace
---

## Business Value
Keeps spec and status changes versioned without SpecForge committing silently (FR-072).

## Description
As a **SpecForge user**, I want **a one-click commit of changed spec files** so that **my working copy stays clean and spec history is preserved**.

## Acceptance Criteria
- [x] AC-1: Top bar shows "n spec files changed" when files under `spec/` or `.specforge/` are uncommitted (git mode).
- [x] AC-2: Commit dialog lists the files with diffs and a generated message; only these paths are committed on the main workspace's current branch.
- [x] AC-3: Failing Git hooks show their output and nothing is committed.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-039
- Related requirements: FR-072, FR-116
- Release: R1 (Should Have)

## Dependencies
- US-019 Open an existing project and detect VCS mode

## Implementation Details
Files created / modified:
- `packages/adapters/git/src/spec-commits.ts` — `SpecCommits`: `status` (porcelain v2, spec/ and .specforge/ only, incl. untracked), `diff` (vs. HEAD; new files as fully added), `commit` (exactly the given spec paths on the current branch; a failing hook resets the index of these paths and returns its output)
- `packages/application/src/specs/spec-commit-message.ts` — generated, editable message (areas in the subject, files in the body)
- `packages/core/src/composition.ts` — `specCommit.status`, `specCommit.diff`, `specCommit.commit` (git mode only)
- `packages/ui/src/shell/AppShell.tsx` — top-bar indicator "n spec files changed"; `packages/ui/src/shell/CommitSpecDialog.tsx` — files with diffs, message, Commit / Cancel, hook output

Decisions / deviations:
- Paths outside spec/** and .specforge/** are refused by the Git adapter itself, not only by the UI.

## Test Coverage
- Coverage: `spec-commits.ts` 100.0 % lines, `CommitSpecDialog.tsx` 94.4 %, `spec-commit-message.ts` 100.0 % (workspace total 96.6 % lines)
- Test files: `packages/adapters/git/test/spec-commits.test.ts` (6, incl. a failing pre-commit hook), `packages/application/test/spec-commit-message.test.ts` (2), `packages/core/test/spec-commit-ipc.test.ts` (1), `packages/ui/test/spec-commit.test.tsx` (4)
- 13 tests
