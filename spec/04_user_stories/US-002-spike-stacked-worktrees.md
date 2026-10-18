---
id: US-002
title: Spike S2: validate stacked worktrees and integration merges
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Confirms that per-story worktrees, stacked branches and temporary integration merges work reliably across OSes (ADR-010) before the execution-space manager is built.

## Description
As a **SpecForge developer**, I want **a scripted prototype that creates worktrees, stacks branches on unmerged predecessors and detects conflicts** so that **we can confirm ADR-010 and know the Git edge cases**.

## Acceptance Criteria
- [x] AC-1: Script creates a worktree per story under a short app-data path and a branch `specforge/<storyId>` from the base branch.
- [x] AC-2: For one unmerged predecessor the branch is created from the predecessor branch; for two, from a temporary integration commit built in a scratch worktree.
- [x] AC-3: A conflicting integration merge is detected, reported with the conflicting files, and leaves no scratch worktree behind.
- [x] AC-4: `git diff <base_ref>..<branch>` shows only the story's own changes in the stacked case.
- [x] AC-5: Path-length behaviour on Windows is tested with a deep repository; findings and a go/no-go for ADR-010 are documented in `docs/spikes/S2-stacked-worktrees.md`.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-010
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-016
- Related requirements: FR-038, FR-067, FR-115; CON-008
- Use `execFile` with argument arrays only (NFR-011).
- Release: R1

## Dependencies
- None

## Implementation Details
Files created:
- `spikes/s2/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` — standalone throwaway spike package
- `spikes/s2/src/worktrees.ts` — `prepareStoryWorktree()` (base selection, `specforge/<storyId>[-n]` branch, worktree under short root, stacking, integration commit, conflict reporting), `isMerged()`, `changedFiles()`, `worktreeList()`
- `spikes/s2/scripts/bench.ts` — timing benchmark per variant; results in `spikes/s2/results/timings-win32.json` and `timings-linux.json`
- `docs/spikes/S2-stacked-worktrees.md` — findings and recommendation (**Go** for ADR-010 with amendments)

Decisions / findings:
- Two integration strategies implemented and tested: scratch worktree (Git >= 2.30) and `git merge-tree --write-tree` + `commit-tree` (Git >= 2.38, no checkout, ~26 % faster on Windows). Recommendation: merge-tree as default → **raises minimum Git version to 2.38** (ADR-010/CON-007 say 2.30; needs product-owner decision).
- All Git calls pass `-c core.longpaths=true`; paths > 260 characters work on Windows.
- Windows is ~100× slower than Linux per Git call (process start / antivirus): integration ≈ 2.8 s vs 29 ms → minimise Git invocations to stay within NFR-004.
- Worktrees follow the user's `core.autocrlf`; tests pin it to `false` for determinism.
- Verified on Windows 11 (Git 2.56) and Ubuntu 26.04 on WSL2 (Git 2.53).

## Test Coverage
- Coverage (`spikes/s2/src/worktrees.ts`): **98.5 % lines**, 93.8 % statements, 86.1 % branches, 89.5 % functions
- Test files: `spikes/s2/test/worktrees.test.ts`, `spikes/s2/test/docs.test.ts` (helpers in `spikes/s2/test/helpers.ts`)
- 13 tests (12 integration tests against temporary Git repositories incl. both integration strategies, 1 documentation test); all passing on Windows and Linux
