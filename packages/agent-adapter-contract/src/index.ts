// SPDX-License-Identifier: Apache-2.0
// Shared contract test suite for AgentAdapter implementations (ADR-008, NFR-022).
// Every adapter (MockAdapter, Claude Code adapter, future runtimes) must pass it.
import type { AgentAdapter, AgentEvent, PermissionAnswer, PermissionAsk, RunRequest } from '@specforge/application';
import { describe, expect, it } from 'vitest';

/**
 * Scenarios the adapter under test must be able to run:
 * - `echo`: answers with text containing `PONG`, no tools
 * - `permission`: performs one action that requires permission, then reports the outcome
 * - `long`: keeps working until cancelled (at least 30 s)
 * - `remember`: is told the code word `ZEBRA-42`
 * - `recall`: (resumed) answers with the remembered code word
 */
export type ContractScenario = 'echo' | 'permission' | 'long' | 'remember' | 'recall';

export interface AgentAdapterContract {
  name: string;
  create(): AgentAdapter;
  request(scenario: ContractScenario, overrides?: Partial<RunRequest>): RunRequest;
  /** Per-test timeout; real agents need more than the mock. */
  timeoutMs?: number;
}

interface Recorder {
  events: AgentEvent[];
  asks: PermissionAsk[];
}

function hooks(answer: PermissionAnswer = { behavior: 'allow' }): Recorder & {
  onEvent(e: AgentEvent): void;
  onPermission(a: PermissionAsk): Promise<PermissionAnswer>;
} {
  const events: AgentEvent[] = [];
  const asks: PermissionAsk[] = [];
  return {
    events,
    asks,
    onEvent: (e) => events.push(e),
    onPermission: async (a) => {
      asks.push(a);
      return answer;
    },
  };
}

export function describeAgentAdapterContract(contract: AgentAdapterContract): void {
  const timeout = contract.timeoutMs ?? 10_000;

  describe(`AgentAdapter contract: ${contract.name}`, () => {
    it('US-044 AC-3: reports its type and capabilities', () => {
      const adapter = contract.create();
      expect(adapter.type).toMatch(/\S/);
      const caps = adapter.capabilities();
      expect(typeof caps.resume).toBe('boolean');
      expect(typeof caps.permissionRelay).toBe('boolean');
      expect(Array.isArray(caps.models)).toBe(true);
    });

    it(
      'US-044 AC-3: streams a session event and output, then completes with the session id',
      async () => {
        const adapter = contract.create();
        const rec = hooks();
        const run = adapter.start(contract.request('echo'), rec);

        const outcome = await run.done;
        const sessionId = await run.sessionId;

        expect(outcome.status).toBe('completed');
        if (outcome.status !== 'completed') return;
        expect(outcome.sessionId).toBe(sessionId);
        expect(rec.events[0]).toEqual({ type: 'session', sessionId });
        expect(rec.events.some((e) => e.type === 'output')).toBe(true);
        expect(outcome.resultText).toMatch(/PONG/);
      },
      timeout,
    );

    it(
      'US-044 AC-3: relays permission requests and continues after allow',
      async () => {
        const adapter = contract.create();
        if (!adapter.capabilities().permissionRelay) return;
        const rec = hooks({ behavior: 'allow' });
        const request = contract.request('permission');

        const outcome = await adapter.start(request, rec).done;

        expect(rec.asks).toHaveLength(1);
        expect(rec.asks[0]!.toolName).toMatch(/\S/);
        expect(rec.asks[0]!.cwd).toBe(request.cwd);
        expect(outcome.status).toBe('completed');
        const result = rec.events.find((e) => e.type === 'tool_result');
        expect(result).toMatchObject({ isError: false });
      },
      timeout,
    );

    it(
      'US-044 AC-3: reports a denied permission to the agent as an error tool result',
      async () => {
        const adapter = contract.create();
        if (!adapter.capabilities().permissionRelay) return;
        const rec = hooks({ behavior: 'deny', message: 'Denied by contract test.' });

        const outcome = await adapter.start(contract.request('permission'), rec).done;

        expect(rec.asks).toHaveLength(1);
        expect(rec.events.find((e) => e.type === 'tool_result')).toMatchObject({ isError: true });
        expect(outcome.status).toBe('completed');
      },
      timeout,
    );

    it(
      'US-044 AC-3: cancels a running agent promptly',
      async () => {
        const adapter = contract.create();
        const rec = hooks();
        const run = adapter.start(contract.request('long'), rec);
        await run.sessionId;

        const t0 = Date.now();
        await run.cancel('contract test');
        const outcome = await run.done;

        expect(outcome).toEqual({ status: 'cancelled' });
        expect(Date.now() - t0).toBeLessThan(timeout);
      },
      timeout,
    );

    it(
      'US-044 AC-3: resumes a session with its previous context',
      async () => {
        const adapter = contract.create();
        if (!adapter.capabilities().resume) return;
        const first = adapter.start(contract.request('remember'), hooks());
        const sessionId = await first.sessionId;
        await first.done;

        const second = adapter.start(contract.request('recall', { resumeSessionId: sessionId }), hooks());
        const outcome = await second.done;

        expect(outcome.status).toBe('completed');
        if (outcome.status === 'completed') expect(outcome.resultText).toContain('ZEBRA-42');
      },
      timeout * 2,
    );
  });
}
