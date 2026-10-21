# SpecForge — Technical Decisions

**Last updated:** 2026-10-14  
See `c4_architecture.md` for ADR-001 – ADR-022.

## 1. Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 6.0.x (strict) everywhere | One language across UI, core and adapter; Agent SDK is TS (ADR-001/006); 6.0 pinned because TS 7 lacks the compiler API needed by lint/layering tooling (ADR-022) |
| Desktop shell | Electron (current stable), `utilityProcess` for core | Cross-platform parity (CON-009), process isolation (ADR-002) |
| UI framework | React 19 + Vite | Ecosystem for rich clients |
| UI components | Radix UI primitives + Tailwind CSS | Accessible primitives (NFR-020), consistent styling |
| Kanban DnD | dnd-kit | Accessible drag & drop incl. keyboard (NFR-020) |
| Dependency graph | React Flow (xyflow) + dagre layout | Interactive graph view (FR-064); dagre (MIT) instead of elkjs (EPL-2.0 OR GPL-3.0, flagged for licence review) — 2026-10-16, US-041 |
| Markdown edit / render | CodeMirror 6 / unified (remark + rehype) | Fast editor; same parser as indexer |
| Diff view | CodeMirror 6 `@codemirror/merge` (MergeView / unified view) | Side-by-side/unified diffs (FR-043); chosen by the product owner instead of the Monaco diff editor — same editor stack and CSP style nonce as the artifact editor, no web workers or extra 5 MB bundle — 2026-10-16, US-057 |
| Log view | Virtualised list (react-virtuoso) + ANSI rendering | 1M-line logs (NFR-005) |
| UI state | Zustand (local) + TanStack Query over IPC | Simple, cache-aware |
| Validation / contracts | zod | IPC (ADR-015), front-matter, RunResult schema |
| Database | SQLite (better-sqlite3, WAL, FTS5) + Kysely | ADR-005 |
| Markdown front-matter | gray-matter / yaml | |
| File watching | chokidar v4 | Cross-platform, debounced |
| Git | system `git` ≥ 2.30 (≥ 2.38 recommended) via `execFile` (thin wrapper) | Worktree support; `merge-tree --write-tree` for integration commits from 2.38 (ADR-010); no shell (NFR-011) |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` | ADR-006 |
| Secrets | Electron `safeStorage` (DPAPI / Keychain / libsecret) | ADR-012 |
| Packaging | electron-builder: NSIS per-user (Win), signed+notarised dmg (macOS), AppImage + deb (Linux) | NFR-026 |
| Monorepo tooling | pnpm workspaces, dependency-cruiser, ESLint, Prettier | Enforced layering (NFR-021) |

**Package layout**
```
packages/
  domain/          pure TS: entities, state machines, policies, events
  application/     services, ports
  ipc-contract/    zod schemas, types
  adapters/
    agent-claude-code/   agent-mock/
    git/  fs/  sqlite/  snapshot/  os/
  core/            utilityProcess entry, composition root
  main/            Electron main
  ui/              React renderer
```

## 2. Architecture style

**Modular monolith, hexagonal** (ADR-003) running as **three processes** (ADR-002). No servers, no network listeners (CON-001, CON-012). Internal communication: in-process domain event bus in core; typed IPC to UI.

## 3. Key patterns

- **Ports & adapters** — AgentAdapter, Git, FileSystem, SnapshotStore, SecretVault, Clock (testability).
- **State machines** — Story board status + exec sub-state; Run lifecycle; both pure and exhaustively tested.
- **Single-writer scheduler** with domain events (ADR-009) — the only start path for implementation, correction, retry and resume runs; non-git shared-workspace rule (FR-116b).
- **Main workspace authoritative** — story status, approval, epic and dependencies indexed only from the main workspace; run worktrees never indexed (ADR-004, FR-116a).
- **Polling + event-triggered merge detection** — `git merge-base --is-ancestor` on open, focus, after own git operations, every 60 s and on *Refresh* (ADR-010, FR-115).
- **CQRS-lite** — commands through application services; read models (board view, pending decisions, run list) as SQL views/queries.
- **Repository pattern** over Kysely.
- **Optimistic concurrency** on artifact writes via content hash.
- **Outbox-like ordering** — state persisted before side effects (BoardService → Scheduler; Scheduler persists `preparing` before launching).
- **Backpressure/batching** for run streams (core → UI ≤ 50 ms batches; DB writes 100 ms).

## 4. Security approach

| Concern | Measure | Req |
|---|---|---|
| Human control | Transitions enforced in domain; agents cannot start work; built-in deny on `spec/**` / `.specforge/**` writes in implementation runs; status read only from the main workspace | CON-005, FR-023, FR-116 |
| Agent permissions | SpecForge-owned PermissionPolicy, deny-by-default, relay-first, outside-workspace always relayed | ADR-013, NFR-007/008 |
| Secrets | `safeStorage`, injected only into agent env, redaction of events and UI | ADR-012, NFR-006 |
| Auth to AI provider | User-provided API key / cloud provider, stored only in the OS credential store and passed only into the agent process; SpecForge never calls model APIs itself; no claude.ai login offered | ADR-007, CON-002, CON-004, NFR-027 |
| Local data | App-data dir with user-only permissions; no telemetry; update check off by default | NFR-009/010 |
| Process invocation | `execFile`/`spawn` with arg arrays; no shell; paths validated | NFR-011 |
| Electron hardening | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, strict CSP, no remote URLs loaded, `setWindowOpenHandler` deny, navigation blocked, IPC validated with zod, Electron fuses (disable `RunAsNode`, enable ASAR integrity) | general |
| Input validation | zod at IPC boundary; front-matter schema validation; result schema validation | ADR-015 |
| Auditability | Immutable permission records; run context digest; review decisions | NFR-012 |
| Supply chain | Lockfile, `pnpm audit` and license scan in CI | NFR-027 |

## 5. Testing strategy

| Level | Scope | Tools |
|---|---|---|
| Unit | Domain (state machines incl. FR-021 sub-states, DependencyGraph, SchedulingPolicy incl. slot and `workspace` rules, PermissionPolicy), parsers, redactor | Vitest; **fast-check** property tests for scheduler and graph (NFR-014); ≥ 90 % coverage domain |
| Integration | SQLite repositories (real DB in temp dir), Git adapter (temp repos: worktrees, stacking, conflicts, merge detection), snapshots, file watcher, ContextAssembler | Vitest |
| Adapter contract | Shared contract test suite run against MockAdapter and ClaudeCodeAdapter (latter opt-in, needs credentials) | Vitest |
| E2E | Full app with MockAdapter: MVP acceptance scenario, parallel runs + queue, permission relay, crash recovery (kill core), non-git mode | Playwright for Electron |
| Fault injection | Kill process during saves/runs (NFR-015) | custom harness |
| Performance | UI responsiveness with 3 streaming runs, board with 1,000 stories, 100 MB log | Playwright traces, benchmarks |
| Manual release test | MVP acceptance scenario with real Claude Code on Windows, macOS, Linux (NFR-016) | checklist |

Overall coverage target ≥ 75 % (NFR-023). TDD per story (stage 5 process).

## 6. Deployment approach

- **Distribution**: GitHub Releases (or internal share) with installers per OS; code signing (Windows Authenticode, Apple Developer ID + notarisation); Linux AppImage + deb. R1 installers (US-009, electron-builder): per-user NSIS without elevation (Windows x64), dmg (macOS), AppImage + deb (Linux); asar with integrity validation and the US-005 fuses flipped after packing; unsigned until US-067. Public distribution requires the D23 legal confirmation.
- **Updates**: Manual by default; optional opt-in update check (NFR-009).
- **CI/CD**: GitHub Actions matrix `windows-latest`, `macos-latest`, `ubuntu-latest`: lint → typecheck → unit/integration → E2E (mock adapter, xvfb on Linux) → package → sign (release branches only).
- **Runtime prerequisites**: Claude Code installed by the user (minimum version enforced), Git ≥ 2.30 (optional; ≥ 2.38 recommended), API key or cloud provider credentials (ADR-007).

## 7. Licensing

SpecForge is licensed under **Apache License 2.0** (CON-015).

- Repository: `LICENSE` (Apache-2.0 text), `NOTICE`, SPDX header `// SPDX-License-Identifier: Apache-2.0` in source files.
- CI: license scan of production dependencies (e.g. `license-checker` / `pnpm licenses list`) with an allow-list (MIT, BSD-2/3-Clause, ISC, Apache-2.0, 0BSD, CC0); GPL/AGPL/unknown fail the build; others require review.
- Packaging: generate `THIRD_PARTY_NOTICES` and include it in every installer.
- Stack check (§1): all proposed libraries are MIT/Apache-2.0 except:
  - **elkjs** — EPL-2.0 OR GPL-3.0 (weak copyleft / copyleft): flagged by the licence check for review; **not used** — the graph view uses `@dagrejs/dagre` (MIT) for the layered layout (2026-10-16, US-041).
  - **@anthropic-ai/claude-agent-sdk** — governed by Anthropic's terms, not an OSI license: its JavaScript is bundled in the installers and listed in `THIRD_PARTY_NOTICES` as proprietary (D23, 2026-10-21); **legal confirmation of the terms is required before any public release**. Its optional bundled Claude Code binary is excluded from installation and packaging, and the packaging step fails if one is found (SpecForge uses the user's installation, ADR-006).
- Packaging (US-009): `pnpm package` bundles main and core with esbuild, stages them with the renderer, better-sqlite3 (its prebuild for the target platform only) and the Agent SDK as a standalone app, generates `THIRD_PARTY_NOTICES` from the production dependencies (fails if a bundled package is missing) and adds `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES` to every installer; Electron's own licenses ship beside the executable.

## 8. NFR coverage

| NFR | Addressed by |
|---|---|
| NFR-001 UI responsiveness | ADR-002 (core in utilityProcess), stream batching, virtualised lists |
| NFR-002 Streaming latency | SDK message iteration → 50 ms batches |
| NFR-003 Startup | Core forked together with the window (port held until the page has loaded); last project reopened in parallel with the capability check; incremental index with content hashes; lazy loading of runs; measured against a bare-Electron baseline (US-065) |
| NFR-004 Run start latency | Worktree creation (git) / snapshot (ADR-011), scheduler latency (ADR-009) |
| NFR-005 Large logs | Sidecar log files, FTS5, virtualised rendering |
| NFR-006 Secrets | ADR-012 |
| NFR-007 Deny-by-default | ADR-013 |
| NFR-008 Confinement | ADR-013, cwd = worktree |
| NFR-009 No telemetry | No network code in SpecForge except opt-in update check |
| NFR-010 Local data protection | User-only permissions on app data |
| NFR-011 Safe invocation | execFile with arg arrays; SDK passes prompt as data |
| NFR-012 Auditability | Immutable `permission_request`, context digest |
| NFR-013 Project size | Indexed queries, incremental indexing |
| NFR-014 Concurrency | ADR-009, ADR-010, property tests |
| NFR-015 Crash safety | SQLite WAL transactions (event batches ≤ 100 ms, at most the last 1 s of log lost, FR-040), atomic file writes, startup recovery |
| NFR-016 E2E reliability | E2E suite + manual release test per OS |
| NFR-017 Graceful degradation | Adapter error mapping, core restart by main |
| NFR-018 Discoverability | Guided empty states, next-step buttons (user_flows) |
| NFR-019 Transparency | Draft badges, run references, diffs |
| NFR-020 Accessibility | Radix, dnd-kit keyboard support, contrast checks |
| NFR-021 Modularity | ADR-003, dependency-cruiser |
| NFR-022 Extensible adapters | ADR-008, MockAdapter contract tests |
| NFR-023 Tests | §5 |
| NFR-024 Self-traceability | This repo's `spec/` + story links |
| NFR-025 Portability | Electron, CI matrix, ProcessRegistry per OS |
| NFR-026 Install footprint | Per-user installers, no extra runtimes |
| NFR-027 Licensing / terms | Apache-2.0 (§7), license scan, notices; ADR-007 (credentials only in OS credential store, only into the agent process) |
| NFR-028 Graph performance | In-memory DependencyGraph with incremental updates |
| NFR-029 Time to first use | Setup wizard (UF-01), start wizard, phase stepper, next-step engine (ADR-017) |
| NFR-030 Dashboard freshness | Event-driven dashboard read model, indexed aggregates (DashboardService) |
| NFR-031 Chat change traceability (Release 2) | `chat_change` with before-content, revert (ADR-016) |
| NFR-032 Feature capture effort (Release 2) | Add-feature split button + shortcuts, resumable wizard, trace-first impact (ADR-021) |

## 9. Technical spikes (to run first)

| Spike | Question | Exit criterion |
|---|---|---|
| S1 Claude Code adapter | Agent SDK with user executable: streaming, `canUseTool` relay with long human waits, abort, resume in same cwd, behaviour of user/project Claude settings on permission flow, on Win/macOS/Linux | One relayed prompt, cancel and resume demonstrated on all 3 OSes; settings cannot bypass relay |
| S2 Stacked worktrees | Integration merge of 2 predecessor branches, diff vs. base_ref, Windows path lengths | Scripted scenario passes on all 3 OSes |
| S3 Process trees | Reliable kill of agent + child processes (e.g. test runners) per OS | No surviving children after cancel/close |
