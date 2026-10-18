---
id: US-067
title: Sign and notarise installers
status: blocked
size: S
epic: Quality & release readiness
---

## Business Value
Allows users to install SpecForge without OS security warnings (FR-058, intent §8).

## Description
As a **SpecForge user**, I want **signed installers** so that **installation is trustworthy and frictionless**.

## Acceptance Criteria
- [ ] AC-1: Windows installer is Authenticode-signed; macOS dmg is signed with Developer ID and notarised; Linux artefacts have checksums.
- [ ] AC-2: Signing runs only on release builds in CI with secrets from the CI secret store.
- [ ] AC-3: Redistribution of the Agent SDK in installers is confirmed as permitted by Anthropic's terms.

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §6–7
- Related requirements: FR-058, CON-015, NFR-027
- Release: R1

## Dependencies
- US-009 Build unsigned installers for all three OSes

## Blockers
- Code-signing certificates (Windows Authenticode, Apple Developer ID) and the release publication channel have not been decided yet.
- Redistribution terms for the Claude Agent SDK in installers must be confirmed (CON-015).

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
