---
id: US-009
title: Build unsigned installers for all three OSes
status: ready for development
size: M
epic: Foundation & spikes
---

## Business Value
Makes SpecForge installable as a desktop application (FR-058) and verifies the packaging pipeline early.

## Description
As a **SpecForge user**, I want **to install SpecForge with a native installer on my OS** so that **I can run it like any desktop application**.

## Acceptance Criteria
- [ ] AC-1: electron-builder produces a per-user NSIS installer (Windows), dmg (macOS) and AppImage + deb (Linux) in CI.
- [ ] AC-2: Installers include `LICENSE`, `NOTICE` and a generated `THIRD_PARTY_NOTICES`.
- [ ] AC-3: The Agent SDK's optional bundled Claude Code binary is excluded from the package.
- [ ] AC-4: On a clean VM per OS the installed app launches to the setup wizard (or empty shell until US-012 exists).

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §6–7
- Related requirements: FR-058, NFR-026, CON-015
- Code signing is handled separately in US-067.
- Release: R1

## Dependencies
- US-005 Create hardened Electron shell with three-process layout
- US-008 Set up CI pipeline on Windows, macOS and Linux

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
