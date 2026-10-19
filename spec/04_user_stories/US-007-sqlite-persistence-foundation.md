---
id: US-007
title: Set up SQLite persistence with migrations
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Provides crash-safe local storage for registry, index and execution data (ADR-005), the basis of FR-002 and NFR-015.

## Description
As a **SpecForge developer**, I want **an embedded SQLite database with migrations and typed repositories in the app-data directory** so that **all services can persist state transactionally**.

## Acceptance Criteria
- [x] AC-1: Database file is created in the per-user app-data directory with user-only permissions; WAL mode and foreign keys are enabled.
- [x] AC-2: Numbered SQL migrations run at startup inside a transaction; a failed migration rolls back and reports an error.
- [x] AC-3: Kysely-typed repository base class with an integration test against a temp database.
- [x] AC-4: Workspace index tables can be dropped and rebuilt by a "Rebuild index" command.

## Technical Notes
- Related design document: `spec/03_design/technical_design/data_model.md`
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-005
- Related requirements: FR-002, NFR-010, NFR-015
- Native module rebuilt per Electron version via electron-builder.
- Release: R1

## Dependencies
- US-004 Set up monorepo, tooling and layering rules

## Implementation Details
Files created / modified:
- `packages/adapters/sqlite/` (new package `@specforge/sqlite`): `src/app-data.ts` (per-user app-data directory per OS), `src/database.ts` (open/create, WAL, foreign keys, busy timeout, user-only permissions on POSIX, migrations on open), `src/migrations.ts` (numbered migrations, one transaction each, `MigrationError`), `src/schema.ts` (migrations 1–3, index tables, `rebuildIndex()`, Kysely types), `src/repositories.ts` (`KyselyRepository` base with transactions, `ProjectRepository`)
- `pnpm-workspace.yaml` (`allowBuilds` for better-sqlite3), `tsconfig.json` (reference)
- `spec/03_design/technical_design/data_model.md` — updated

Decisions / deviations:
- **Deviation from the data model:** DB-only story/epic data (execution sub-state, board order, merge time, rejected branches, lane order, colour) moved from the index tables into new tables `story_state` and `epic_layout`, because "Rebuild index" drops the index tables and would otherwise lose it. Data model updated accordingly.
- Windows relies on the inherited ACL of the per-user `%APPDATA%` directory; POSIX sets 0700/0600 explicitly.

## Test Coverage
- Coverage (`packages/adapters/sqlite/src`): **100 % lines**, 96.7 % statements, 83.3 % branches, 100 % functions
- Test file: `packages/adapters/sqlite/test/sqlite.test.ts`
- 14 tests (13 run on Windows, 1 POSIX permission test skipped on Windows)
