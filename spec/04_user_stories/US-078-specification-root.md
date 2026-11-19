---
id: US-078
title: Per-project specification root
status: ready for development
size: M
epic: Brownfield onboarding
---

## Business Value
Existing repositories often already use `spec/` (e.g. RSpec tests). A per-project specification folder lets SpecForge adopt any repository without moving files (D27) and removes the hard-coded `spec/` literal from the code.

## Description
As a **SpecForge user**, I want to **have each project keep its specifications in a configurable folder** so that **SpecForge never collides with folders my codebase already uses**.

## Acceptance Criteria
- [ ] AC-1: `.specforge/project.yaml` accepts `specRoot` (relative path); missing means `spec`. The value is cached in `project.spec_root` by a schema migration; Release 1 projects open unchanged.
- [ ] AC-2: Watcher, indexer, artifact paths, spec-run write scopes, built-in permission denies (implementation runs may not write `<specRoot>/**`), spec commits and the merge/dashboard queries resolve paths against the project's root — no literal `spec/` remains in production code outside the default value (checked by a test that greps the sources).
- [ ] AC-3: The UI shows root-relative paths (`01_intent/intent.md`) and the specification root in the project header tooltip and project settings (read-only).
- [ ] AC-4: An end-to-end test with a project whose root is `docs/spec` generates requirements into `docs/spec/02_requirements`, and an implementation run that tries to write `docs/spec/x.md` is denied, while writing a top-level `spec/x.rb` is allowed.
- [ ] AC-5: Domain and IPC types use root-relative artifact paths; the root is validated (relative, inside the workspace, not inside `.specforge/`).

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-024; data_model.md §1.1, §2.1, §5; service_design.md WorkspaceIndexer
- Related requirements: FR-079, FR-116; intent D27
- Release: R2
- About 26 literal uses in 16 files (domain policy, application services, adapters, UI) — refactor in one change with the existing tests as safety net.
- Keep `spec` as the default for new projects (D24 flow unchanged).

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
