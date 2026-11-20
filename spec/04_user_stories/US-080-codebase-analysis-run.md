---
id: US-080
title: Analyse an adopted codebase into draft specifications
status: done
size: M
epic: Brownfield onboarding
---

## Business Value
Drafting intent, requirements and design from existing code saves hours of manual documentation and gives the guided process a realistic starting point (FR-079).

## Description
As a **SpecForge user**, I want to **let the agent analyse my adopted codebase and draft the current-state specifications** so that **I start from a description of what already exists and only add the change I want**.

## Acceptance Criteria
- [x] AC-1: The adopt dialog has *Analyse the codebase now* (checked by default); the Intent screen of an adopted project offers *Analyse codebase* while no intent is approved. Both are disabled in limited mode with the usual explanation.
- [x] AC-2: The `analyze` specification run may read the whole workspace; writes are allowed only into the specification folder, which is snapshotted first (ADR-014). The user may limit the analysis to selected folders, passed in the run context.
- [x] AC-3: The drafts are `approval: draft`: the intent with an as-is description and a "Desired change" section to complete, a current-state design naming detected languages, frameworks (with versions) and main components, and current-state requirements with FR/NFR IDs.
- [x] AC-4: The drafts pass the existing spec-run validation and appear in the Keep/Discard review; *Discard* restores the snapshot; afterwards the guided process opens at Intent.
- [x] AC-5: If the run's computed changes contain paths outside the specification folder, the run fails, lists the paths and restores them; a test with the scripted agent verifies that no source file changes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-030; business_processes.md BP-05; c4_architecture.md ADR-014
- Related requirements: FR-079, FR-007, FR-008
- Release: R2
- Extend the scripted test agent with an `analyze` behaviour (writes the three drafts; a variant also tries to write a source file).

## Dependencies
- US-079 Adopt an existing code folder

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — `analyze({projectId, limitTo?})`: an `analyze` run with the specification root as target and write scope (snapshotted first, ADR-014); optional folder limit (validated, passed in the prompt); analysis guidance (read the whole workspace; intent with as-is description and "## Desired change", current-state design with languages/frameworks (with versions)/components, current-state FR/NFR requirements, all `approval: draft`); `openAnalysis(projectId)`; `WorkspaceGuard` dependency: a whole-workspace snapshot per analyze run — changes outside the root fail the run with the list of paths and are restored (AC-5); *Ask agent to fix* keeps the `analyze` kind; trigger `CodebaseAnalysis <root>`
- `packages/application/src/projects/project-service.ts` — `hasCode(path, specRoot)` (top-level entries besides hidden folders and the folder holding the root); `ProjectWorkspace.entries`
- `packages/adapters/workspace-fs/src/project-folders.ts` — `entries()`
- `packages/adapters/agent-mock/src/mock-adapter.ts` — step `sneakWrite` (writes without a permission request; simulates a policy bypass for AC-5 tests)
- `packages/core/src/test-agent.ts` — `analyze` behaviour (intent, `03_design/current_state.md`, `02_requirements/current_requirements.md` below the root); variant for an analysis limited to `intrude`: a source write (denied by the relay) plus a `sneakWrite` of `README.md`
- `packages/core/src/composition.ts` — workspace guard on the `SnapshotStore` (default exclusions, `restorePaths`, re-index), handlers `specs.analyze`, `specs.openAnalysis`, `specs.analysisAvailable`; `packages/ipc-contract/src/contract.ts` — the three entries
- `packages/ui/src/intent/AnalyzePanel.tsx` (new) — *Analyse codebase* with *Limit to folders*, progress, *Review the analysis*, Keep/Discard/fix via `ReviewChangesDialog`; disabled with the explanation in limited mode; `IntentArea.tsx` shows it while the intent is not approved
- `packages/ui/src/projects/AdoptProjectDialog.tsx` — *Analyse the codebase now* (checked by default, off and disabled in limited mode); `App.tsx` starts `specs.analyze` after `projects.adopt` and opens the Intent phase
- Spec: `service_design.md` (analyze guard, `openAnalysis`, `analysisAvailable`)

Decisions / deviations:
- "Adopted project" is derived: *Analyse codebase* is offered while no intent is approved and the workspace holds code (`hasCode`), so no extra marker in `project.yaml` is needed.
- AC-5 detection uses a content-addressed whole-workspace snapshot (default exclusions such as `node_modules`, `.git`, `dist`); unchanged files are reused from earlier snapshots of the workspace.
- A failed analysis keeps its drafts below the root for review; *Discard* restores the root.

## Test Coverage
- Coverage (lines): `project-service.ts` 100 %, `test-agent.ts` 100 %, `spec-run-service.ts` 98.4 %, `project-folders.ts` 95 %, `mock-adapter.ts` 94.8 %, `composition.ts` 94.3 %, `AdoptProjectDialog.tsx` 90.4 %, `AnalyzePanel.tsx` 90 %, `App.tsx` 84.2 %, `IntentArea.tsx` 83.3 %; overall 95.5 %
- Test files: `packages/application/test/spec-run-service.test.ts` (+6), `packages/application/test/project-service.test.ts` (+1), `packages/adapters/workspace-fs/test/project-folders.test.ts` (+1), `packages/adapters/agent-mock/test/mock-adapter.test.ts` (+1), `packages/core/test/test-agent.test.ts` (+2), `packages/core/test/analyze-ipc.test.ts` (2, new: scripted agent, source hashes unchanged, write around the relay restored), `packages/ui/test/analyze-codebase.test.tsx` (6, new), `packages/main/test/adopt.e2e.test.ts` (1, new E2E: adopt → analysis → Keep → Intent)
- Adapted: `ui/test/adopt-project-dialog.test.tsx`, `ui/test/app.test.tsx` (analysis started after adoption)
- Full suite: 1141 passed; lint, build and layering green
- 20 new tests
