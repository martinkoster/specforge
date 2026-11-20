---
id: US-078
title: Per-project specification root
status: done
size: M
epic: Brownfield onboarding
---

## Business Value
Existing repositories often already use `spec/` (e.g. RSpec tests). A per-project specification folder lets SpecForge adopt any repository without moving files (D27) and removes the hard-coded `spec/` literal from the code.

## Description
As a **SpecForge user**, I want to **have each project keep its specifications in a configurable folder** so that **SpecForge never collides with folders my codebase already uses**.

## Acceptance Criteria
- [x] AC-1: `.specforge/project.yaml` accepts `specRoot` (relative path); missing means `spec`. The value is cached in `project.spec_root` by a schema migration; Release 1 projects open unchanged.
- [x] AC-2: Watcher, indexer, artifact paths, spec-run write scopes, built-in permission denies (implementation runs may not write `<specRoot>/**`), spec commits and the merge/dashboard queries resolve paths against the project's root — no literal `spec/` remains in production code outside the default value (checked by a test that greps the sources).
- [x] AC-3: The UI shows root-relative paths (`01_intent/intent.md`) and the specification root in the project header tooltip and project settings (read-only).
- [x] AC-4: An end-to-end test with a project whose root is `docs/spec` generates requirements into `docs/spec/02_requirements`, and an implementation run that tries to write `docs/spec/x.md` is denied, while writing a top-level `spec/x.rb` is allowed.
- [x] AC-5: All specification paths are derived from the root by one domain function (`specLayout`); artifact paths stay workspace-relative in the index, IPC, agent prompts and Git (only the prefix is configurable); the root is validated (relative, inside the workspace, not inside `.specforge/`).

## Technical Notes
- Related design document: spec/03_design/technical_design/c4_architecture.md ADR-024; data_model.md §1.1, §2.1, §5; service_design.md WorkspaceIndexer
- Related requirements: FR-079, FR-116; intent D27
- Release: R2
- About 26 literal uses in 16 files (domain policy, application services, adapters, UI) — refactor in one change with the existing tests as safety net.
- Keep `spec` as the default for new projects (D24 flow unchanged).

## Dependencies
- None

## Implementation Details
Files created / modified:
- `packages/domain/src/project/spec-layout.ts` (new) — `DEFAULT_SPEC_ROOT`, `specLayout(root)` (phase folders, intent path, `isSpecPath`, `isStoryFile`, `phaseOf`, `display`) and `specRootError` (relative, inside the workspace, no `.`/`..` segments, not inside `.specforge/`); exported from the domain index
- `packages/domain/src/permissions/built-in-denies.ts` — `PermissionContext.specRoot`; implementation-run spec denial and story-status protection use the layout
- `packages/application/src/projects/project-service.ts` — `ProjectDescriptor.specRoot`, `NewProjectRecord.specRoot`, `ProjectStore.setSpecRoot`, `OpenedProject.specRoot`; new projects get `spec`; `open`/`openById` read the root from `project.yaml` (authoritative), validate it (`INVALID_SPEC_ROOT`, new code in `project-registry.ts`) and refresh the registry cache
- `packages/application/src/permissions/permission-broker.ts` — `specRoot(projectId)` dependency passed to the built-in denies
- `packages/application/src/specs/spec-run-service.ts` — `specTargetFolder(target, root)` (`SPEC_TARGET_FOLDERS` now derived from the default layout), target folders, refine check and generation guidance from the project's layout (`workspace().specRoot`)
- `packages/application/src/specs/epic-service.ts`, `board/dashboard.ts`, `execution/context-assembler.ts`, `specs/chat-service.ts` — epics folder, dashboard phase groups, implementation and chat prompts from the root; `quality-service.ts` and `spec-commit-message.ts` find the phase folder segment (`NN_…`) independent of the root
- `packages/adapters/workspace-fs/src/project-folders.ts` — writes `specRoot` into `project.yaml` and creates the structure below it; reads `specRoot`
- `packages/adapters/workspace-fs/src/watcher.ts`, `index.ts` — default roots from the domain; the watcher accepts nested roots (passes ancestor folders such as `docs` for `docs/spec`, ignores other files there)
- `packages/adapters/git/src/spec-commits.ts` — `SpecCommits(git, specRoot)`: status, commit check and message use the root
- `packages/adapters/sqlite/src/schema.ts`, `repositories.ts` — migration 20 `project.spec_root` (default `spec`), `Project.specRoot`, `setSpecRoot`
- `packages/core/src/composition.ts` — per-project `specRootOf` (registry cache, refreshed on open), wired into broker, spec runs, chat, quality/clarification workspaces, epics, dashboard, spec commits, `intent.create`, phase status and `shell.state.specRoot`; `project-context.ts` passes the root to `WorkspaceFiles` and the watcher; `execution.ts` passes it to the context assembler; `test-agent.ts` derives target folders from the prompt and has a `probe` story behaviour
- `packages/ipc-contract/src/contract.ts` — `OpenedProject.specRoot`, `shell.state.specRoot` (optional)
- `packages/ui/src/specs/spec-layout-context.ts` (new) — `SpecLayoutContext` / `useSpecLayout`; `App.tsx` provides it from the shell state; `IntentArea`, `SpecificationsArea`, `App` (artifact navigation) build paths from it; `DashboardArea`, `ArtifactEditor`, `ArtifactList` show root-relative paths; `AppShell` shows "Specifications in <root>/" as the project switcher tooltip; `SettingsArea` shows the specification folder read-only
- `packages/ui`, `packages/adapters/workspace-fs`, `packages/adapters/git` — `@specforge/domain` added as dependency (package.json, tsconfig references, lockfile)
- `tooling/test/spec-root-literals.test.ts` (new) — source check: no `spec/` path literal in production code outside the spec layout (and the scripted test agent's deliberate RSpec-style write)
- Spec: `c4_architecture.md` ADR-024 (decision wording refined, see below); this story's AC-5 reworded accordingly

Decisions / deviations:
- Paths stay **workspace-relative** internally (index, IPC, agent prompts, Git, permission relay); only the prefix comes from the root. The original wording of AC-5 / ADR-024 ("root-relative paths in domain and IPC") would have required translating paths at every boundary that agents, Git and the relay see; ADR-024 and AC-5 were updated. The UI still shows root-relative paths (AC-3).
- `openById` re-reads `project.yaml`, so a root edited in the file is picked up on the next open; an invalid root refuses to open with `INVALID_SPEC_ROOT`.
- The root is read-only in Settings (fixed after creation, D27); choosing it is part of adoption (US-079).

## Test Coverage
- Coverage (lines): `spec-layout.ts` 100 %, `built-in-denies.ts` 100 %, `project-service.ts` 100 %, `permission-broker.ts` 100 %, `dashboard.ts` 100 %, `epic-service.ts` 100 %, `context-assembler.ts` 100 %, `spec-commit-message.ts` 100 %, `spec-commits.ts` 100 %, `watcher.ts` 100 %, `test-agent.ts` 100 %, `spec-layout-context.ts` 100 %, `ArtifactList.tsx` 100 %, `DashboardArea.tsx` 100 %, `chat-service.ts` 98.5 %, `quality-service.ts` 98.3 %, `spec-run-service.ts` 98.1 %, `workspace-fs/index.ts` 96.2 %, `AppShell.tsx` 96.2 %, `ArtifactEditor.tsx` 95 %, `project-folders.ts` 94.7 %, `SettingsArea.tsx` 94.4 %, `composition.ts` 94.1 %, `repositories.ts` 88.9 %, `IntentArea.tsx` 82.8 %, `project-context.ts` 81.5 %, `App.tsx` 81.2 %; `SpecificationsArea.tsx` 63 % overall (no unit tests before; the changed phase filter is covered by `spec-root.test.tsx`, the rest by E2E)
- Test files: `packages/domain/test/spec-layout.test.ts` (8), `packages/application/test/{project-service,spec-run-service,permission-broker,dashboard,context-assembler,epic-service,quality-service,spec-commit-message,chat-service}.test.ts` (+15), `packages/adapters/sqlite/test/sqlite.test.ts` (+2), `packages/adapters/git/test/spec-commits.test.ts` (+1), `packages/adapters/workspace-fs/test/project-folders.test.ts` (3, new), `packages/adapters/workspace-fs/test/watcher.test.ts` (+2), `packages/core/test/test-agent.test.ts` (+1), `packages/ui/test/spec-root.test.tsx` (3), `tooling/test/spec-root-literals.test.ts` (2), `packages/main/test/spec-root.e2e.test.ts` (1, E2E: intent and requirements below `docs/spec`, implementation run denied in `docs/spec/`, allowed in `spec/`)
- Adapted: `ui/test/dashboard.test.tsx`, `ui/test/intent-area.test.tsx`, `ui/test/dashboard.perf.test.tsx` (root-relative display), `main/test/workflow.e2e.test.ts` (waits for the editor path by file name), `application/test/project-service.test.ts` (`specRoot` in results)
- Full suite: 1102 passed (+ new), overall 95.5 % lines; E2E workflow, projects, scenarios, accessibility, shell, responsiveness and spec-root green; lint, build and layering green
- 38 new tests
