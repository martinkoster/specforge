// SPDX-License-Identifier: Apache-2.0
// One agent run outside the story Scheduler (specification, quality check and clarification runs): redacted, batched
// events, max-duration and idle timeouts (paused during permission decisions) and the permission relay.
import { EventBatcher, RunTimers, agentConfig, type RunConfig, type RunEventRecord } from '../execution/execution-service.js';
import type { PermissionRunContext } from '../permissions/permission-broker.js';
import type { AgentAdapter, AgentEvent, PermissionAnswer, PermissionAsk, RunKind } from '../ports/agent-adapter.js';
import { createRedactor } from '../secrets/redactor.js';

export interface AgentRunStore {
  markStarted(runId: string, at: string): void;
  setSessionId(runId: string, sessionId: string): void;
  appendEvents(runId: string, events: RunEventRecord[]): void;
}

export interface AgentRunDeps {
  store: AgentRunStore;
  env(projectId: string): Promise<{ env: Record<string, string>; secrets: string[] }>;
  config(projectId: string): RunConfig;
  permissions: { ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> };
  implementationActive(projectId: string): boolean;
  emit?(runId: string, event: AgentEvent, seq: number): void;
  now(): string;
}

export interface AgentRunSpec {
  runId: string;
  projectId: string;
  kind: RunKind;
  /** Main workspace root. */
  cwd: string;
  nonGit: boolean;
  prompt: string;
  /** The only folder or file the run may write. */
  writeScope?: string;
  /** All writes and shell commands are denied (quality checks, clarification questions). */
  readOnly?: boolean;
  /** Continue this agent session (multi-turn clarification). */
  resumeSessionId?: string;
}

export type AgentRunOutcome =
  { status: 'completed'; resultText: string; sessionId: string } | { status: 'failed'; reason: string } | { status: 'cancelled' };

export interface AgentRun {
  done: Promise<AgentRunOutcome>;
  cancel(): Promise<void>;
}

export function runAgent(adapter: AgentAdapter, deps: AgentRunDeps, spec: AgentRunSpec): AgentRun {
  let cancel: () => Promise<void> = async () => undefined;
  let cancelled = false;
  const done = (async (): Promise<AgentRunOutcome> => {
    const { runId, projectId } = spec;
    const [{ env, secrets }, config] = [await deps.env(projectId), deps.config(projectId)];
    const redactor = createRedactor(secrets);
    const events = new EventBatcher((records) => deps.store.appendEvents(runId, records), 100, 200);
    let timeoutReason: string | undefined;
    const control: { cancel?: () => Promise<void> } = {};
    const timers = new RunTimers(config.maxRunDurationS * 1000, config.idleTimeoutS * 1000, (reason) => {
      timeoutReason ??= reason;
      void control.cancel?.();
    });
    const permissionContext: PermissionRunContext = {
      runId,
      projectId,
      runKind: spec.kind,
      workspaceRoot: spec.cwd,
      nonGit: spec.nonGit,
      implementationActive: () => deps.implementationActive(projectId),
      ...(spec.writeScope !== undefined ? { writeScope: spec.writeScope } : {}),
      ...(spec.readOnly ? { readOnly: true } : {}),
    };
    let seq = 0;
    deps.store.markStarted(runId, deps.now());
    timers.start();
    const handle = adapter.start(
      {
        runId,
        kind: spec.kind,
        cwd: spec.cwd,
        prompt: spec.prompt,
        config: agentConfig(config.agent, env),
        ...(spec.resumeSessionId ? { resumeSessionId: spec.resumeSessionId } : {}),
      },
      {
        onEvent: (event) => {
          timers.activity();
          if (event.type === 'session') deps.store.setSessionId(runId, event.sessionId);
          const redacted = redactor.value(event);
          seq += 1;
          events.add({ seq, ts: deps.now(), type: event.type, payload: redacted });
          deps.emit?.(runId, redacted, seq);
        },
        onPermission: async (ask) => {
          timers.pause();
          try {
            return await deps.permissions.ask(permissionContext, ask);
          } finally {
            timers.resume();
          }
        },
      },
    );
    control.cancel = () => handle.cancel(timeoutReason);
    cancel = () => handle.cancel('Cancelled by the user.');
    if (timeoutReason || cancelled) void handle.cancel(timeoutReason);
    const outcome = await handle.done;
    timers.stop();
    events.flush();
    if (timeoutReason) return { status: 'failed', reason: timeoutReason };
    if (outcome.status === 'completed') return { status: 'completed', resultText: outcome.resultText, sessionId: outcome.sessionId };
    if (outcome.status === 'failed') return { status: 'failed', reason: outcome.reason };
    return { status: 'cancelled' };
  })();
  return {
    done,
    cancel: async () => {
      cancelled = true;
      await cancel();
    },
  };
}
