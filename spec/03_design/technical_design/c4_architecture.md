# SpecForge — C4 Architecture

**Last updated:** 2026-10-14  
**Inputs:** intent v0.2 (D1–D22), FR-001 – FR-116, NFR-001 – NFR-032, CON-001 – CON-015

---

## Level 1 — System Context

```
                         ┌──────────────────────────────┐
   [User: architect /    │                              │
    developer / lead] ──►│          SpecForge           │
     desktop UI          │   (local desktop application)│
                         └──┬──────────┬──────────┬─────┘
                            │          │          │
            spawns/controls │  reads/  │ git CLI  │ OS services
                            ▼  writes  ▼          ▼
               ┌──────────────────┐ ┌────────────┐ ┌────────────────────────┐
               │ Claude Code       │ │ Project    │ │ OS: keychain/credential│
               │ runtime (local,   │ │ workspace  │ │ store, notifications,  │
               │ user-installed)   │ │ + Git repo │ │ file system, processes │
               └────────┬─────────┘ └────────────┘ └────────────────────────┘
                        │ HTTPS (outside SpecForge's control, disclosed – FR-057)
                        ▼
               ┌──────────────────────────────────┐
               │ AI provider configured for the   │
               │ agent (Anthropic API, Bedrock,   │
               │ Vertex AI, Foundry)              │
               └──────────────────────────────────┘
```

- **User** — the only actor authorising work (CON-005).
- **Claude Code runtime** — the coding agent; future: OpenCode, Cline (FR-059).
- **Project workspace / Git** — source code, `spec/` artifacts (source of truth), branches and worktrees.
- **OS services** — credential store for secrets (NFR-006), notifications (FR-033), process management.
- **AI provider** — reached only by the agent process, never by SpecForge itself; SpecForge stores user-entered provider credentials only in the OS credential store and passes them only into the agent process (CON-002, CON-004, NFR-009, NFR-027).

---

## Level 2 — Containers

SpecForge is a single installable Electron application made of three OS processes plus spawned agent processes, and a local SQLite database (ADR-001, ADR-002).

```
┌─────────────────────────────────── SpecForge (Electron app) ───────────────────────────────────┐
│                                                                                                 │
│  ┌──────────────────────────┐   typed IPC (contextBridge,   ┌──────────────────────────────┐   │
│  │ Renderer (UI)            │◄─ zod-validated req/resp + ──►│ Main process (Shell)         │   │
│  │ React + TypeScript       │   event subscriptions)        │ Electron main, TypeScript    │   │
│  │ board, editors, diffs,   │                               │ windows, menus, lifecycle,   │   │
│  │ run streams, settings    │                               │ notifications, safeStorage,  │   │
│  └──────────────────────────┘                               │ IPC broker, close guard      │   │
│                                                             └──────────────┬───────────────┘   │
│                                                    MessagePort (structured │clone, typed)       │
│                                                                            ▼                   │
│                                       ┌───────────────────────────────────────────────────┐    │
│                                       │ Core service (Electron utilityProcess, Node/TS)   │    │
│                                       │ domain, application services, scheduler,          │    │
│                                       │ workspace indexer, git/snapshot, agent adapters,  │    │
│                                       │ permission engine, persistence                    │    │
│                                       └───┬───────────────┬────────────────┬──────────────┘    │
│                                           │ better-sqlite3 │ fs / chokidar  │ child processes  │
└───────────────────────────────────────────┼───────────────┼────────────────┼──────────────────┘
                                            ▼               ▼                ▼
                              ┌──────────────────┐ ┌──────────────┐ ┌────────────────────────────┐
                              │ SQLite DB (WAL)  │ │ Workspace    │ │ Agent processes (1 per run)│
                              │ <appdata>/       │ │ files + Git  │ │ Claude Code via Agent SDK  │
                              │ specforge.db     │ │ worktrees    │ │ (user's executable); git   │
                              │ + logs, snapshots│ │              │ │ CLI invocations            │
                              └──────────────────┘ └──────────────┘ └────────────────────────────┘
```

| Container | Technology | Responsibility | Rationale |
|---|---|---|---|
| Renderer | React 19, TypeScript, Vite, Tailwind + Radix UI, dnd-kit, React Flow, CodeMirror 6 (Markdown editor, `@codemirror/merge` diffs) | All UI; no Node access (sandboxed, `contextIsolation`) | Rich-client UX (§6), mature components for boards, graphs, diffs |
| Main process | Electron main (TypeScript) | Window/app lifecycle, IPC broker between renderer and core, OS notifications, `safeStorage` encryption, close-with-active-runs guard (FR-041) | Keep thin so it never blocks UI event delivery |
| Core service | Electron `utilityProcess` running Node 22+/TypeScript | All business logic and I/O | Isolates CPU/IO from the UI and from window management (NFR-001); crash of core does not kill the UI (shows "reconnecting") |
| SQLite DB | SQLite 3 via better-sqlite3, WAL, FTS5 | Registry, index, runs, events, permissions, queue | Embedded, zero-admin, transactional, crash-safe (NFR-015, CON-012) |
| Workspace | Markdown/YAML files, Git repo + worktrees | Specs and code (source of truth) | D2, D6 |
| Agent processes | Claude Code runtime launched through `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` | Execute specification and implementation runs | ADR-006 |

---

## Level 3 — Components of the Core service

```
┌──────────────────────────────────────── Core service ───────────────────────────────────────────┐
│                                                                                                  │
│  IPC API layer (command & query handlers, event publisher)                                       │
│     │                                                                                            │
│  ┌──▼──────────────────────── Application services ─────────────────────────────────────────┐  │
│  │ ProjectService  SpecService  BoardService  ExecutionService  ReviewService  SettingsService│  │
│  │ SetupService  DashboardService  QualityService  DecisionService  PlanService  ChatService │  │
│  │ FeatureService  ImpactService                                                            │  │
│  └──┬─────────────┬────────────┬──────────────┬─────────────────┬──────────────┬─────────────┘  │
│     │             │            │              │                 │              │                │
│  ┌──▼─────────────▼────────────▼──────────────▼─────────────────▼──────────────▼─────────────┐  │
│  │ Domain (pure TS): Story state machine · DependencyGraph · SchedulingPolicy ·               │  │
│  │ PermissionPolicy · Artifact/Trace model · RunLifecycle · domain events                      │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│     ▲ ports (interfaces)                                                                         │
│  ┌──┴──────────────┐ ┌───────────────┐ ┌──────────────────┐ ┌───────────────┐ ┌──────────────┐  │
│  │ Scheduler       │ │ Workspace     │ │ ExecutionSpace   │ │ AgentAdapter  │ │ Persistence  │  │
│  │ (single-writer  │ │ Indexer +     │ │ Manager (git     │ │ registry:     │ │ (repositories│  │
│  │ event loop,     │ │ FileWatcher + │ │ worktrees,       │ │ ClaudeCode,   │ │ on SQLite,   │  │
│  │ queue, slots)   │ │ ArtifactStore │ │ stacking,        │ │ Mock          │ │ migrations)  │  │
│  └─────────────────┘ └───────────────┘ │ snapshots, diff) │ └──────┬────────┘ └──────────────┘  │
│                                        └──────────────────┘        │                             │
│  ┌──────────────────┐ ┌───────────────────┐ ┌────────────────┐ ┌───▼─────────────┐               │
│  │ ContextAssembler │ │ PermissionBroker  │ │ ProcessRegistry│ │ ResultParser    │               │
│  │ (prompts, dep    │ │ (rules → relay →  │ │ (pids, tree    │ │ (structured     │               │
│  │ context)         │ │ user, audit)      │ │ kill, orphans) │ │ result, zod)    │               │
│  └──────────────────┘ └───────────────────┘ └────────────────┘ └─────────────────┘               │
│  ┌──────────────────┐ ┌───────────────────┐ ┌────────────────┐                                   │
│  │ SecretRedactor   │ │ NotificationHub   │ │ SnapshotStore  │  (NotificationHub → main process) │
│  └──────────────────┘ └───────────────────┘ └────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|---|---|
| IPC API layer | Typed commands/queries (zod schemas shared with renderer); pushes domain events and run-stream batches to the UI |
| Application services | Use-case orchestration (see `service_design.md`), incl. workflow services: SetupService (setup wizard, limited mode, health check), DashboardService (dashboard read model, phase status, next step), QualityService (AI quality checks), DecisionService (decision review, Release 2), PlanService (waves, critical path, Release 2), ChatService (threads, chat runs; read-only in Release 1, change tracking/revert in Release 2), FeatureService (feature wizard, feature intents, delta change sets, ideas, baselines — Release 2), ImpactService (trace + AI impact, in-flight detection — Release 2) |
| Domain | Pure, framework-free rules: transitions (FR-021), acyclic blocking graph (FR-063), start conditions (FR-065/066), permission decisions (FR-051, NFR-007/008), artifact approval (FR-013) |
| Scheduler | Single serialised event loop deciding which queued story, correction, retry or resume starts; enforces the concurrency limit and the non-git shared-workspace rule (FR-116b); reacts to domain events (ADR-009) |
| Workspace Indexer / FileWatcher / ArtifactStore | Parse Markdown + front-matter of the main workspace only (run worktrees never indexed, FR-116a), maintain index, atomic writes, external-change reconciliation (FR-018) |
| ExecutionSpace Manager | Branch/worktree creation incl. stacking and integration merges (ADR-010); snapshots for non-git via SnapshotStore (ADR-011); diff computation (FR-043); merge detection `isMerged` (FR-115, driven by ProjectService); working-copy status (FR-116c); cleanup |
| SnapshotStore | Content-addressed snapshots and blob store: non-git runs (ADR-011), spec-run target folders (ADR-014), feature delta scratch copies (ADR-021), chat before-content (ADR-016) |
| AgentAdapter registry | Vendor-neutral `AgentAdapter` port (ADR-008); `ClaudeCodeAdapter` (ADR-006) and `MockAdapter` (tests, NFR-022) |
| ContextAssembler | Builds the run prompt from story, specs, instructions, dependency and concurrency context (FR-037, FR-068) |
| PermissionBroker | Receives adapter permission callbacks, applies PermissionPolicy, relays to the user, records audit (FR-032, FR-051, NFR-012) |
| ProcessRegistry | Tracks agent PIDs in DB; cross-platform process-tree termination; orphan cleanup at start (FR-041) |
| ResultParser | Extracts and validates the structured result (FR-036) |
| SecretRedactor | Redacts known secret values from every event before persistence/display (NFR-006) |
| NotificationHub | Pending-decision read model and notification fan-out (FR-033, FR-056) |

---

## Architecture Decision Records

**Decision log** — reviewed one by one with the product owner on 2026-10-13.

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Electron + TypeScript | Accepted |
| ADR-002 | Renderer / main / core utilityProcess | Accepted |
| ADR-003 | Modular monolith, hexagonal, CI-enforced layering | Accepted |
| ADR-004 | Workspace Markdown = source of truth; offer "Commit spec changes" | Accepted |
| ADR-005 | SQLite via better-sqlite3 + Kysely | Accepted |
| ADR-006 | Agent SDK with user's executable | Accepted, conditional on spike S1 |
| ADR-007 | API key / cloud provider auth only | Accepted |
| ADR-008 | Adapter contract; fenced `specforge-result` JSON | Accepted |
| ADR-009 | Single-writer scheduler; all implementation/correction/retry/resume starts via Scheduler; corrections jump queue; spec runs outside limit | Accepted |
| ADR-010 | Worktree per run in app-data folder; stacked branches; integration via merge-tree (Git ≥ 2.38) with scratch-worktree fallback | Accepted (confirmed by S2, amended 2026-10-15) |
| ADR-011 | Content-addressed snapshots for non-git | Accepted |
| ADR-012 | safeStorage; weak Linux backend → warn + acknowledgement | Accepted |
| ADR-013 | SpecForge-owned permission policy; suggested rules, user enables | Accepted |
| ADR-014 | Spec runs in main workspace, restricted writes, validated diff | Accepted |
| ADR-015 | zod-typed IPC contract | Accepted |
| ADR-016 | Chat agent works in the main workspace; read-only in Release 1; edits specs + code via relay, tracked and revertible from Release 2 | Accepted (from intent D17) |
| ADR-017 | Rule-based (deterministic) next-step and phase-status engine | Accepted |
| ADR-018 | Capability gating for limited mode; active runs fail naturally on capability loss | Accepted |
| ADR-019 | Layered permission rules: live-inherited global defaults + project overrides | Accepted |
| ADR-020 | Epics as planning artifacts with derived status; swimlanes; per-story merges | Accepted (from intent D21) |
| ADR-021 | Feature intents as delta artifacts with change sets, impact analysis and rework stories (Release 2) | Accepted (from intent D22) |
| ADR-022 | TypeScript pinned to 6.0.x (TS 7 lacks the compiler API needed by lint/layering tooling) | Accepted (2026-10-15) |

### ADR-001: Electron + TypeScript as desktop framework
**Status**: Accepted (2026-10-13)
**Context**: The MVP must ship on Windows, macOS and Linux (D9/CON-009), be a rich client (§6), and drive Claude Code whose official programmatic interface (Agent SDK) is a TypeScript/Node library (ADR-006). Candidates: Electron, Tauri, .NET MAUI/Avalonia, Flutter.
**Decision**: Use Electron with TypeScript end-to-end (renderer, main, core).
**Consequences**:
- (+) One language for UI, core and adapter; the Agent SDK runs natively in the core process — no sidecar.
- (+) Identical Chromium rendering on all OSes (Tauri relies on WebView2 / WKWebView / WebKitGTK, with Linux differences).
- (+) Mature packaging (electron-builder), `safeStorage`, notifications, `utilityProcess`.
- (−) Larger install (~100–150 MB) and memory footprint than Tauri; accepted for a developer tool.
- (−) Electron security hardening required (sandbox, contextIsolation, CSP, no remote content) — see technical_decisions §4.
- Alternative Tauri rejected: would need a bundled Node sidecar for the Agent SDK plus Rust for the backend (two runtimes), uneven WebView behaviour on Linux.

### ADR-002: Three-process layout (renderer / main / core utilityProcess)
**Status**: Accepted (2026-10-13)
**Context**: NFR-001 requires no UI freeze while up to 3+ agents stream output; file indexing, SQLite and git operations are blocking or CPU-bound.
**Decision**: Run all business logic in an Electron `utilityProcess` ("core"). Main process only brokers IPC and owns OS integrations. Renderer is sandboxed and talks to core via main using typed messages over `MessagePort`. Run-stream events are batched (≤ 50 ms) before being pushed to the renderer.
**Consequences**: (+) UI and window handling remain responsive; core can use synchronous better-sqlite3 safely. (+) Core crash is recoverable (main restarts it; runs are marked interrupted). (−) IPC contract must be maintained (zod schemas, versioned). (−) Debugging spans three processes.

### ADR-003: Modular monolith with hexagonal (ports & adapters) structure
**Status**: Accepted (2026-10-13)
**Context**: NFR-021/NFR-022 require separation of UI, domain, persistence and agent adapters, and new agent runtimes without core changes. A local single-user app gains nothing from distributed services (CON-012).
**Decision**: One code base, packages: `domain` (pure), `application`, `adapters/*` (agent, git, fs, sqlite, os), `ipc-contract`, `ui`. Domain depends on nothing; adapters implement domain/application ports. Dependency rules enforced in CI (dependency-cruiser).
**Consequences**: (+) Testable domain with high coverage (NFR-023), mock adapter for E2E. (−) Some boilerplate for ports.

### ADR-004: Workspace Markdown as source of truth, SQLite as rebuildable index
**Status**: Accepted (2026-10-13) (implements D2)
**Context**: Artifacts must be human-readable, versionable, editable externally; execution data is high-volume and machine-local.
**Decision**: Specs, story status, approval and dependencies live in Markdown front-matter of the **main workspace**, which is authoritative: run worktrees are never indexed (FR-116a). The DB indexes them (rebuildable via "Rebuild index") and additionally owns execution data. Writes to workspace files are atomic (write temp + rename) and recorded with a content hash so the watcher can ignore self-writes.
**Consequences**: (+) Git-friendly, tool-independent artifacts. (−) Reconciliation logic needed (FR-018). (−) Status changes make the user's working copy dirty. SpecForge never commits automatically; instead it shows uncommitted changes under `spec/` and `.specforge/` and offers a one-click **"Commit spec changes"** (only those paths, generated message, on the current branch of the main workspace; never code files) (FR-072, FR-116a). (−) Implementation runs are denied writes under `spec/` and `.specforge/` (built-in deny rule) so agent branches never carry status/dependency changes that could conflict on merge.

### ADR-005: SQLite (better-sqlite3) for local persistence
**Status**: Accepted (2026-10-13)
**Context**: Need transactional, crash-safe, embedded storage with full-text search for logs (NFR-005, NFR-015), no server (CON-012).
**Decision**: SQLite in WAL mode via better-sqlite3 (synchronous, in core process) with Kysely as typed query builder and numbered SQL migrations. Large raw outputs spill to sidecar log files.
**Consequences**: (+) Single file, robust, fast. (−) Native module must be rebuilt per Electron version/platform (electron-builder handles it). Alternative: Node's built-in `node:sqlite` — reconsider when stable in Electron's Node.

### ADR-006: Claude Code integration via the Claude Agent SDK, pointing to the user's executable
**Status**: Accepted, conditional on spike S1 (2026-10-13) — if S1 fails, fall back to the CLI + PreToolUse hook adapter
**Context**: The adapter needs streaming events, live permission relay (D3), cancellation, session resume (D5) and per-run configuration. Options:
(a) spawn `claude -p --output-format stream-json` and relay permissions via `--permission-prompt-tool` (MCP) — the flag is documented but its request/response payload is **not documented**;
(b) spawn the CLI and relay via a `PreToolUse` hook that calls back into SpecForge — documented, but hook timeouts (600 s default, fail-open unless `onFailure: "block"`) complicate long human waits;
(c) TypeScript Agent SDK `query()` — documented `canUseTool(toolName, input, {signal, toolUseID, …}) → {behavior: "allow", updatedInput?} | {behavior: "deny", message}`, `abortController`, `resume`, `cwd`, `model`, `permissionMode`, `allowedTools`/`disallowedTools`, `mcpServers`, `systemPrompt` (preset `claude_code` + `append`), `maxTurns`, and `pathToClaudeCodeExecutable`.
**Decision**: Use (c). Each run is one `query()` call in the core process with `cwd` = worktree, `permissionMode: "default"`, `pathToClaudeCodeExecutable` = the configured local executable (CON-002), `abortController` for cancel, `resume` = stored session id for corrections. `canUseTool` routes to PermissionBroker and awaits the user's decision without timeout (the SDK blocks the tool call until answered). Option (b) is kept as documented fallback adapter if S1 fails.
**Consequences**:
- (+) Fully documented, typed, no fragile output parsing; permission relay is first-class.
- (+) One agent process per run → natural isolation for parallel runs (D10).
- (−) Auto-approved calls (via Claude Code's own allow rules/settings) never reach `canUseTool`; SpecForge therefore passes no allow-lists to the agent and keeps all rules in its own PermissionPolicy (ADR-013). Spike S1 must verify that user/project Claude settings cannot auto-approve actions that bypass the relay, and configure setting sources accordingly.
- (−) SDK version coupling; adapter pins a tested SDK range and checks the executable's version (minimum version recorded in settings).
- Product must not be branded with "Claude Code" naming (Agent SDK terms).

### ADR-007: Agent authentication is configured by the user; SpecForge offers no claude.ai login
**Status**: Accepted (2026-10-13)
**Context**: Anthropic's Agent SDK guidance: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." SpecForge must not violate the runtime's terms (NFR-027).
**Decision**: Supported authentication for the Claude Code adapter in SpecForge is an Anthropic API key or a cloud provider configuration (Bedrock, Vertex AI, Foundry), entered by the user in settings, stored only in the OS credential store (ADR-012) and passed only into the agent process environment; SpecForge never calls model APIs itself (CON-002, CON-004, NFR-027). SpecForge does not implement, proxy or advertise subscription login, and reusing a local Claude Code subscription login is not a supported configuration. Should Anthropic confirm in writing that this is permitted, it may be revisited in a new ADR.
**Consequences**: (+) Compliant by default. (−) Users need an API key or cloud account; agent usage is billed per token — SpecForge shows usage/cost reported by the runtime (RunResult.usage).

### ADR-008: Vendor-neutral AgentAdapter contract
**Status**: Accepted (2026-10-13)
**Context**: CON-003, FR-028, NFR-022.
**Decision**: Port:
```ts
interface AgentAdapter {
  readonly type: string;                       // "claude-code", "mock", later "opencode"
  detect(): Promise<RuntimeInfo>;              // path, version, capabilities
  verify(cfg: RuntimeConfig): Promise<VerifyResult>;
  start(req: RunRequest, hooks: RunHooks): RunHandle;
}
interface RunRequest { runId; kind; cwd; prompt; systemAppend; config: AgentConfig; resumeSessionId?; env }
interface RunHooks {
  onEvent(e: AgentEvent): void;                // output | tool_use | tool_result | status | usage | error
  onPermission(p: PermissionAsk): Promise<PermissionAnswer>;   // allow | deny(+message)
}
interface RunHandle { sessionId: Promise<string>; done: Promise<AgentOutcome>; cancel(reason): Promise<void>; }
```
Structured results (FR-036) are part of the contract: the prompt instructs the agent to end with a fenced block ```` ```specforge-result ```` containing JSON per the published schema; `ResultParser` extracts it from the final result text and validates with zod. Capabilities flag optional features (resume, permission relay) so the core degrades gracefully for future adapters.
**Consequences**: (+) Core is adapter-agnostic; MockAdapter drives the full E2E suite. (−) Fenced-block extraction relies on agent compliance → "result unavailable" path (FR-036) and computed diffs remain authoritative.

### ADR-009: Single-writer, event-driven scheduler
**Status**: Accepted (2026-10-13)
**Context**: Parallel runs (D10) and dependency queuing (D11) create races (two slots freeing, approval and cancel at once). NFR-014 requires the limit never be exceeded and no queued story be lost.
**Decision**: The Scheduler processes domain events (`StoryAuthorised`, `CorrectionRequested`, `RetryRequested`, `ResumeRequested`, `RunFinished`, `StoryApproved`, `DependencyChanged`, `LimitChanged`, `ConflictResolved` (user *Re-check*, `queue.recheck`), `StoryDequeued`, `WorkspaceWriterChanged`) strictly sequentially from an in-process queue. Each evaluation runs in one SQLite transaction: read queue + active runs → pure `SchedulingPolicy.decide()` → persist `preparing` runs → then launch via the `RunLauncher` port. It is the **only** start path for implementation, correction, retry and resume runs (ReviewService and ExecutionService post events, they never launch directly). Slot rules (FR-027): these four kinds count toward the limit; failed, interrupted and cancelled runs free their slot; order: corrections and resumes first, then FIFO by authorisation time. Spec, chat, quality-check, impact, feature-review, analyze, decision_options and connection_test runs are outside the limit. `SchedulingPolicy` queue reasons: `dependency`, `slot`, `workspace` (non-git mode: an implementation run does not start while a write-capable chat or spec run is active — "waiting for workspace", FR-116b), `conflict` (*Blocked (conflict)*, left only by user *Re-check* or removal).
**Consequences**: (+) Deterministic, property-testable (fast-check). (+) Restart-safe: queue lives in DB. (−) Start latency bounded by event processing (target < 5 s, NFR-004).

### ADR-010: One Git worktree per run, stacked branches for blocking dependencies
**Status**: Accepted — confirmed by spike S2 (2026-10-14, `docs/spikes/S2-stacked-worktrees.md`); amended 2026-10-15 (integration via merge-tree) (implements D6, D11, FR-038, FR-067)
**Context**: Parallel runs need isolated working copies; dependent stories need predecessors' unmerged code; SpecForge never merges into the base branch or the user's branches; it may only create temporary integration commits for stacked bases (D4, CON-008, FR-067).
**Decision**:
- Worktree root defaults to a short path under app data (`<appdata>/wt/<projectShortId>/<storyId>`) to avoid Windows path-length issues.
- Base selection: predecessors merged into base branch (`git merge-base --is-ancestor`) are ignored; zero unmerged predecessors → base branch HEAD; one → its branch HEAD; several → a temporary integration commit built **without checkout** via `git merge-tree --write-tree` + `git commit-tree` (Git ≥ 2.38, default); on Git 2.30–2.37 SpecForge automatically falls back to merging in a scratch worktree (`git merge --no-ff`), which is always removed afterwards; conflict (files reported by merge-tree `--name-only`) → `Blocked (conflict)`.
- Branch `specforge/<storyId>` (suffix `-2`, `-3` for retries from fresh base); the run's `base_ref` is recorded so diffs show only the story's own changes.
- All git calls use `execFile` with argument arrays (NFR-011) and `-c core.longpaths=true` (paths > 260 characters on Windows). Minimum Git **2.30**; Git ≥ **2.38** recommended (setup shows an upgrade hint for 2.30–2.37).
- Git invocations are a performance budget on Windows (≈ 0.3–0.5 s per call, S2): batch where possible (e.g. one `git branch --merged <base>` instead of one `merge-base` per predecessor) to keep run start within NFR-004.
- If the main working copy has uncommitted changes when a run is started, the user is warned that these changes are not part of the run's base (FR-116c).
- **Merge detection (FR-115)**: a story branch counts as merged when `git merge-base --is-ancestor <branch> <base>` succeeds; checked on project open, on window focus, after git operations SpecForge performs, periodically (default 60 s) and via manual *Refresh*. It sets the story's `mergedAt`, drives epic *Merged* status, the "merged" count and the "Merge n approved branches" next step, and switches later stacked bases to the base branch.
**Consequences**: (+) Real isolation; reviewable branches; correct stacking. (−) Branch/worktree accumulation → cleanup command; disk usage per worktree. (−) User must merge in order (shown on approval).

### ADR-011: Content-addressed snapshots for non-git workspaces
**Status**: Accepted (2026-10-13) (implements D6, FR-039)
**Context**: Non-git runs operate in place; review needs diffs; reject needs restore.
**Decision**: Before the run, walk the workspace (respecting exclusions, `.gitignore`-style), hash files (xxhash/sha-256) and store new blobs in `<appdata>/snapshots/<project>/objects`. Manifest in DB. Diff = current tree vs. manifest; restore = rewrite changed/deleted files and delete added ones. Concurrency limit forced to 1 (D12). Because the working copy is shared (FR-116b), an implementation run does not start while a write-capable chat or spec run is active (queued, reason `workspace`, ADR-009), and chat/spec writes are denied while an implementation run is active (ADR-013).
Snapshots are incremental: files whose size and modification time match the previous snapshot of the same workspace reuse its entry without being read (like Git's index). The initial snapshot is taken in the background when a non-git project is opened.
**Consequences**: (+) Works without Git; pre-run snapshots of 5,000 files / 500 MB take ≈ 1.3 s (US-047). (−) The cold initial snapshot reads and copies every file once (≈ 7 s Linux, 10–13 s Windows with on-access antivirus for 500 MB); it shows progress and suggests using Git for large workspaces.

### ADR-012: Secrets in the OS credential store, redaction everywhere
**Status**: Accepted (2026-10-13)
**Context**: NFR-006, NFR-010.
**Decision**: Secret values (API keys, secret env vars) are encrypted with Electron `safeStorage` (backed by DPAPI / Keychain / libsecret) by the main process; the core holds only references and requests decryption just-in-time when building a run's environment. SecretRedactor replaces any known secret value (and common key patterns, e.g. `sk-ant-…`) in events before persistence or display. DB and app-data files are created with user-only permissions.
**Consequences**: (+) No plaintext secrets at rest. (−) On Linux without a secret service, `safeStorage` falls back to weak encryption — SpecForge detects this and warns, refusing to store secrets unless the user acknowledges.

### ADR-013: SpecForge-owned permission policy (deny-by-default, relay-first)
**Status**: Accepted (2026-10-13) (implements D3, FR-032, FR-051, NFR-007, NFR-008)
**Context**: Decisions must be auditable and human-controlled; the agent's own allow rules would bypass the relay (ADR-006).
**Decision**: Agent runs start with `permissionMode: "default"` and no agent-side allow-lists; every permission ask reaches `PermissionBroker`:
1. Built-in denies only: writes to `spec/**` and `.specforge/**` in implementation runs (FR-116a); chat/spec writes in non-git mode while an implementation run is active (FR-116b); story status changes by agents (FR-023); in Release 1 all chat writes (FR-089).
2. Outside-workspace actions → always relayed, flagged, never rule-decided.
3. Effective rules (global defaults from setup, minus those disabled in the project, plus project rules; filtered by the `appliesTo` bucket of the run kind, table below) — deny rules → deny; allow rules → allow (logged "by rule", with origin).
4. Otherwise → relay to user; run status `awaiting_approval` (pauses idle and max-duration timeouts, FR-042); no prompt timeout; dismissal/shutdown → deny (`decided_by = default_deny`).
5. New projects get **suggested rules** (e.g. file edits inside the run's worktree, detected test/build commands such as `npm test`, `pytest`, `mvn test`) that the user can enable with one click; none are enabled by default.
Run kind → `appliesTo` bucket:

| Run kind | Bucket |
|---|---|
| implement, correct | `implementation` |
| chat | `chat` |
| clarify, generate, refine, quality_check, decision_options, analyze, feature_review, impact | `spec` |
| connection_test | none — no tools needed; no rules applied, all writes denied |

**Consequences**: (+) Single audited decision point. (−) Many prompts initially; mitigated by "Always allow for this project" and the suggested rules.

### ADR-014: Specification generation as agent runs with validated file output
**Status**: Accepted (2026-10-13) (implements D1, FR-006 – FR-011, FR-014)
**Context**: No direct model-API calls (CON-004).
**Decision**: Specification runs use the same adapter in the **main workspace** with write permission restricted (by PermissionPolicy) to the target `spec/` subfolder. Before the run, SpecForge snapshots the target folder; after it, it validates produced files (front-matter schema, unique IDs, link targets, dependency targets, acyclic dependencies, a rationale per proposed dependency, required sections and requirement links of epics and stories) and shows a diff for Keep/Discard (Discard restores the snapshot). Clarification uses multi-turn sessions (`resume`) with the structured result carrying questions. In non-git mode, spec-run writes are denied while an implementation run is active, and an active write-capable spec run holds back implementation starts (FR-116b, ADR-009/011). The same snapshot mechanism provides the scratch copy for feature delta runs (ADR-021).
**Consequences**: (+) Same infrastructure, same permission model. (−) Generation latency is that of a full agent session.

### ADR-015: Typed IPC contract shared by UI and core
**Status**: Accepted (2026-10-13)
**Decision**: A package `ipc-contract` defines all commands, queries and events as zod schemas with inferred TS types; both sides validate at the boundary; contract version checked on connect.
**Consequences**: (+) Type safety across processes, protection against malformed messages. (−) Schema maintenance.

### ADR-016: Project chat runs in the main workspace with tracked, revertible changes
**Status**: Accepted (2026-10-13, product owner decision D17)
**Context**: The dashboard chat is a full agent that may edit specifications and code (D17). Worktree isolation (ADR-010) is tied to stories; the chat has no story.
**Decision**: Each chat thread is one resumable agent session (`resume`) running with `cwd` = main workspace and `kind = chat`. **Release 1**: the chat is read-only — all write requests are denied by policy with an explanation (FR-089). **Release 2** (FR-091): every permission-requiring action passes PermissionBroker with rules filtered for `appliesTo ∈ {chat, all}`. Before a chat message's run starts, SpecForge records the base state of touched files lazily: on each approved write request it stores the file's prior content (git: `HEAD`/index blob or working-tree content; non-git: snapshot blob) as `ChatChange.beforeRef`; after the run, actual changes are computed per message. *Revert* restores `beforeRef`. Spec files changed → Draft + impact analysis via the normal indexer. Built-in policy additions: deny story `status` changes and any SpecForge-internal paths except spec content; in non-git mode deny writes while an implementation run is active (and a write-capable chat run holds back implementation starts, FR-116b); overlap warning when the file is in `file_touch` of an active/unmerged story.
**Consequences**: (+) Fast conversational changes with full audit and undo. (−) Code changes bypass the Review state and worktree isolation — labelled "outside Kanban flow" in activity; user's working copy becomes dirty (normal for direct edits). (−) Chat runs do not count toward the concurrency limit but consume provider capacity.

### ADR-017: Deterministic phase-status and next-step engine
**Status**: Accepted (2026-10-13)
**Context**: The dashboard must show the current phase and a recommended next step (FR-080, FR-086) that is reliable, instant and explainable.
**Decision**: Implement phase status and next step as pure domain functions over the indexed project state (artifacts, approvals, impact flags, stories, runs, queue, pending decisions) with a fixed priority list (see domain model NextStep). No AI involvement; the chat may add agent suggestions shown separately. Recomputed on every relevant domain event; pushed to the UI via the dashboard read model.
**Consequences**: (+) Predictable, testable, no cost, < 2 s freshness (NFR-030). (−) Rules must be maintained as workflow evolves.

### ADR-018: Capability gating for limited mode
**Status**: Accepted (2026-10-13)
**Context**: Setup may be skipped (D13); AI functions must then be disabled consistently.
**Decision**: SetupService publishes a `Capabilities` object (`agentAvailable`, `providerConfigured`, `gitAvailable`) after each health check. Application services check capabilities before any AI action and return a typed `CapabilityMissing` error; the UI binds button state and tooltips to the same object. Health check runs at startup, after settings changes and on demand.
On capability loss while runs are active, SpecForge does not stop them: active runs continue and, if the agent errors (e.g. revoked key), fail gracefully as *Failed* with the reason (NFR-017) and remain retryable; new AI actions are blocked immediately and the limited-mode banner explains the cause.
**Consequences**: (+) One source of truth for enabled features; no partial failures deep inside runs; no unnecessary interruption of runs that might still succeed. (−) A run may fail late instead of being stopped early.

### ADR-019: Layered permission rules (global defaults + project rules)
**Status**: Accepted (2026-10-13) — live inheritance (global changes apply to all projects immediately; projects store only overrides and own rules)
**Context**: Setup defines tools accepted without prior approval (D13) for all projects; projects need their own rules (FR-051).
**Decision**: `permission_rule` has `scope` (`global` | `project`). Effective rules for a run = global rules not disabled for the project ∪ project rules, filtered by `appliesTo`; deny beats allow; outside-workspace actions are never rule-decided (ADR-013). Changing a global rule affects all projects immediately; the decision log records which rule (and scope) decided each request.
**Consequences**: (+) Configure once, adjust per project. (−) Users must understand inheritance — the settings UI shows origin per rule.

### ADR-020: Epics as planning artifacts with derived status
**Status**: Accepted (2026-10-13, product owner decision D21)
**Context**: Stories forming one bigger feature need grouping for planning, overview and agent coherence, without introducing a second execution workflow.
**Decision**:
- Epics are Markdown artifacts (`spec/04_user_stories/epics/`); stories reference one epic via front-matter. Epics are indexed like other elements (DB table `epic`).
- Epic status and progress are **derived** from stories (view `v_epic_status`); only the epic review outcome is persisted in the epic file. Epics are never cards, never moved on the board and never executed.
- The board renders swimlanes per epic (default) or flat; the domain's transition rules (FR-021) are unchanged — lanes are a projection.
- Epic dependencies are derived from story dependencies (no separate declaration; display Release 2, FR-097).
- Git: unchanged — one branch per story, merged individually by the user (D4, ADR-010); *Merged* epic status is computed from story merge detection (FR-115).
- *Start epic* (Release 2, FR-098) is a batch of individual human authorisations (FR-022) routed through the Scheduler.
- Epic context is added to story runs by the ContextAssembler; the epic review (Release 2, FR-100) AI completeness check is a `quality_check` run with target epic. Adding a story to an epic whose review outcome is confirmed/skipped clears that outcome; the epic returns to *In progress*.
**Consequences** (ADR-020): (+) Feature-level overview and planning with no new state machine; consistent with existing safety rules. (−) No feature-level integration branch — a partially merged epic can exist on the base branch; users who need feature toggling must handle it in code. (−) Derived status depends on correct story–epic assignment; the quality check reports unassigned stories and uncovered requirements.

### ADR-021: Feature intents as delta artifacts (Release 2)
**Status**: Accepted (2026-10-13, product owner decision D22)
**Context**: Existing projects evolve: new ideas must be integrated without regenerating approved specs, without reopening Done work, and without disturbing in-flight stories.
**Decision**:
- New features are **feature intents** (`spec/01_intent/FI-xxx-<slug>.md`, beside the main intent) created via a guided wizard with an AI `feature_review` run (enhance, overlaps/conflicts, questions; multi-turn via session resume).
- Each feature has its own phase stepper (PhaseStatus per feature) reusing the existing phase loop, quality check and decision review.
- **Impact analysis** = immediate trace-graph traversal + asynchronous `impact` agent run; the user-confirmed impact list scopes all delta generation (ContextAssembler passes only the scoped elements in full, the rest as index).
- Delta generation produces **change sets** (new / modified / deprecated items) stored in DB and applied per accepted item to the Markdown files; IDs are never renumbered; deprecation instead of deletion; every item links to the feature (`introduces` / `changes`).
- **Change-set production**: the delta run writes into a scratch copy of the target spec folder (snapshot via SnapshotStore, the ADR-014 mechanism); SpecForge diffs the result against the current files, splits the diff per element (heading with element ID) into change items (`new` / `modified` / `deprecated`, with patch), restores the folder, and applies only accepted items to the real files (optimistic concurrency per file).
- Lifecycle: a feature intent is *Done* when all stories linked to it (`feature: FI-xxx`) are Done. *Withdrawn* is terminal: open change sets are discarded, already-applied delta changes stay (the user may deprecate them manually), linked not-started stories are flagged for a keep/delete decision.
- Done stories are immutable; affected functionality gets **rework stories** (`reworks:`), whose context includes the original story's run summary and changed files.
- **In-flight protection**: applying a change set first computes affected queued/running/in-review stories (via trace links and `file_touch`) and blocks until the user decides per story. *Apply in corrections* pre-fills correction feedback for stories in Review, and for running stories stores it as pending feedback pre-filled into *Request corrections* when the story reaches Review; the user always triggers the correction (no system-initiated Review → In Progress).
- Ideas live in `spec/01_intent/ideas.md`; baselines are annotated Git tags indexed in DB.
**Consequences**: (+) Focused reviews and full traceability per feature; approved work stays stable. (−) More artifacts and states (feature lifecycle, change sets); concurrent features touching the same elements can produce conflicting change sets — applied with optimistic concurrency (a stale change item must be regenerated).

### ADR-022: TypeScript 6.0.x until the tooling supports TypeScript 7
**Status**: Accepted (2026-10-15, product owner decision)
**Context**: TypeScript 7 is the native (Go) compiler and does not expose the JavaScript compiler API. typescript-eslint (supports TypeScript < 6.1) and dependency-cruiser (TypeScript parsing for the layering rules, ADR-003) depend on that API; with TS 7 linting failed and the layering check found no dependencies (US-004).
**Decision**: Pin `typescript` to `~6.0` for the whole workspace (build, type-check, lint, layering). Re-evaluate quarterly, or when typescript-eslint and dependency-cruiser support TypeScript 7; a mixed setup (TS 7 for builds, TS 6 for tooling) is not used, to avoid two compilers disagreeing.
**Consequences**: (+) Working lint and enforced layering. (−) No speed-up from the native compiler for now; a later migration must re-run the full tooling checks.
