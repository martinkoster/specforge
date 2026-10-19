// SPDX-License-Identifier: Apache-2.0
// Vendor-neutral agent adapter port (ADR-008, FR-028). Implemented by e.g. the Claude Code adapter and the MockAdapter.

export type RunKind =
  | 'clarify'
  | 'generate'
  | 'refine'
  | 'quality_check'
  | 'feature_review'
  | 'impact'
  | 'decision_options'
  | 'analyze'
  | 'chat'
  | 'connection_test'
  | 'implement'
  | 'correct';

export interface AgentCapabilities {
  /** Sessions can be resumed by id (corrections, chat threads). */
  resume: boolean;
  /** Permission requests are delivered to `RunHooks.onPermission`. */
  permissionRelay: boolean;
  /** The adapter can return the fenced `specforge-result` block (ADR-008). */
  structuredResult: boolean;
  models: string[];
  /** The adapter needs a configured AI provider (default true; false e.g. for the MockAdapter). */
  requiresProvider?: boolean;
}

export interface RuntimeInfo {
  found: boolean;
  path?: string;
  version?: string;
}

export interface VerifyResult {
  ok: boolean;
  version?: string;
  reason?: string;
}

export interface AgentConfig {
  model?: string;
  params?: Record<string, unknown>;
  /** Environment for the agent process (secrets already resolved by the caller). */
  env?: Record<string, string>;
  maxTurns?: number;
}

export interface RunRequest {
  runId: string;
  kind: RunKind;
  cwd: string;
  prompt: string;
  systemAppend?: string;
  config: AgentConfig;
  resumeSessionId?: string;
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'output'; text: string }
  | { type: 'tool_use'; toolUseId: string; toolName: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; isError: boolean }
  | { type: 'usage'; usage: AgentUsage }
  | { type: 'error'; message: string };

export interface PermissionAsk {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
}

export type PermissionAnswer = { behavior: 'allow' } | { behavior: 'deny'; message: string };

export interface RunHooks {
  onEvent(event: AgentEvent): void;
  /** Resolves when a human (or rule) decides; the run waits without timeout (ADR-013). */
  onPermission(ask: PermissionAsk): Promise<PermissionAnswer>;
}

export type AgentOutcome =
  | { status: 'completed'; sessionId: string; resultText: string; usage?: AgentUsage }
  | { status: 'failed'; reason: string }
  | { status: 'cancelled' };

export interface RunHandle {
  sessionId: Promise<string>;
  done: Promise<AgentOutcome>;
  cancel(reason?: string): Promise<void>;
  /** Process id of the agent process, if the adapter runs one (ProcessRegistry, FR-034/FR-041). */
  pid?(): number | undefined;
}

export interface AgentAdapter {
  readonly type: string;
  capabilities(): AgentCapabilities;
  detect(): Promise<RuntimeInfo>;
  verify(executablePath: string): Promise<VerifyResult>;
  start(request: RunRequest, hooks: RunHooks): RunHandle;
}
