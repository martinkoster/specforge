---
id: US-004
title: Set up monorepo, tooling and layering rules
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Creates the code base structure mandated by ADR-003 so every following story lands in the right module with enforced boundaries.

## Description
As a **SpecForge developer**, I want **a pnpm workspace with the agreed packages, strict TypeScript, linting, tests and dependency rules** so that **code stays modular and testable from day one**.

## Acceptance Criteria
- [x] AC-1: pnpm workspace with packages `domain`, `application`, `ipc-contract`, `adapters/*`, `core`, `main`, `ui` builds with `pnpm build`.
- [x] AC-2: TypeScript strict mode, ESLint and Prettier run via `pnpm lint`; Vitest runs via `pnpm test` with coverage reporting.
- [x] AC-3: dependency-cruiser rules fail the build if `domain` imports from any other package or `application` imports adapters/UI.
- [x] AC-4: A check fails if a source file lacks the `SPDX-License-Identifier: Apache-2.0` header.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-003
- Related design document: spec/03_design/technical_design/technical_decisions.md §1
- Related requirements: NFR-021, NFR-023, CON-015
- Release: R1

## Dependencies
- None

## Implementation Details
Files created:
- Root: `package.json` (scripts build/lint/format/test/coverage/check:layering/check:spdx, `packageManager: pnpm@12.11.2`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json` (strict, NodeNext, composite), `tsconfig.json` (project references), `eslint.config.js` (typescript-eslint + Prettier), `.prettierrc.json`, `.editorconfig`, `vitest.config.ts` (v8 coverage, thresholds 75 % / domain 90 %), `.dependency-cruiser.cjs` (rules `domain-is-pure`, `application-not-to-adapters-or-ui`, `no-circular`)
- Packages `packages/{domain,application,ipc-contract,core,main,ui}` and `packages/adapters/agent-mock`, each with `package.json`, `tsconfig.json`, `src/index.ts` (layer descriptor) and `test/index.test.ts`
- `tooling/` (`@specforge/tooling`): `src/layering.ts` (dependency-cruiser API), `src/spdx.ts`, CLIs `src/cli/check-layering.ts` and `src/cli/check-spdx.ts`, tests `test/monorepo.test.ts` with layering fixtures

Decisions / deviations:
- **TypeScript pinned to 6.0.x**: TypeScript 7 (native compiler) does not provide the JavaScript compiler API required by typescript-eslint (supports < 6.1) and dependency-cruiser. Revisit when the ecosystem supports TS 7.
- pnpm is used via corepack (`corepack pnpm …`); no global install required. pnpm skipped esbuild's install script by default; tooling works without it.
- The layering check runs as part of `pnpm build` (after `tsc -b`), so violations fail the build.
- Spikes stay standalone npm packages outside the workspace.

## Test Coverage
- Coverage (all workspace sources incl. tooling): **100 %** lines/statements/branches/functions (thresholds enforced: 75 % overall, 90 % domain)
- Test files: `tooling/test/monorepo.test.ts` (AC-1–AC-4: workspace/build, strict TS, lint, ESLint rules, coverage config, layering violations and clean repo, SPDX detection and repo check), `packages/*/test/index.test.ts` (7)
- 17 tests, all passing
