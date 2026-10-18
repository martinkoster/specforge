# Spike S1 — Claude Code integration via the Agent SDK

**Story:** US-001 · **Validates:** ADR-006 (Agent SDK with the user's executable), ADR-013 (SpecForge-owned permission relay) · **Date:** 2026-10-14
**Prototype:** `spikes/s1/` (throwaway, not production code) · **Evidence:** `spikes/s1/results/live-<platform>.json`
**Versions:** `@anthropic-ai/claude-agent-sdk` 0.3.299, Claude Code 2.1.299, Node 24

## Scope and method

The prototype drives a user-installed Claude Code via `query()` with `pathToClaudeCodeExecutable`, `permissionMode: 'default'`, `canUseTool` routed to a `DecisionBroker` (prototype of the PermissionBroker), `abortController` and `resume`. Live acceptance tests (`npm run test:live`) cover AC-1 to AC-5; unit tests cover the building blocks with a mocked SDK.

## Results per OS

### Windows

**Status**: verified (2026-10-14, Windows 11, local developer machine)

| AC | Scenario | Result |
|---|---|---|
| AC-1 | Stream messages with session id from user-installed Claude Code | ✓ `session → output → result`; executable resolved from npm shim to `…\@anthropic-ai\claude-code\bin\claude.exe` |
| AC-2 | `canUseTool` blocks ≥ 10 min, later allow reaches agent | ✓ request pending **600,002 ms**, then allowed; file written |
| AC-2 | Deny reaches agent, action not executed | ✓ file not written, tool result flagged as error |
| AC-3 | Abort stops agent and all child processes within 10 s | ✓ tree `claude.exe → cmd/powershell → node.exe` fully gone after **8.5 s** (incl. ~2 s snapshot latency) |
| AC-4 | Resume with stored session id keeps context | ✓ code word recalled in resumed session |
| AC-5 | Settings cannot bypass the relay | ✓ with a project `.claude/settings.json` allowing `Write/Edit/Bash`, the request was relayed and denied in all variants (default sources, `['project']`, `[]`) |

Authentication note: the Windows run used the developer's **local Claude Code login** (developer-only exception agreed for this spike). The product path per ADR-007 (API key / cloud provider) is exercised by the CI workflow below.

### macOS

**Status**: pending — run workflow `spike-s1-live` (`.github/workflows/spike-s1.yml`, manual trigger, requires repository secret `ANTHROPIC_API_KEY`).

### Linux

**Status**: pending — same workflow (`ubuntu-latest`).

## Findings and implications for the design

1. **Executable resolution.** npm installs on Windows expose `claude`/`claude.cmd` shims; the SDK needs the real `claude.exe`. → Setup detection (US-010) must resolve shims (`resolveClaudeExecutable` in the prototype) and symlinks on POSIX.
2. **Always set `permissionMode: 'default'`.** When omitted, Claude Code may start in `auto` (classifier decides), which would bypass the human relay. → ClaudeCodeAdapter (US-045) sets it explicitly.
3. **Setting sources.** The SDK loads user, project and local settings by default. In the test, a project allow rule did not bypass the relay, but user-level settings were not tested (the developer's `~/.claude` was not modified) and behaviour may differ by version or trust state. → Implementation and chat runs pass `settingSources: []` (isolation). Project instructions/CLAUDE.md content is supplied by SpecForge's ContextAssembler via the system-prompt append (FR-050) instead of being loaded by the agent.
4. **Shell tool differs per OS.** On this Windows machine the agent had no Bash tool and used PowerShell. → Suggested approval rules (ADR-013, US-014) must cover both `Bash(...)` and the PowerShell tool; the permission UI must show the tool name as reported.
5. **Abort timing.** The SDK abort terminated the full process tree within the 10 s budget, with little margin on Windows. → Keep the ProcessRegistry tree-kill fallback after 5 s (ADR-006, US-049); validate with spike S3.
6. **Realistic prompts.** The model refused a prompt that looked like a security probe (`bypass.txt`, "if denied, stop") without calling any tool. → Test and fixture prompts for agent tests must be realistic tasks; not a product issue.
7. **Cost.** Default model (Opus 5.5) sessions cost about $0.03–$0.14 each in this spike (as reported by the SDK). → Usage reporting (FR-090) is feasible from the result message (`total_cost_usd`).

## Recommendation

**Go** for ADR-006: use the TypeScript Agent SDK with `pathToClaudeCodeExecutable` pointing to the user's installation, `permissionMode: 'default'`, `settingSources: []` and `canUseTool` → PermissionBroker. The CLI + PreToolUse-hook fallback is not needed.

Conditions before ADR-006 is fully confirmed: macOS and Linux runs of `spike-s1-live` pass, and the API-key authentication path (ADR-007) succeeds in CI.
