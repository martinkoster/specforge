---
id: US-008
title: Set up CI pipeline on Windows, macOS and Linux
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Guarantees cross-platform parity and quality gates on every change (NFR-023, NFR-025, NFR-027).

## Description
As a **SpecForge developer**, I want **CI running lint, typecheck, tests, coverage and license checks on all three OSes** so that **regressions and incompatible licenses are caught automatically**.

## Acceptance Criteria
- [x] AC-1: GitHub Actions matrix (windows-latest, macos-latest, ubuntu-latest) runs lint, typecheck, unit and integration tests. _(first green GitHub Actions run 2026-10-19, run 39218561415)_
- [x] AC-2: Coverage thresholds (≥ 75 % overall, ≥ 90 % `domain`) fail the build when not met.
- [x] AC-3: License scan fails on GPL/AGPL/unknown licenses in production dependencies and flags weak-copyleft/proprietary ones.
- [x] AC-4: Dependency audit (`pnpm audit:deps`) runs in CI and fails on high/critical vulnerabilities in production dependencies.
- [x] AC-5: Pipeline status badge and instructions are added to the README.

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §5–7
- Related requirements: NFR-023, NFR-025, NFR-027
- CI platform assumed (GitHub Actions) — adjust if another platform is chosen.
- Release: R1

## Dependencies
- US-004 Set up monorepo, tooling and layering rules

## Implementation Details
Done 2026-10-19: first green run on GitHub Actions (https://github.com/martinkoster/specforge, PR from `feature/us-001-spike-s1`). The first runs exposed and fixed: the Agent SDK reported as "Unknown" license (explicit, documented `PROPRIETARY` review list in `tooling/src/licenses.ts`); tests depending on a global Git identity, Windows-only paths, the macOS Electron app bundle layout (fuses), macOS watcher latency and Ctrl-only shortcuts (Cmd on macOS); an invalid expression in `spike-s1.yml`.

Files created / modified:
- `.github/workflows/ci.yml` — job `build` (matrix windows/macos/ubuntu: frozen install, lint, build incl. layering, SPDX, tests with coverage thresholds; Linux under `xvfb-run` for the Electron e2e) and job `supply-chain` (license scan, dependency audit)
- `tooling/src/licenses.ts` — SPDX-expression license policy (allowed / review / forbidden), `pnpm licenses` parser; `tooling/src/cli/check-licenses.ts`
- `package.json` — scripts `check:licenses`, `audit:deps`
- `pnpm-workspace.yaml` — `allowBuilds` (esbuild, better-sqlite3, electron) so `pnpm install --frozen-lockfile` succeeds in CI
- `README.md` — CI badge (relative link, no hard-coded repository name) and development instructions

Findings:
- The local CI dry run found that pnpm 12 fails a frozen install on unapproved build scripts and no longer honours `onlyBuiltDependencies`; fixed with `pnpm approve-builds`, which writes `allowBuilds`.
- License scan: all production dependencies allowed; 1 review item, `lightningcss` (MPL-2.0), pulled in through Vitest as a peer dependency of the contract test package (test tooling, not shipped).
- `pnpm audit`: no known vulnerabilities.

## Test Coverage
- Coverage (`tooling/src`): 100 % (whole workspace: 97.8 % lines, 96.6 % statements, 87.8 % branches, 97.6 % functions)
- Test file: `tooling/test/ci.test.ts`
- 26 tests; local dry run of all workflow steps: all exit 0
