// SPDX-License-Identifier: Apache-2.0
// Claude Code adapter (US-045, ADR-006/ADR-008): one Agent SDK `query()` per run against the user's own Claude Code
// executable. Permission requests go through `canUseTool` to SpecForge's PermissionBroker and wait without timeout;
// provider credentials reach only the agent process; Claude settings files are not loaded (spike S1).
import { spawn } from 'node:child_process';
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentOutcome,
  AgentUsage,
  RunHandle,
  RunHooks,
  RunRequest,
  RuntimeInfo,
  VerifyResult,
} from '@specforge/application';
import { detectClaudeCode, systemEnvironment, verifyClaudeCode, type RuntimeEnvironment } from './runtime.js';

/** The part of the Agent SDK's `query()` the adapter uses (injectable for tests). */
export type QueryFunction = (params: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<SdkMessage>;

/** Agent SDK message (only the fields the adapter reads). */
export interface SdkMessage {
  type: string;
  subtype?: string;
  [key: string]: unknown;
}

export interface ClaudeCodeAdapterOptions {
  /** The verified Claude Code executable of the user (CON-002), or undefined if none is configured. */
  executable(): string | undefined;
  /** Agent SDK `query()`; loaded lazily from `@anthropic-ai/claude-agent-sdk` when absent. */
  query?: QueryFunction;
  /** Environment of the core process; provider variables are removed before the run's own are added. */
  baseEnv?: Record<string, string | undefined>;
  runtime?: RuntimeEnvironment;
  /** Spawns the agent process (default: `child_process.spawn`); the adapter records its pid. */
  spawnProcess?: typeof spawn;
  /**
   * Process-tree operations (FR-034): the agent's children (shell commands, its file search) outlive the aborted
   * agent, so a cancel ends them too. Without them, only the agent process is stopped.
   */
  processTree?: { descendants(pid: number): Promise<number[]>; kill(pid: number): Promise<void> };
}

/**
 * Provider and login variables never inherited from the core's environment: the agent only gets the credentials the
 * user configured in SpecForge (ADR-007), and no subscription login token.
 */
const PROVIDER_VARIABLES = [
  /^ANTHROPIC_/,
  /^CLAUDE_CODE_OAUTH_TOKEN$/,
  /^CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)$/,
  /^CLAUDE_CODE_SKIP_.*_AUTH$/,
  /^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|PROFILE|REGION|BEARER_TOKEN_BEDROCK)$/,
  /^GOOGLE_APPLICATION_CREDENTIALS$/,
  /^(CLOUD_ML_REGION|ANTHROPIC_VERTEX_PROJECT_ID)$/,
];

/** Environment of an agent run: the core's environment without provider variables, plus the run's configuration. */
export function agentEnvironment(base: Record<string, string | undefined>, run: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined || PROVIDER_VARIABLES.some((p) => p.test(name))) continue;
    env[name] = value;
  }
  return { ...env, ...run, CLAUDE_AGENT_SDK_CLIENT_APP: 'specforge' };
}

/** Maps one Agent SDK message to adapter events (ADR-008); `result` messages are handled by the run. */
export function mapSdkMessage(message: SdkMessage): AgentEvent[] {
  const blocks = (): Array<Record<string, unknown>> => {
    const content = (message.message as { content?: unknown } | undefined)?.content;
    return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
  };
  switch (message.type) {
    case 'system':
      return message.subtype === 'init' ? [{ type: 'session', sessionId: String(message.session_id) }] : [];
    case 'assistant':
      return blocks().flatMap((b): AgentEvent[] => {
        if (b.type === 'text' && typeof b.text === 'string' && b.text !== '') return [{ type: 'output', text: b.text }];
        if (b.type === 'tool_use') return [{ type: 'tool_use', toolUseId: String(b.id), toolName: String(b.name), input: b.input }];
        return [];
      });
    case 'user':
      return blocks()
        .filter((b) => b.type === 'tool_result')
        .map((b): AgentEvent => ({ type: 'tool_result', toolUseId: String(b.tool_use_id), isError: b.is_error === true }));
    default:
      return [];
  }
}

function usageOf(result: SdkMessage): AgentUsage {
  const usage = (result.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
  return {
    ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
    ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    ...(typeof result.total_cost_usd === 'number' ? { costUsd: result.total_cost_usd } : {}),
  };
}

const NOT_CONFIGURED = 'Claude Code is not configured: detect or enter its path in Settings → Agent runtime.';

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = 'claude-code';

  constructor(private readonly options: ClaudeCodeAdapterOptions) {}

  capabilities(): AgentCapabilities {
    return { resume: true, permissionRelay: true, structuredResult: true, models: [], requiresProvider: true };
  }

  async detect(): Promise<RuntimeInfo> {
    const found = await detectClaudeCode(this.options.runtime ?? systemEnvironment());
    return found.found ? { found: true, path: found.path, version: found.version } : { found: false };
  }

  async verify(executablePath: string): Promise<VerifyResult> {
    const result = await verifyClaudeCode(executablePath, this.options.runtime ?? systemEnvironment());
    return result.ok ? { ok: true, version: result.version } : { ok: false, reason: result.message };
  }

  start(request: RunRequest, hooks: RunHooks): RunHandle {
    const abort = new AbortController();
    let pid: number | undefined;
    let resolveSession!: (id: string) => void;
    let rejectSession!: (e: Error) => void;
    const sessionId = new Promise<string>((resolve, reject) => {
      resolveSession = resolve;
      rejectSession = reject;
    });
    // Callers that never await the session id must not see an unhandled rejection.
    sessionId.catch(() => undefined);

    const run = async (): Promise<AgentOutcome> => {
      const executable = this.options.executable();
      if (!executable) return { status: 'failed', reason: NOT_CONFIGURED };
      const query = this.options.query ?? (await loadQuery());
      const spawnProcess = this.options.spawnProcess ?? spawn;
      const messages = query({
        prompt: request.prompt,
        options: {
          cwd: request.cwd,
          pathToClaudeCodeExecutable: executable,
          // Every tool call that needs approval reaches `canUseTool` (no bypass or accept-edits modes).
          permissionMode: 'default',
          // User/project Claude settings could pre-approve tools and bypass the relay (spike S1).
          settingSources: [],
          systemPrompt: { type: 'preset', preset: 'claude_code', ...(request.systemAppend ? { append: request.systemAppend } : {}) },
          env: agentEnvironment(this.options.baseEnv ?? process.env, request.config.env),
          abortController: abort,
          ...(request.config.model ? { model: request.config.model } : {}),
          ...(request.config.maxTurns ? { maxTurns: request.config.maxTurns } : {}),
          ...(request.resumeSessionId ? { resume: request.resumeSessionId } : {}),
          canUseTool: async (
            toolName: string,
            input: Record<string, unknown>,
            { signal, toolUseID }: { signal: AbortSignal; toolUseID: string },
          ) => {
            // Waits for the human decision without a timeout (ADR-013); an aborted run denies.
            const answer = await Promise.race([
              hooks.onPermission({ toolUseId: toolUseID, toolName, input, cwd: request.cwd }),
              new Promise<{ behavior: 'deny'; message: string }>((resolve) =>
                signal.addEventListener('abort', () => resolve({ behavior: 'deny', message: 'The run was stopped.' }), { once: true }),
              ),
            ]);
            return answer.behavior === 'allow' ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: answer.message };
          },
          spawnClaudeCodeProcess: (spawnOptions: {
            command: string;
            args: string[];
            cwd?: string;
            env: Record<string, string | undefined>;
            signal: AbortSignal;
          }) => {
            const child = spawnProcess(spawnOptions.command, spawnOptions.args, {
              cwd: spawnOptions.cwd,
              env: spawnOptions.env,
              signal: spawnOptions.signal,
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
            });
            pid = child.pid;
            return child;
          },
        },
      });

      let session: string | undefined;
      let result: SdkMessage | undefined;
      for await (const message of messages) {
        for (const event of mapSdkMessage(message)) {
          if (event.type === 'session') {
            if (session) continue;
            session = event.sessionId;
            resolveSession(session);
          }
          hooks.onEvent(event);
        }
        if (message.type === 'result') result = message;
      }
      if (abort.signal.aborted) return { status: 'cancelled' };
      if (!result) return { status: 'failed', reason: 'The agent ended without a result.' };
      const usage = usageOf(result);
      if (Object.keys(usage).length > 0) hooks.onEvent({ type: 'usage', usage });
      const finalSession = String(result.session_id ?? session ?? '');
      if (result.subtype !== 'success' || result.is_error === true) {
        const errors = Array.isArray(result.errors) ? (result.errors as unknown[]).map(String).join('; ') : '';
        const reason = errors || (typeof result.result === 'string' && result.result) || `The agent stopped (${String(result.subtype)}).`;
        hooks.onEvent({ type: 'error', message: reason });
        return { status: 'failed', reason };
      }
      return { status: 'completed', sessionId: finalSession, resultText: String(result.result ?? ''), usage };
    };

    const done = run()
      .catch((error: unknown): AgentOutcome => {
        if (abort.signal.aborted) return { status: 'cancelled' };
        const reason = error instanceof Error ? error.message : String(error);
        hooks.onEvent({ type: 'error', message: reason });
        return { status: 'failed', reason };
      })
      .then((outcome) => {
        rejectSession(new Error('The agent run ended without a session.'));
        return outcome;
      });

    return {
      sessionId,
      done,
      cancel: async () => {
        // Children are found through their parent: take the snapshot while the agent still runs.
        const tree = this.options.processTree;
        const children = tree && pid !== undefined ? await tree.descendants(pid).catch(() => []) : [];
        abort.abort();
        await done;
        for (const child of children) await tree?.kill(child).catch(() => undefined);
      },
      pid: () => pid,
    };
  }
}

async function loadQuery(): Promise<QueryFunction> {
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as { query: QueryFunction };
  return sdk.query;
}
