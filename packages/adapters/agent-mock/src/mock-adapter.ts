// SPDX-License-Identifier: Apache-2.0
// Deterministic, scripted AgentAdapter for unit and end-to-end tests (ADR-008, NFR-022).
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentOutcome,
  AgentUsage,
  RunHandle,
  RunHooks,
  RunRequest,
  RuntimeInfo,
  VerifyResult,
} from '@specforge/application';

export type MockStep =
  | { type: 'output'; text: string }
  | { type: 'tool'; toolName: string; input: Record<string, unknown> }
  | { type: 'usage'; usage: AgentUsage }
  | { type: 'result'; text: string }
  | { type: 'fail'; reason: string }
  | { type: 'hang' }
  | { type: 'delay'; ms: number }
  | { type: 'remember'; value: string }
  | { type: 'recall' };

export interface MockAdapterOptions {
  /** Script for a run; defaults to the built-in contract scenarios keyed by prompt. */
  script?: (request: RunRequest) => MockStep[];
}

const VERSION = '1.0.0';
/** Tools that change the workspace or run commands and therefore need permission. */
const PERMISSION_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Bash', 'PowerShell']);

const DEFAULT_SCRIPTS: Record<string, MockStep[]> = {
  echo: [
    { type: 'output', text: 'PONG' },
    { type: 'result', text: 'PONG' },
  ],
  permission: [
    { type: 'tool', toolName: 'Write', input: { file_path: 'contract.txt', content: 'written by mock\n' } },
    { type: 'result', text: 'Attempted to write contract.txt.' },
  ],
  long: [{ type: 'output', text: 'Working on a long task…' }, { type: 'hang' }],
  remember: [
    { type: 'remember', value: 'ZEBRA-42' },
    { type: 'result', text: 'OK' },
  ],
  recall: [{ type: 'recall' }],
};

function defaultScript(request: RunRequest): MockStep[] {
  return (
    DEFAULT_SCRIPTS[request.prompt] ?? [
      { type: 'output', text: `Mock agent received: ${request.prompt}` },
      { type: 'result', text: 'Mock run completed.' },
    ]
  );
}

class Cancelled extends Error {}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Cancelled());
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => reject(new Cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolvePromise(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const never = () => new Promise<never>(() => undefined);

/** Writes inside `cwd` only; returns false for paths escaping the run directory. */
function writeInside(cwd: string, path: unknown, content: unknown): boolean {
  if (typeof path !== 'string') return false;
  const root = resolve(cwd);
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) return false;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof content === 'string' ? content : '');
  return true;
}

export class MockAdapter implements AgentAdapter {
  readonly type = 'mock';
  private readonly sessions = new Map<string, string[]>();
  private readonly script: (request: RunRequest) => MockStep[];

  constructor(options: MockAdapterOptions = {}) {
    this.script = options.script ?? defaultScript;
  }

  capabilities(): AgentCapabilities {
    return { resume: true, permissionRelay: true, structuredResult: true, models: ['mock'], requiresProvider: false };
  }

  async detect(): Promise<RuntimeInfo> {
    return { found: true, path: 'mock', version: VERSION };
  }

  async verify(): Promise<VerifyResult> {
    return { ok: true, version: VERSION };
  }

  start(request: RunRequest, hooks: RunHooks): RunHandle {
    const controller = new AbortController();
    const sessionId = request.resumeSessionId ?? randomUUID();
    const memory = this.sessions.get(sessionId) ?? [];
    this.sessions.set(sessionId, memory);

    const execute = async (): Promise<AgentOutcome> => {
      let resultText = '';
      let usage: AgentUsage | undefined;
      hooks.onEvent({ type: 'session', sessionId });
      for (const step of this.script(request)) {
        if (controller.signal.aborted) throw new Cancelled();
        switch (step.type) {
          case 'output':
            hooks.onEvent({ type: 'output', text: step.text });
            break;
          case 'usage':
            usage = step.usage;
            hooks.onEvent({ type: 'usage', usage: step.usage });
            break;
          case 'result':
            resultText = step.text;
            hooks.onEvent({ type: 'output', text: step.text });
            break;
          case 'remember':
            memory.push(step.value);
            break;
          case 'recall':
            resultText = `You asked me to remember: ${memory.join(', ') || 'nothing'}`;
            hooks.onEvent({ type: 'output', text: resultText });
            break;
          case 'tool':
            await this.runTool(request, hooks, step, controller.signal);
            break;
          case 'delay':
            await abortable(sleep(step.ms), controller.signal);
            break;
          case 'hang':
            await abortable(never(), controller.signal);
            break;
          case 'fail':
            hooks.onEvent({ type: 'error', message: step.reason });
            return { status: 'failed', reason: step.reason };
        }
      }
      return usage ? { status: 'completed', sessionId, resultText, usage } : { status: 'completed', sessionId, resultText };
    };

    const done = execute().catch((error: unknown): AgentOutcome => {
      if (error instanceof Cancelled) return { status: 'cancelled' };
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    });

    return {
      sessionId: Promise.resolve(sessionId),
      done,
      cancel: async () => {
        controller.abort();
        await done;
      },
    };
  }

  private async runTool(request: RunRequest, hooks: RunHooks, step: Extract<MockStep, { type: 'tool' }>, signal: AbortSignal) {
    const toolUseId = randomUUID();
    hooks.onEvent({ type: 'tool_use', toolUseId, toolName: step.toolName, input: step.input });
    if (PERMISSION_TOOLS.has(step.toolName)) {
      const answer = await abortable(
        hooks.onPermission({ toolUseId, toolName: step.toolName, input: step.input, cwd: request.cwd }),
        signal,
      );
      if (answer.behavior === 'deny') {
        hooks.onEvent({ type: 'tool_result', toolUseId, isError: true });
        return;
      }
    }
    const ok = step.toolName === 'Write' ? writeInside(request.cwd, step.input.file_path, step.input.content) : true;
    hooks.onEvent({ type: 'tool_result', toolUseId, isError: !ok });
  }
}
