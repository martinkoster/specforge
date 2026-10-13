# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

**SpecForge** is a local-first desktop application that turns natural-language intents into specifications (requirements, design, epics, user stories) and lets humans drive AI coding agents (initially Claude Code) through a Kanban board. Core principle: **humans decide what to build and when; AI agents execute how it is built.**

SpecForge is itself built **specification-first with Claude Code**. The spec in `spec/` is the source of truth; code must trace back to it.

**Current state (2026-10-14):** intent, requirements and design are complete and quality-checked. No application code exists yet. Next step: `/generate-userstories`, starting with the technical spikes and a thin end-to-end slice.

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
  04_user_stories/                    # (next) US-xxx story files
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

- **Electron + TypeScript** end-to-end; React 19 + Vite renderer (Radix/Tailwind, dnd-kit, React Flow, Monaco, CodeMirror 6).
- **Three processes**: sandboxed renderer ↔ thin Electron main (IPC broker, notifications, `safeStorage`) ↔ **core in an Electron `utilityProcess`** (all business logic).
- **Modular monolith, hexagonal**: pnpm workspaces `packages/{domain, application, ipc-contract, adapters/*, core, main, ui}`; domain is pure TS; layering enforced with dependency-cruiser.
- **Persistence**: workspace Markdown + YAML front-matter = source of truth; SQLite (better-sqlite3, WAL, FTS5) + Kysely as rebuildable index and execution store.
- **Agent adapter**: vendor-neutral `AgentAdapter` port; Claude Code via `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` (user's install), permissions via `canUseTool`, structured result via fenced ```` ```specforge-result ```` JSON. *Conditional on spike S1.*
- **Scheduler**: single-writer, event-driven; corrections/resumes first, then FIFO; default 3 parallel runs (1 in non-git mode).
- **Git**: system `git` ≥ 2.30 via `execFile` with argument arrays (never a shell); worktrees under `<appdata>/wt/<project>/<story>`. *Stacking conditional on spike S2.*
- **IPC**: zod-validated typed contract shared by UI and core.
- **Testing**: Vitest (+ fast-check property tests for scheduler/graph), Playwright for Electron E2E with a MockAdapter; CI matrix Windows/macOS/Linux; ≥ 75 % coverage overall, ≥ 90 % domain.
- **Security**: Electron hardening (sandbox, contextIsolation, no nodeIntegration, CSP), secrets redaction in logs, no telemetry.

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
