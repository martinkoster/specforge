---
id: US-046
title: Prepare isolated worktree execution spaces
status: done
size: L
epic: Agent execution
---

## Business Value
Isolates each story run in its own branch and worktree, stacked on unmerged predecessors (FR-038, FR-067).

## Description
As a **SpecForge user**, I want **every story to run isolated from my working copy and from other runs** so that **parallel agents never overwrite my or each other's changes**.

## Acceptance Criteria
- [x] AC-1: Base selection per ADR-010: base branch, single predecessor branch, or temporary integration commit (built via `git merge-tree --write-tree` + `commit-tree` on Git ≥ 2.38, scratch-worktree fallback on 2.30–2.37); conflicts set Blocked (conflict) and create a pending decision.
- [x] AC-2: Branch `specforge/<storyId>[-n]` and worktree under the configured short root are created; base_ref and stacked_on are recorded.
- [x] AC-3: Retry with "reuse branch" checks out the existing branch in a new worktree; `git worktree prune` runs at startup.
- [x] AC-4: Uncommitted changes in the main working copy trigger the FR-116c warning.
- [x] AC-5: All Git calls use execFile with argument arrays; integration tests with temp repos cover stacking and conflicts.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-010
- Related design document: `spec/03_design/technical_design/service_design.md` — executionspacemanager
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-016
- Related requirements: FR-038, FR-053, FR-067, FR-116, NFR-011
- L: base selection, stacking and conflict handling are one cohesive unit; flag for review.
- Release: R1

## Dependencies
- US-002 Spike S2: validate stacked worktrees and integration merges
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/adapters/git/` (new package `@specforge/git`): `src/git-client.ts` (`GitClient`: execFile with argument arrays and `core.longpaths=true`, `run`/`raw`/`test`, `version()`, `parseGitVersion()`, `GitError`), `src/execution-spaces.ts` (`ExecutionSpaceManager.prepare()` with base selection, `strategyFor()` (merge-tree from Git 2.38, scratch worktree before), Blocked (conflict) result with pending decision, `reuseBranch` retry, uncommitted-changes warning, `prune()`, `remove()`, `changedFiles()`; `WorktreeInUseError`)
- `tsconfig.json` (reference)

Decisions:
- Productionised from spike S2 with the agreed amendments (ADR-010): merge-tree default with automatic fallback, one batched `git branch --merged` call, `-c core.longpaths=true` everywhere.
- `base_ref`, `stacked_on` and the integration ref are returned in the result; persisting them in `execution_space` happens with the run lifecycle (US-048).
- Story ids are validated (`^[A-Za-z]+-\d+$`) before being used in branch and path names.

## Test Coverage
- Coverage (`packages/adapters/git/src`): **100 % lines**, 92.5 % statements, 88.7 % branches, 96.2 % functions
- Test files: `packages/adapters/git/test/execution-spaces.test.ts`, `packages/adapters/git/test/git-client.test.ts` (real temporary repositories, both integration strategies)
- 18 tests
