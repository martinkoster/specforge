---
id: US-079
title: Adopt an existing code folder
status: ready for development
size: M
epic: Brownfield onboarding
---

## Business Value
Users with existing code can bring it under SpecForge without starting from an empty folder — the most requested missing capability from Release 1 (FR-079, D14).

## Description
As a **SpecForge user**, I want to **adopt a folder that already contains code as a SpecForge project** so that **I can use specification-driven development on my existing projects**.

## Acceptance Criteria
- [ ] AC-1: The start screen offers *Adopt existing code*; opening a non-empty folder without metadata offers *Adopt this folder* (replacing the Release 1 "arrives in Release 2" note of US-068).
- [ ] AC-2: `project.inspectFolder` additionally returns the Git state (`none` / `root` / `subfolder`) and a suggested specification folder (`spec`, or `docs/spec` when `spec/` exists).
- [ ] AC-3: The adopt dialog shows folder path, project name (pre-filled from the folder name), specification folder (editable, validated: relative, inside the workspace, not inside `.specforge/`, not an existing non-empty folder) and *Initialise Git repository* (only when no repository exists).
- [ ] AC-4: *Adopt* writes `.specforge/project.yaml` (incl. `specRoot`) and the empty specification structure, registers the project and opens it; with *Initialise Git* it runs `git init` and commits only the SpecForge files — existing files stay untracked; in an existing repository nothing is committed. No existing file is modified (verified by comparing file hashes in the test).
- [ ] AC-5: A subfolder of a Git repository is rejected with "Choose the repository root"; a folder that meanwhile contains `.specforge/project.yaml` is opened as an existing project.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-029, UC-030; user_flows.md UF-01b; business_processes.md BP-05; service_design.md ProjectService
- Related requirements: FR-079, FR-077, FR-001
- Release: R2
- Reuse the D24 create dialog components; IPC `projects.adopt({path, name, specRoot, initGit})`.

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
