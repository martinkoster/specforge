# SpecForge — Constraints

**Source:** `spec/01_intent/intent.md` v0.2 incl. §13 Clarified decisions (D1–D22)  
**Last updated:** 2026-10-13

### CON-001: Local-first, no SpecForge-hosted backend
**Description**: SpecForge runs entirely on the user's machine as a desktop application and orchestrates locally installed tools. No SpecForge-hosted cloud service may be required.
**Impact**: All persistence, orchestration and UI are local; no server components, accounts or licensing services. Agent runtimes may still contact their own AI providers (§7 "Local-first does not mean offline-only").

### CON-002: Claude Code CLI is the first and only MVP agent runtime
**Description**: The MVP integrates the locally installed Claude Code runtime (driven via the Agent SDK, ADR-006). The user installs Claude Code and provides AI provider credentials (Anthropic API key or cloud provider configuration) in SpecForge's setup (ADR-007); usage is billed to the user's provider account. SpecForge stores these credentials only in the OS credential store and passes them only into the agent process.
**Impact**: The adapter depends on Claude Code's programmatic features (streamed structured output, permission callback, session resume). Their availability and stability across versions is an external dependency; a minimum supported Claude Code version must be defined in design.

### CON-003: Vendor-neutral agent abstraction
**Description**: The application core must not depend on any single AI model or coding-agent vendor; all agent interaction goes through an adapter interface.
**Impact**: Claude-Code-specific concepts (CLI flags, stream formats, session IDs) must be mapped to generic concepts; features available in only one runtime must be expressed as optional capabilities.

### CON-004: No direct model-API calls by SpecForge (D1)
**Description**: SpecForge does not call AI model APIs directly; specification generation and implementation both use the agent adapter.
**Impact**: Interactive features such as intent clarification (FR-006) and refinement (FR-014) must be built on agent sessions (multi-turn via session resume), with corresponding latency. SpecForge never calls model APIs itself; provider credentials entered by the user are stored only in the OS credential store and injected only into the agent process environment (ADR-007, ADR-012).

### CON-005: Human-controlled transitions
**Description**: Only humans may approve artifacts, move stories into *Ready* or *In Progress*, and accept work as *Done*. Agents may only recommend.
**Impact**: The domain model must distinguish human-initiated and system-initiated transitions and enforce them in domain logic, not only in the UI. Interactive permission relay (D3) adds a further human checkpoint during runs.
**Exception (D17)**: The project chat agent may edit code directly in the main workspace, outside the Kanban flow, with every write individually subject to the permission relay and rules; such changes are tracked and reversible (FR-091, NFR-031). The chat can never move stories or start implementation runs (FR-092).

### CON-006: Human-readable Markdown artifacts in the workspace (D2)
**Description**: Specifications and story status are stored as Markdown (with front-matter) in the project workspace and are the source of truth; execution data lives in a local database in the application data directory.
**Impact**: Requires a file-watching and parsing layer, stable ID conventions, conflict handling for external edits, and a defined front-matter schema. The database must be reconstructible from workspace files for all spec/story data.

### CON-007: Git is optional (D6)
**Description**: Workspaces may or may not be Git repositories. Git mode uses branch/worktree isolation; non-git mode runs directly in the workspace with snapshots.
**Impact**: Two execution and diff strategies must be implemented and tested. Git (if used) is a locally installed external tool; minimum version must be defined (worktree support).

### CON-008: SpecForge does not merge into user branches (D4)
**Description**: Approved story branches are merged manually by the user. SpecForge never merges into the base branch or any user branch. It may create temporary integration commits in scratch worktrees to build the base of a stacked story branch (FR-067), and it detects merges made by the user (FR-115).
**Impact**: No merge or conflict-resolution logic for user branches; conflicts in stacked bases are reported to the user (Blocked (conflict)). Stale branches and worktrees accumulate and need cleanup support.

### CON-009: Cross-platform MVP: Windows, macOS, Linux (D9)
**Description**: All three operating systems are MVP release targets.
**Impact**: Desktop framework, process management (process trees, signals vs. job objects), path handling, OS notifications, credential stores, installers and code signing must be solved for each OS; CI must test on all three.

### CON-010: Parallel execution requires Git worktrees (D10, D12)
**Description**: Parallel story execution (default limit 3) is in MVP scope but only in git mode; non-git workspaces are limited to one run at a time. Blocking dependencies must be honoured before a story starts (D11).
**Impact**: Isolation of parallel runs relies on one Git worktree per run; the design needs a scheduler, stacked-branch creation, worktree lifecycle management, and per-run process/resource tracking. Machine load and the agent provider's rate limits may constrain practical parallelism.

### CON-011: Technology choices are made in design
**Description**: Desktop framework, backend runtime, persistence mechanism and internal orchestration architecture are not prescribed by the intent and must be evaluated and recorded as ADRs during design.
**Impact**: `/generate-design` must compare alternatives against CON-009, NFR-001, NFR-021 and NFR-026.

### CON-012: Minimal infrastructure and dependencies
**Description**: The implementation must not introduce unnecessary infrastructure or dependencies on externally hosted services.
**Impact**: Prefer embedded components (e.g. embedded database) over servers; no containers, message brokers or cloud services.

### CON-013: Developed with Claude Code via a specification-driven process
**Description**: SpecForge itself is built using Claude Code following intent → requirements → design → stories → TDD implementation, incrementally.
**Impact**: Artifacts in this repository's `spec/` folder drive implementation; stories must be small and testable. Per intent §10, implementation starts with technical spikes (agent adapter incl. permission relay — validating D3 early —, stacked worktrees, process trees), followed by a thin end-to-end slice (project, story, agent run, review), then the remaining capabilities release by release (Release attribute per FR).

### CON-014: MVP scope exclusions
**Description**: Out of scope for the MVP (Release 1): multi-user collaboration, cloud project management, distributed execution, automated production deployment, enterprise identity management, external issue-tracker integrations, other agent runtimes, parallel execution across different agent runtimes, automatic agent selection, cross-agent collaboration, cost optimisation, autonomous backlog refinement. Capabilities assigned to Release 2/3 in the requirements (e.g. feature intents, chat writes, epic review) are not part of the MVP either.
**Impact**: These must not be built in the MVP, but the architecture must not preclude other runtimes or mixing runtimes across parallel runs.

### CON-015: SpecForge is licensed under Apache License 2.0
**Description**: SpecForge's own source code and distributions are licensed under the Apache License, Version 2.0 (product owner decision, 2026-10-13).
**Impact**: The repository needs `LICENSE` (Apache-2.0 text) and `NOTICE` files; distributed installers must include third-party license notices. Dependencies must be compatible with Apache-2.0 distribution: permissive licenses (MIT, BSD, ISC, Apache-2.0) are fine; weak copyleft (e.g. EPL-2.0, MPL-2.0) only as unmodified separate modules with notices; strong copyleft (GPL, AGPL) is not allowed in distributed artifacts. Proprietary dependencies (e.g. the Claude Agent SDK, governed by Anthropic's terms) need their redistribution terms checked, and must not be presented as covered by Apache-2.0. SpecForge does not redistribute the Claude Code binary; it uses the user's installation (ADR-006).
