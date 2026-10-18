# SpecForge

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

SpecForge is a local-first desktop application that turns natural-language intents into specifications (requirements, design, epics, user stories) and lets humans drive AI coding agents through a Kanban board. **Humans decide what to build and when; AI agents execute how it is built.**

The product is specified in [`spec/`](spec/) (intent → requirements → design → user stories) and built specification-first; see [`CLAUDE.md`](CLAUDE.md) for conventions.

## Requirements

- Node.js ≥ 24 with corepack (bundled with Node)
- Git ≥ 2.30 (≥ 2.38 recommended)
- For agent runs: a local Claude Code installation and AI provider credentials (configured in SpecForge's setup)

## Development

pnpm is provided via corepack — run `corepack enable` once, or prefix the commands with `corepack`.

| Command | Purpose |
|---|---|
| `pnpm install` | Install workspace dependencies |
| `pnpm build` | Compile all packages (`tsc -b`) and enforce the layering rules |
| `pnpm lint` | ESLint and Prettier check (`pnpm format` to fix formatting) |
| `pnpm test` | Unit, integration and Electron end-to-end tests (Vitest) |
| `pnpm coverage` | Tests with coverage thresholds (75 % overall, 90 % domain) |
| `pnpm test:perf` | Performance tests (sequential, NFR timing targets) |
| `pnpm check:spdx` | Verify Apache-2.0 SPDX headers |
| `pnpm check:licenses` | License policy for production dependencies |
| `pnpm audit:deps` | Dependency vulnerability audit (high/critical) |

On Linux without a display, run the tests with `xvfb-run -a pnpm test` (the Electron end-to-end test opens a window).

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs lint, build, SPDX check and tests with coverage on Windows, macOS and Linux, plus the license scan and dependency audit.

## License

[Apache License 2.0](LICENSE) — see also [NOTICE](NOTICE).
