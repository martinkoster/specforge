# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

**SpecForge** is a local-first desktop application that turns natural-language intents into specifications (requirements, design, epics, user stories) and lets humans drive AI coding agents (initially Claude Code) through a Kanban board. Core principle: **humans decide what to build and when; AI agents execute how it is built.**

SpecForge is itself built **specification-first with Claude Code**. The spec in `spec/` is the source of truth; code must trace back to it.

**Current state (2026-10-19):** spec complete; Release 1 stories in `spec/04_user_stories/`. Done: US-002–US-008, US-010–US-044, US-046–US-065 (monorepo, Electron shell + React app shell, typed IPC contract with core events, SQLite execution store, secret vault + core↔main secret bridge + redaction, artifact indexer + file watcher, artifact editor (CodeMirror) + approval, traceability panel (artifacts, story drawer, run panel), epics (generate/manage, coverage strip) + stories per approved epic with validated dependencies, story state machine + dependencies, Kanban board (dnd-kit) with epic swimlanes, dependency badges/graph (React Flow + dagre) and queue UI, scheduler, run execution (ExecutionService: worktrees / snapshots, batched redacted events, timeouts, context assembly, structured results + computed changes, cancel with process-tree kill, crash recovery with orphan cleanup), executions view (run list, virtualised live logs with FTS5 search, tiles), specification runs (target-folder write scope, snapshot, validation, Keep/Discard/fix review), close handshake, capability gating (limited mode banner), next-step engine + phase stepper, dashboard, read-only project chat, commit spec changes, merge detection, retry/resume/discard, review screen (CodeMirror merge diffs, approve with merge order, reject with rejected branch / restore, request corrections with session resume or fresh run), intent editor + clarification, AI quality check, refine with AI, permission broker + prompts + pending decisions + notifications, approval rules, settings, setup wizard, Claude Code runtime detection, project create/open/registry + start wizard, agent adapter port + MockAdapter, E2E suite with a scripted test agent, fault injection against the real core, performance/accessibility checks). In progress: US-001 (macOS/Linux live runs), US-045 (Claude Code adapter `ClaudeCodeAdapter` in `@specforge/agent-claude-code`; AC-4 live contract suite open). Open: US-009 (installers), US-066 (manual acceptance with real Claude Code); US-067 blocked. Repository: https://github.com/martinkoster/specforge (CI green on Windows/macOS/Linux); the GitHub CLI is installed (`gh`). Runs execute end to end with the MockAdapter (tests) and the scripted test agent (`SPECFORGE_TEST=1 SPECFORGE_MOCK_AGENT=1`, E2E); in the app the core uses the Claude Code adapter (`claudeCode: true` in `core/src/main.ts`) once a verified executable and a provider are configured. The Agent SDK's per-platform packages (bundled Claude Code binary) are excluded via `ignoredOptionalDependencies`; the SDK itself is on the license review list (`PROPRIETARY`). Build scripts of esbuild, better-sqlite3 and electron are approved in `pnpm-workspace.yaml` (`allowBuilds`, pnpm 12). Workspace packages resolve to their sources in tests (vitest aliases). `packages/adapters/process` (`@specforge/process`) holds the process-tree code ported from spike S3. Vitest runs with `maxWorkers: 30%`; core IPC tests with real Git runs use a 60 s timeout.

## Repository layout

```
spec/
  01_intent/intent.md                 # product intent v0.2 incl. §13 decisions D1–D22
  02_requirements/                    # FR-001…FR-116, NFR-001…NFR-032, CON-001…CON-015
    functional_requirements.md
    non_functional_requirements.md
    constraints.md
    requirements_summary.md           # tables + release overview + changelog (generated from the files)
  03_design/
    functional_design/                # use_cases (UC-001…UC-049), business_processes (BP-01…07),
                                      # domain_model, user_flows (UF-xx)
    technical_design/                 # c4_architecture (incl. ADR-001…ADR-021 + decision log),
                                      # service_design, data_model, technical_decisions
  04_user_stories/                    # US-xxx story files (R1: US-001…US-067), README.md index, backlog.md
.claude/skills/                       # spec-driven workflow skills (see below)
LICENSE, NOTICE                       # Apache-2.0
```

## Spec-driven workflow (project skills)

| Stage | Skill | Output |
|---|---|---|
| 1 Intent | (manual / discussion) | `spec/01_intent/` |
| 2 Requirements | `/generate-requirements` | `spec/02_requirements/` |
| 3 Design | `/generate-design` | `spec/03_design/` |
| 4 User stories | `/generate-userstories` | `spec/04_user_stories/` |
| 5 Implementation | `/implement-userstories [US-xxx\|all]` | code + tests (strict TDD, ≥ 75 % coverage) |
| Run app | `/generate-startscript` | `scripts/start.*` |

Always work downstream from approved upstream artifacts. When a requirement or design changes, update dependent documents in the same change and record it in the relevant changelog.

## Spec conventions (must follow)

- **Stable IDs**: `FR-`, `NFR-`, `CON-`, `UC-`, `BP-`, `UF-`, `ADR-`, `D` (intent decisions), `EP-`, `US-`, `FI-`. Never renumber or reuse an ID; mark obsolete items `[DEPRECATED]` with a reason.
- **Every FR/NFR has `**Priority**` (MoSCoW) and `**Release**`** (`R1` = MVP, `R2`, `R3`, `Later`). Priority is relative to its release.
- **Product-owner decisions** go into `spec/01_intent/intent.md` §13 (next free `D` number) and are then reflected in requirements and design. ADRs implementing a D-decision are recorded as Accepted; other ADRs start as Proposed until the user accepts them.
- Keep cross-references valid (FR ↔ UC coverage matrix in `use_cases.md`, NFR coverage table in `technical_decisions.md`, ADR decision log in `c4_architecture.md`).
- `requirements_summary.md` tables must match the requirement files (titles, priorities, releases); append a dated changelog row for every change.
- Domain model (`domain_model.md`) and data model (`data_model.md`) must stay aligned (entities, enums, front-matter fields).
- Use real dates (absolute, `YYYY-MM-DD`).

## Key product rules (don't violate in specs or code)

- Only humans approve artifacts, move stories to *Ready* / *In Progress*, and accept work as *Done*. Agents may only recommend. A story move to *In Progress* is the authorisation; queued stories start automatically when dependencies are Done and a run slot is free.
- Done stories are never reopened → new rework stories.
- Agent permission requests are relayed to the user (deny-by-default; SpecForge-owned rules, global defaults + project overrides). Outside-workspace actions are never auto-approved.
- SpecForge never merges into the user's branches (user merges manually); one Git worktree per story run; stacked branches for unmerged predecessors.
- Main workspace is authoritative for spec/story state; worktrees are never indexed; implementation runs may not write `spec/**` or `.specforge/**`.
- Chat: read-only in R1; in R2 it may edit specs and code, each write approved and revertible. It can never move stories or start runs.
- SpecForge never calls model APIs itself; provider credentials (API key / Bedrock / Vertex / Foundry) are stored only in the OS credential store and injected only into the agent process. No claude.ai subscription login is offered.

## Technical foundations (accepted ADRs)

- **Electron + TypeScript 6.0.x** end-to-end (ADR-022: TS 7 lacks the compiler API for lint/layering); React 19 + Vite renderer (Radix/Tailwind, dnd-kit, React Flow, CodeMirror 6 incl. `@codemirror/merge` diffs instead of Monaco).
- **Three processes**: sandboxed renderer ↔ thin Electron main (IPC broker, notifications, `safeStorage`) ↔ **core in an Electron `utilityProcess`** (all business logic).
- **Modular monolith, hexagonal**: pnpm workspaces `packages/{domain, application, ipc-contract, adapters/*, core, main, ui}`; domain is pure TS; layering enforced with dependency-cruiser.
- **Persistence**: workspace Markdown + YAML front-matter = source of truth; SQLite (better-sqlite3, WAL, FTS5) + Kysely as rebuildable index and execution store.
- **Agent adapter**: vendor-neutral `AgentAdapter` port; Claude Code via `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` (user's install), permissions via `canUseTool`, structured result via fenced ```` ```specforge-result ```` JSON. *Conditional on spike S1.*
- **Scheduler**: single-writer, event-driven; corrections/resumes first, then FIFO; default 3 parallel runs (1 in non-git mode).
- **Git**: system `git` ≥ 2.30 (≥ 2.38 recommended) via `execFile` with argument arrays (never a shell) and `-c core.longpaths=true`; worktrees under `<appdata>/wt/<project>/<story>`; integration commits for stacked bases via `git merge-tree --write-tree` (Git ≥ 2.38) with scratch-worktree fallback (ADR-010, confirmed by spike S2). Keep Git invocations few — each costs ~0.3–0.5 s on Windows.
- **IPC**: zod-validated typed contract shared by UI and core.
- **Testing**: Vitest (+ fast-check property tests for scheduler/graph), Playwright for Electron E2E with a MockAdapter; CI matrix Windows/macOS/Linux; ≥ 75 % coverage overall, ≥ 90 % domain.
- **Security**: Electron hardening (sandbox, contextIsolation, no nodeIntegration, CSP), secrets redaction in logs, no telemetry.

## Commands

pnpm is used via corepack (no global install needed): prefix with `corepack pnpm` if `pnpm` is not on PATH.

| Command | Purpose |
|---|---|
| `corepack pnpm install` | Install workspace dependencies |
| `corepack pnpm build` | `tsc -b` + renderer bundle (`vite build packages/ui` → `packages/ui/dist/app`) + layering check (fails on dependency-cruiser violations) |
| `corepack pnpm lint` / `format` | ESLint + Prettier check / write |
| `corepack pnpm test` / `coverage` | Vitest / with v8 coverage and thresholds (timing tests excluded) |
| `corepack pnpm test:perf` | Performance tests (`*.perf.test.ts`), run sequentially |
| `corepack pnpm test:e2e` | Electron end-to-end tests (`*.e2e.test.ts`, Playwright), run sequentially; Linux needs `xvfb-run -a` |
| `corepack pnpm check:spdx` | SPDX header check |
| `corepack pnpm audit:deps` | Dependency vulnerability audit (fails on high/critical in production dependencies) |
| `corepack pnpm check:licenses` | License policy for production dependencies (fails on GPL/AGPL/unknown) |

Process wiring: the core (`packages/core/src/main.ts` → `createCore` in `composition.ts`) opens the database in the app-data dir passed by main (`SPECFORGE_APP_DATA`; better-sqlite3 13's N-API prebuilds load unchanged in Electron) and posts `{type:'ready'}` — main hands the renderer its port only then (slow first starts must not time out the handshake). The core is forked together with the window; `RendererLink` (main) holds its port and status until the page has loaded. Secrets: the core asks main's `SecretVault` over the parent port (`BridgeSecretStore` ↔ `handleSecretRequest`). The renderer CSP allows runtime `<style>` elements only with the per-session nonce (`specforgeShell.styleNonce` → `EditorView.cspNonce`); never add `unsafe-inline`. E2E tests use `launch()` from `packages/main/test/e2e-support.ts` (isolated profile via `SPECFORGE_USER_DATA`, first-start setup skipped unless `{ setup: 'keep' }`, `mockAgent: true` for the scripted test agent — story titles with `slow`, `hang` or `stream` change its behaviour — `stubFolderPicker` for native dialogs, and shared helpers `createProject`, `allowPending`, `moveTo`, `waitForColumn`, `storyFile`). The board re-reads on every shell-state change (`refreshKey`). NFR-003 cold start is measured against a bare-Electron baseline (`test/fixtures/bare-main.cjs`); accessibility uses `axe-core` (`color-contrast`). UI component tests use `// @vitest-environment happy-dom` (jsdom's slow start exceeded Vitest's fixed 60 s worker-start timeout in the parallel run) with React Testing Library; the renderer CSP (`style-src 'self'`) forbids inline styles — use `packages/ui/src/styles.css`. Notes: TypeScript is pinned to **6.0.x** — TypeScript 7 (native) lacks the compiler API used by typescript-eslint and dependency-cruiser. Spikes in `spikes/s1..s3` are standalone npm packages outside the workspace (`npm test` inside each; S1 live tests need `S1_LIVE=1`).

## Implementation order

1. Spikes: **S1** Claude Code adapter (streaming, `canUseTool` relay with long waits, abort, resume, settings can't bypass relay) on all 3 OSes; **S2** stacked worktrees + integration merge + Windows path lengths; **S3** process-tree termination per OS.
2. Thin end-to-end slice with MockAdapter: project → story → run → review.
3. Remaining Release 1 capabilities, then Release 2.

## Working with the user

- The product owner prefers **decisions presented one at a time**, each with options, trade-offs and a clearly marked recommendation (use AskUserQuestion; recommended option first).
- Discuss/brainstorm before writing large spec changes; then propagate changes consistently through intent → requirements → design.
- After larger spec changes, offer a quality check (consistency, cross-references, coverage).
- Don't commit unless asked; branch before committing on `main` once history exists.

## License

Apache License 2.0 (`LICENSE`, `NOTICE`). Dependencies must be Apache-2.0 compatible (no GPL/AGPL in distributed artifacts); add SPDX headers (`// SPDX-License-Identifier: Apache-2.0`) to source files. Do not redistribute the Claude Code binary.
