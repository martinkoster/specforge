# Spike S2 — Stacked worktrees and integration merges

**Story:** US-002 · **Validates:** ADR-010 (worktree per run, stacked branches), CON-008 (no merges into user branches) · **Date:** 2026-10-14
**Prototype:** `spikes/s2/` (throwaway) · **Evidence:** `spikes/s2/results/timings-win32.json`, `timings-linux.json`
**Environment:** Windows 11 with Git 2.56; Ubuntu 26.04 on WSL2 with Git 2.53; Node 24

## Scope and method

`prepareStoryWorktree()` prototypes the ExecutionSpaceManager: it selects the base (base branch, a single unmerged predecessor, or a temporary integration commit of several), creates `specforge/<storyId>[-n]` and a worktree under a short root, and reports conflicts. Integration tests run against temporary Git repositories. All Git calls use `execFile` with argument arrays (NFR-011).

| AC | Scenario | Windows | Linux |
|---|---|---|---|
| AC-1 | Worktree under `<root>/<storyId>`, branch `specforge/<storyId>` from base; `-2` suffix on retry | ✓ | ✓ |
| AC-2 | One predecessor → branch from it; two or three → integration commit; merged predecessors ignored | ✓ | ✓ |
| AC-3 | Conflicting integration → conflicting files reported, no scratch worktree, no story branch left | ✓ | ✓ |
| AC-4 | `diff base_ref..branch` shows only the story's own changes when stacked | ✓ | ✓ |
| AC-5 | Path length: repository paths > 260 characters inside the worktree | ✓ (with `core.longpaths=true`) | ✓ |

## Findings

1. **Stacking works as designed.** Base selection via `merge-base --is-ancestor`, a single predecessor branch, or an integration commit all produced the expected content. `base_ref` is the correct reference for review diffs (FR-043).
2. **Integration without a checkout.** `git merge-tree --write-tree` combined with `git commit-tree` builds the integration commit and reports conflicting files (`--name-only`) without any scratch worktree. It is about 26 % faster on Windows and about 45 % faster on Linux, and nothing has to be cleaned up on failure. It requires **Git ≥ 2.38** instead of 2.30.
3. **Path length.** Paths over 260 characters inside worktrees work when every Git call passes `-c core.longpaths=true`. The short worktree root (`<appdata>/wt/<project>/<story>`, ADR-010) keeps the prefix small.
4. **Windows is about 100× slower than Linux** for the same operations, because Windows process creation and antivirus scanning dominate each Git call:

   | Variant (median of 5) | Windows | Linux |
   |---|---|---|
   | From base branch | 1,483 ms | 13 ms |
   | Single predecessor | 1,750 ms | 22 ms |
   | Integration (scratch worktree) | 3,783 ms | 52 ms |
   | Integration (merge-tree) | 2,799 ms | 29 ms |

   Worktree preparation alone takes up to about 2.8 s of the NFR-004 budget (run start < 5 s) on Windows. → Minimise the number of Git invocations (e.g. one `git branch --merged <base>` instead of one `merge-base` per predecessor). Show progress during preparation, and suggest excluding the worktree root from real-time antivirus scanning in the docs.
5. **Line endings follow the user's Git configuration.** With a global `core.autocrlf=true`, worktree files use CRLF, the same as the user's normal checkout. SpecForge must not override user Git settings; tests pin `core.autocrlf=false` for determinism.
6. **Merge detection is cheap.** `merge-base --is-ancestor` gives the information FR-115 needs with one call per branch, or with a single `git branch --merged` for all branches.

## Recommendation

**Go** for ADR-010, with two amendments:
- Build integration commits with `git merge-tree --write-tree` + `commit-tree` instead of a scratch worktree. This raises the **minimum Git version to 2.38** (ADR-010 and CON-007 currently say 2.30). Keep the scratch-worktree strategy as a fallback for older Git versions.
- Always pass `-c core.longpaths=true`, and treat Git invocation count as a performance budget on Windows (NFR-004).
