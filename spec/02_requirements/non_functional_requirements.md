# SpecForge — Non-Functional Requirements

**Source:** `spec/01_intent/intent.md` v0.2 incl. §13 Clarified decisions (D1–D22)  
**Last updated:** 2026-10-13

> The intent states quality goals qualitatively ("responsive", "reliably", "secure by default"). The quantitative **Measures** below are proposed targets derived by the analyst and should be confirmed by the product owner.

Reference hardware for measures: a mid-range developer laptop (4+ cores, 16 GB RAM, SSD) on Windows 11, macOS 14+, or Ubuntu 22.04+.

---

## Performance

### NFR-001: UI responsiveness during agent execution
**Category**: Performance
**Description**: The UI must never block on agent execution, file I/O, or generation tasks; all long-running work runs outside the UI thread.
**Source**: §5.5 "while keeping the desktop UI responsive"; §6 "Long-running agent tasks must not block navigation or interaction".
**Measure**: While 3 parallel runs each stream output at ≥100 lines/s, user interactions (navigation, typing, dragging a card) receive visual feedback in < 100 ms (p95) and no UI freeze > 250 ms occurs.
**Priority**: Must Have
**Release**: R1

### NFR-002: Streaming latency
**Category**: Performance
**Description**: Agent output and status changes are displayed promptly.
**Source**: Goal 8 "real-time visibility into agent execution".
**Measure**: Output emitted by the agent process appears in the execution view in < 1 s (p95); permission requests appear in < 1 s.
**Priority**: Must Have
**Release**: R1

### NFR-003: Application startup
**Category**: Performance
**Description**: The application starts and restores the last project quickly.
**Source**: §6 "modern, responsive desktop application".
**Measure**: Cold start to an interactive project screen in < 5 s for a project with 200 stories and 50 runs.
**Priority**: Should Have
**Release**: R1

### NFR-004: Run start latency
**Category**: Performance
**Description**: Starting execution after the Ready → In Progress transition is fast, excluding agent-side model latency.
**Source**: §5.4; FR-022.
**Measure**: Branch/worktree creation (or snapshot for workspaces ≤ 5,000 files / 500 MB) and agent process launch complete in < 5 s.
**Priority**: Should Have
**Release**: R1

### NFR-005: Large log handling
**Category**: Performance
**Description**: Long runs with large logs remain viewable without degrading the UI.
**Source**: Goal 8.
**Measure**: A run log of 100 MB / 1,000,000 lines can be opened and scrolled smoothly (virtualised rendering), and searched in < 2 s.
**Priority**: Should Have
**Release**: R1

### NFR-030: Dashboard freshness and performance
**Category**: Performance
**Description**: The dashboard reflects project state promptly without blocking the UI.
**Source**: D16.
**Measure**: Dashboard renders in < 1 s for 1,000 stories and 1,000 runs; counts and recommended next step update within 2 s of any state change (story move, run end, artifact change).
**Priority**: Should Have
**Release**: R1

---

## Security

### NFR-006: No plaintext secrets in artifacts or logs
**Category**: Security
**Description**: Credentials and secrets (API keys, tokens, environment secrets configured in SpecForge) are stored only in the OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service). They are never written to workspace artifacts or the local database in plaintext and are redacted from run logs and displayed output.
**Source**: §5.7 "Credentials and secrets must not be stored in plaintext project artifacts or exposed in agent execution logs."
**Measure**: Automated test: a configured secret value injected into a run's environment and echoed by the agent does not appear in the stored log, the UI, the database file, or any workspace file (appears as `***`).
**Priority**: Must Have
**Release**: R1

### NFR-007: Deny-by-default execution permissions
**Category**: Security
**Description**: Without an explicit allow rule (FR-051) or a live human approval (FR-032), an agent action requiring permission is not executed. Unanswered requests never default to *allow*.
**Source**: §7 "Secure by default — Restrict execution permissions"; D3.
**Measure**: 100% of permission-requiring agent actions in the test suite are either matched by an explicit rule or relayed; a dismissed prompt, or a prompt pending when the run is cancelled or SpecForge shuts down, results in *deny*; there is no prompt timeout (FR-042).
**Priority**: Must Have
**Release**: R1

### NFR-008: Workspace confinement
**Category**: Security
**Description**: Agent runs are started with their working directory set to the run's worktree (git mode) or workspace (non-git mode); file-write permission requests outside that directory are always relayed to the human and visually flagged as *outside workspace*, and cannot be covered by an auto-allow rule.
**Source**: §7 "Secure by default"; §5.6 "reducing the risk of overwriting unrelated changes".
**Measure**: Test: an agent attempting to write outside the worktree triggers a flagged prompt; no allow rule can suppress it.
**Priority**: Must Have
**Release**: R1

### NFR-009: No SpecForge cloud and no hidden telemetry
**Category**: Security
**Description**: SpecForge itself makes no network connections except those explicitly enabled by the user (e.g. update checks). Network traffic of agent runtimes is outside SpecForge's control and is disclosed (FR-057).
**Source**: §2 Goal 11 "local-first operation without requiring a SpecForge-hosted cloud backend"; §10 "must not introduce … dependencies on externally hosted services."
**Measure**: With update checks disabled, network monitoring of the SpecForge process (excluding spawned agent processes) shows zero outbound connections during the MVP acceptance scenario.
**Priority**: Must Have
**Release**: R1

### NFR-010: Protection of local application data
**Category**: Security
**Description**: The local database, logs, and snapshots are stored in the per-user application data directory with access restricted to the current OS user.
**Source**: §7 "protect local data".
**Measure**: On each OS, files in the app data directory are not readable by other non-admin users (verified by permission check).
**Priority**: Must Have
**Release**: R1

### NFR-011: Safe process invocation
**Category**: Security
**Description**: Agent executables are invoked with argument arrays (no shell string interpolation of user or AI content), preventing command injection via story text, prompts or paths.
**Source**: §7 "Secure by default".
**Measure**: Test: a story title containing shell metacharacters (`"; rm -rf ~ #`, `& del`, `$(…)`) is passed verbatim to the agent and causes no command execution.
**Priority**: Must Have
**Release**: R1

### NFR-012: Auditability of agent actions
**Category**: Security
**Description**: Every permission request, decision (human or rule), decider, and timestamp is recorded in the run record and cannot be edited through the UI.
**Source**: §7 "Transparent"; Goal 10.
**Measure**: For every permission-requiring action in a run, the run record contains a corresponding request/decision entry (incl. rule-based decisions with rule and scope); read-only tool use is visible in the run log.
**Priority**: Must Have
**Release**: R1

### NFR-031: Traceability of chat changes
**Category**: Security
**Description**: Every file change made through the chat is attributable and reversible.
**Source**: D17.
**Measure**: 100 % of chat-made file changes are recorded with thread, message, permission decision and diff, and can be reverted from the thread.
**Priority**: Must Have
**Release**: R2

---

## Scalability

### NFR-013: Project size limits
**Category**: Scalability
**Description**: SpecForge remains usable for realistically sized projects.
**Source**: §5.1 "multiple software projects".
**Measure**: Supports ≥ 20 registered projects, ≥ 1,000 stories and ≥ 2,000 requirement/design elements per project, and ≥ 1,000 stored runs per project, with board rendering < 1 s and artifact search < 2 s.
**Priority**: Should Have
**Release**: R1

### NFR-014: Concurrent execution capacity and isolation
**Category**: Scalability
**Description**: The execution subsystem runs multiple agent runs concurrently without interference: run state, logs, permission prompts, worktrees and processes are strictly isolated per run, and the scheduler is safe against races (e.g. two slots freeing simultaneously, approval and cancellation at the same moment).
**Source**: D10; D11.
**Measure**: Automated tests run 10 concurrent mock-adapter runs (limit raised for the test) with no cross-run state, log or file interference; scheduler property tests over random sequences of queue/approve/cancel/complete events never exceed the limit, never start a story with an open blocking predecessor, and never lose a queued story. Manual test: 3 parallel Claude Code runs on each OS.
**Priority**: Must Have
**Release**: R1

### NFR-028: Dependency graph performance and correctness
**Category**: Scalability
**Description**: Dependency validation and visualisation remain fast and correct for large backlogs.
**Source**: D11.
**Measure**: Cycle detection and blocked-state computation for 1,000 stories with 3,000 dependencies completes in < 100 ms; board highlighting of predecessors/successors responds in < 100 ms.
**Priority**: Should Have
**Release**: R1

---

## Availability / Reliability

### NFR-015: Durable state and crash safety
**Category**: Availability
**Description**: Persisted state survives application crashes and power loss; writes to artifacts and the database are atomic (no half-written files or corrupt records).
**Source**: §5.1 "without losing planning or execution state"; §7 "Recoverable"; D8.
**Measure**: Fault-injection test: killing the process at random points during 100 save/run operations produces no corrupt artifact files and no unreadable database; at most the last 1 s of streamed log output may be lost.
**Priority**: Must Have
**Release**: R1

### NFR-016: End-to-end workflow reliability
**Category**: Availability
**Description**: The MVP acceptance scenario completes reliably without manual Claude Code invocation.
**Source**: §8 "The MVP is successful when this workflow can be completed reliably without manually invoking Claude Code outside SpecForge."
**Measure**: The MVP acceptance scenario completes successfully in ≥ 9 of 10 consecutive attempts on each supported OS, where failures attributable to SpecForge (not to agent/model output quality) count as failures.
**Priority**: Must Have
**Release**: R1

### NFR-017: Graceful degradation on agent failure
**Category**: Availability
**Description**: Agent crashes, invalid output, missing executable, or authentication failures of the agent runtime never crash SpecForge; they result in a Failed run with a diagnostic message.
**Source**: §5.4 "Failed or interrupted executions must remain visible"; §6 "clear feedback about … errors".
**Measure**: Tests for each failure type (exit code ≠ 0, malformed stream, killed process, missing binary) produce a Failed run with a human-readable reason; SpecForge stays running.
**Priority**: Must Have
**Release**: R1

---

## Usability

### NFR-018: Discoverable end-to-end workflow
**Category**: Usability
**Description**: Users, including those with limited coding experience, can complete the core workflow guided by the UI, with the next recommended step always visible.
**Source**: §3 "support both experienced engineers and users with limited coding experience"; §6.
**Measure**: In a usability test, ≥ 4 of 5 first-time users complete the MVP acceptance scenario without external documentation in ≤ 60 min (excluding agent run time).
**Priority**: Should Have
**Release**: R1

### NFR-019: Transparency of AI output
**Category**: Usability
**Description**: AI-generated content is visibly distinguished (Draft badge, generating run reference) until approved, and every change made by an agent is reviewable as a diff.
**Source**: §3 "making architectural decisions and generated changes transparent and reviewable"; §7 "Transparent".
**Measure**: 100% of agent-modified files and artifacts can be traced to a run and displayed as a diff.
**Priority**: Must Have
**Release**: R1

### NFR-020: Accessibility basics
**Category**: Usability
**Description**: The application is operable by keyboard (including moving cards between columns), supports OS scaling, and meets WCAG 2.1 AA colour contrast; status is not conveyed by colour alone.
**Source**: §6 "modern, responsive desktop application".
**Measure**: All primary workflows completable with keyboard only; automated contrast check passes AA.
**Priority**: Should Have
**Release**: R1

### NFR-029: Time to first productive use
**Category**: Usability
**Description**: A new user can complete setup and reach a first generated artifact quickly, guided only by the setup wizard, start wizard and phase stepper.
**Source**: D13–D16.
**Measure**: With Claude Code installed and an API key at hand, ≥ 4 of 5 first-time users complete the setup wizard in ≤ 10 min and reach generated requirements for the MVP acceptance intent in ≤ 30 min (excluding agent run time), without external documentation.
**Priority**: Should Have
**Release**: R1

### NFR-032: Feature capture effort
**Category**: Usability
**Description**: Bringing a new idea into the workflow is fast and low-friction.
**Source**: D22.
**Measure**: Capturing an idea in the inbox takes ≤ 2 interactions from any screen; from *Add feature* to a saved Draft feature intent takes ≤ 5 min of user time for a typical idea (excluding agent time); trace-based part of the impact analysis is shown in < 2 s while the AI part continues in the background.
**Priority**: Should Have
**Release**: R2

---

## Maintainability

### NFR-021: Modular architecture
**Category**: Maintainability
**Description**: UI, domain logic, persistence, and agent adapters are separate modules with defined interfaces; domain logic has no dependency on UI framework or specific adapters.
**Source**: §7 "Modular — Separate UI, domain logic, persistence, and agent adapters".
**Measure**: Dependency analysis in CI shows no imports from domain to UI or adapter-implementation modules.
**Priority**: Must Have
**Release**: R1

### NFR-022: Extensible agent adapters
**Category**: Maintainability
**Description**: A new agent runtime can be supported by adding an adapter module implementing the adapter interface (FR-028), without modifying core modules.
**Source**: §7 "Extensible — Support additional coding agents without redesigning the core"; Success criterion 7.
**Measure**: A mock/test adapter is implemented as a separate module using only the public adapter interface and passes the same workflow tests as the Claude Code adapter.
**Priority**: Must Have
**Release**: R1

### NFR-023: Test coverage and automated testing
**Category**: Maintainability
**Description**: SpecForge is developed test-first; domain logic and adapters have automated unit and integration tests, and the end-to-end workflow has automated tests using a mock adapter.
**Source**: §10 "testable acceptance criteria"; project development process (stage 5 TDD).
**Measure**: ≥ 75% line coverage overall and ≥ 90% for domain logic (state transitions, permission policy); CI runs on Windows, macOS and Linux.
**Priority**: Must Have
**Release**: R1

### NFR-024: Specification-driven traceability of SpecForge itself
**Category**: Maintainability
**Description**: SpecForge's own code is traceable to its stories, requirements and ADRs (stored in this repository's `spec/` folder).
**Source**: §10 "SpecForge itself shall initially be developed using Claude Code, following a specification-driven development process."
**Measure**: Every implemented user story references its requirement IDs, and every architecture decision is recorded as an ADR.
**Priority**: Should Have
**Release**: R1

---

## Portability and installation

### NFR-025: Cross-platform feature parity
**Category**: Maintainability
**Description**: All MVP features work identically on Windows, macOS and Linux, including process spawning and termination of process trees, path handling, executable discovery, file watching, notifications, and credential storage.
**Source**: D9; §7 "Portable — Avoid unnecessary platform-specific dependencies".
**Measure**: The automated end-to-end suite (mock adapter) passes on all three OSes in CI; the manual MVP acceptance scenario (NFR-016) passes on each OS before release.
**Priority**: Must Have
**Release**: R1

### NFR-026: Installation footprint
**Category**: Usability
**Description**: SpecForge installs per-user without administrator rights where the OS allows, and requires no additional runtime installation beyond the agent CLI (and Git, if used).
**Source**: §8 "locally installable desktop application"; §10 "must not introduce unnecessary infrastructure".
**Measure**: Installer runs without admin rights on Windows and Linux (AppImage or equivalent); no separate database server, language runtime or container is required.
**Priority**: Should Have
**Release**: R1

---

## Compliance

### NFR-027: Licensing and data handling
**Category**: Compliance
**Description**: No regulatory regime is named in the intent. SpecForge is licensed under Apache-2.0 (CON-015) and must use only dependencies with licenses compatible with Apache-2.0 distribution, must not transmit user code or data itself (NFR-009), and must respect the terms of use of integrated agent runtimes (it invokes the user's own installed and authenticated CLI).
**Source**: §7 "Local-first"; §5.5.
**Measure**: Automated license scan in CI fails on GPL/AGPL (and unknown) licenses in production dependencies and flags weak-copyleft/proprietary ones for review; every installer ships a third-party notices file; provider credentials entered by the user are stored only in the OS credential store, injected only into the agent process and never transmitted by SpecForge itself (ADR-007, ADR-012).
**Priority**: Should Have
**Release**: R1
