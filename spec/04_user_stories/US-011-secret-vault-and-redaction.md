---
id: US-011
title: Store secrets in OS credential store and redact them
status: done
size: M
epic: Setup & configuration
---

## Business Value
Protects provider credentials (ADR-007, ADR-012) and ensures they never appear in files, database or logs (NFR-006).

## Description
As a **SpecForge user**, I want **my API key stored securely and never shown in logs** so that **my credentials stay safe**.

## Acceptance Criteria
- [x] AC-1: Secrets are encrypted via Electron `safeStorage` in the main process; the core only holds references and requests values just-in-time.
- [x] AC-2: On Linux without a secret service, SpecForge warns and stores secrets only after explicit acknowledgement.
- [x] AC-3: SecretRedactor replaces known secret values and key patterns (e.g. `sk-ant-…`) with `***` in all events before persistence and display.
- [x] AC-4: Automated test: an injected secret echoed by a mock agent never appears in the DB file, logs, UI state or workspace.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-012
- Related design document: `spec/03_design/technical_design/service_design.md` — secretredactor
- Related requirements: NFR-006, NFR-010; ADR-007, ADR-012
- Release: R1

## Dependencies
- US-005 Create hardened Electron shell with three-process layout
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/main/src/secret-vault.ts` — `SecretVault` over Electron `safeStorage` (injectable `SafeStorageLike`): encrypted values in an atomic, user-only JSON file in app data; `status()`; weak Linux backends (`basic_text`, `unknown`) require `acknowledgeWeakStorage`; unavailable encryption refuses storage
- `packages/application/src/secrets/secret-env.ts` — `SecretRef`, `SecretResolver` port, `resolveAgentEnv()` (just-in-time resolution)
- `packages/application/src/secrets/redactor.ts` — `createRedactor()`: known values (longest first, regex-escaped, ≥ 6 chars) and patterns (`sk-ant-…`, AWS key ids, bearer tokens); deep redaction of event payloads
- `packages/main/package.json` (workspace dev dependencies for the integration test)

Decisions:
- AC-4 is verified by an integration test spanning vault, reference-only config, MockAdapter echoing the secret, SQLite file, log file and UI state delivered through the IPC contract.
- The vault is exercised with a fake `safeStorage`; wiring the real Electron `safeStorage` happens with the setup wizard (US-012).

## Test Coverage
- Coverage (`packages/application/src/secrets`, `packages/main/src/secret-vault.ts`): **100 % lines**, 98.4 % statements, 100 % branches, 95.2 % functions
- Test files: `packages/application/test/secrets.test.ts`, `packages/main/test/secret-vault.test.ts`, `packages/main/test/secret-leak.test.ts`
- 16 tests (15 on Windows, 1 POSIX permission test skipped)
