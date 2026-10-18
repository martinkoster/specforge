---
id: US-020
title: Parse workspace artifacts into the index
status: done
size: M
epic: Projects & workspace
---

## Business Value
Builds the searchable index of IDs, front-matter, trace links, stories, epics and dependencies that every feature relies on (ADR-004).

## Description
As a **SpecForge developer**, I want **Markdown artifacts parsed into a rebuildable index with atomic writes** so that **the app can query specs quickly while files stay the source of truth**.

## Acceptance Criteria
- [x] AC-1: Parser reads front-matter (`kind`, `approval`, story `status`, `epic`, `depends_on`, `related_to`, `size`) and element-ID headings, and extracts ID references as trace links.
- [x] AC-2: Full index of 1,000 stories completes in < 2 s; invalid files are marked `invalid` with the parse error while the last valid state is kept.
- [x] AC-3: Writes are atomic (temp + rename) with optimistic concurrency via content hash.
- [x] AC-4: Only the main workspace is indexed; worktree directories are ignored (FR-116a).

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — workspaceindexer--filewatcher-artifactstore
- Related design document: spec/03_design/technical_design/data_model.md §1–2
- Related requirements: FR-012, FR-016, FR-020, FR-116, NFR-013
- Release: R1

## Dependencies
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/application/src/indexing/parse-artifact.ts` — front-matter (yaml) and validation (`kind`, `approval`, story `status`/`epic`/`depends_on`/`related_to`/`size`/`branch`/`feature`/`reworks`, epic fields), element-ID headings with anchors, ID references as trace links from the enclosing element
- `packages/application/src/indexing/workspace-indexer.ts` — `WorkspaceIndexer` (full index in one transaction, reindex of one file, removal of deleted files) over ports `ArtifactSource` and `IndexStore`
- `packages/adapters/workspace-fs/` (new package `@specforge/workspace-fs`) — `WorkspaceFiles`: scans `spec/` and `.specforge/` only, skips nested repositories/worktrees (`.git` entry), `node_modules`, build output and configured ignore roots; `writeAtomic()` (temp + rename, optimistic concurrency via SHA-256 `expectedHash`, path confinement); `contentHash()`
- `packages/adapters/sqlite/src/index-repository.ts` — `IndexRepository` implementing `IndexStore` with prepared statements; invalid files keep their last valid rows
- `packages/adapters/sqlite/src/schema.ts` — `trace_link.artifact_path` + index, migration 4 (rebuilds the index tables)
- `spec/03_design/technical_design/data_model.md` — `trace_link.artifact_path`

Decisions:
- Index store is synchronous (better-sqlite3) so a full index runs as one fast transaction.
- Performance test (1,000 stories) runs in the sequential performance suite (`pnpm test:perf`, see below).

## Test Coverage
- Coverage (indexing, workspace-fs, index repository): **95.1 % lines**, 92.1 % statements, 81.3 % branches, 95.2 % functions
- Test files: `packages/application/test/parse-artifact.test.ts`, `packages/core/test/indexing.test.ts`, `packages/core/test/indexing.perf.test.ts` (1,000 stories < 2 s, sequential)
- 15 tests
