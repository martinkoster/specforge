---
id: US-025
title: View and edit artifacts
status: done
size: M
epic: Specification phases
---

## Business Value
Lets users read and edit all specifications inside SpecForge (FR-012).

## Description
As a **SpecForge user**, I want **to view rendered Markdown and edit artifacts in the app** so that **I can review and refine specs without switching tools**.

## Acceptance Criteria
- [x] AC-1: Split view with CodeMirror editor and rendered preview; Save writes the workspace file atomically.
- [x] AC-2: Specifications area lists artifacts by type (intent, requirements, design, ADRs, epics, stories) with approval state.
- [x] AC-3: Saving over an externally changed file triggers the conflict dialog (US-021).

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-02-from-intent-to-stories
- Related requirements: FR-012
- Release: R1

## Dependencies
- US-020 Parse workspace artifacts into the index
- US-022 Application shell and primary navigation

## Implementation Details
Files created / modified:
- `packages/application/src/specs/artifact-service.ts` — `ArtifactService.list` (by kind in specification order, invalid files flagged), `read`, `save` (atomic with expected hash; a conflict returns the disk version and a diff); only indexed artifact paths are accessible; `ArtifactConflictError` (the workspace-fs `ContentConflictError` extends it)
- `packages/adapters/sqlite/src/index-repository.ts` — `artifacts()`
- `packages/ipc-contract/src/contract.ts` — `artifacts.list`, `artifact.read`, `artifact.save`
- `packages/ui/src/specs/MarkdownEditor.tsx` (CodeMirror 6), `MarkdownPreview.tsx` (react-markdown + GFM, front-matter hidden, raw HTML not rendered), `ArtifactEditor.tsx` (split view, Save / Ctrl+S, conflict dialog of US-021: keep mine / take theirs / diff), `ArtifactList.tsx`, `SpecificationsArea.tsx`
- `packages/main/src/security.ts`, `main.ts`, `preload.cts` — CSP `style-src 'self' 'nonce-…'` with a random per-session nonce passed to CodeMirror (`EditorView.cspNonce`)

Decisions / deviations:
- CodeMirror injects a `<style>` element, which the previous CSP (`style-src 'self'`) blocked — the editor rendered unstyled (caught by the e2e test). A nonce keeps the policy strict instead of allowing `unsafe-inline`.

## Test Coverage
- Coverage: `artifact-service.ts` 96.8 % lines, `ArtifactEditor.tsx` 94.3 %, `MarkdownEditor.tsx` 100.0 %, `SpecificationsArea.tsx` 94.4 % (workspace total 97.4 % lines)
- Test files: `packages/application/test/artifact-service.test.ts` (5), `packages/core/test/artifacts-ipc.test.ts` (3), `packages/ui/test/artifact-editor.test.tsx` (8), `packages/ui/test/app.test.tsx` (1), `packages/main/test/security.test.ts` (1 new CSP nonce test), `packages/main/test/setup-and-specs.e2e.test.ts` (1, Electron e2e: edit in CodeMirror, Ctrl+S, styles under CSP)
- 19 tests
