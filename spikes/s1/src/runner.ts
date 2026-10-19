// SPDX-License-Identifier: Apache-2.0
import { query, type SettingSource } from '@anthropic-ai/claude-agent-sdk';
import type { DecisionBroker } from './broker.js';
import { mapSdkMessage, type AgentEvent } from './mapper.js';

export interface RunOptions {
  prompt: string;
  cwd: string;
  executable: string;
  broker: DecisionBroker;
  model?: string;
  resume?: string;
  /** `[]` isolates the run from user/project Claude settings so allow rules cannot bypass the relay. */
  settingSources?: SettingSource[];
  maxTurns?: number;
}

export type ResultEvent = Extract<AgentEvent, { type: 'result' }>;

export interface RunHandle {
  events: AgentEvent[];
  sessionId: Promise<string>;
  done: Promise<ResultEvent>;
  abort(): void;
}

/** Starts one agent run via the Agent SDK (prototype of the ClaudeCodeAdapter, ADR-006). */
export function startRun(options: RunOptions): RunHandle {
  const abortController = new AbortController();
  const events: AgentEvent[] = [];
  let resolveSession!: (id: string) => void;
  const sessionId = new Promise<string>((r) => (resolveSession = r));

  const done = (async (): Promise<ResultEvent> => {
    const messages = query({
      prompt: options.prompt,
      options: {
        cwd: options.cwd,
        pathToClaudeCodeExecutable: options.executable,
        model: options.model,
        resume: options.resume,
        permissionMode: 'default',
        settingSources: options.settingSources,
        maxTurns: options.maxTurns,
        abortController,
        canUseTool: (toolName, input, { signal, toolUseID }) => options.broker.ask({ toolName, input, toolUseID }, signal),
      },
    });
    let result: ResultEvent | undefined;
    for await (const message of messages) {
      for (const event of mapSdkMessage(message as { type: string })) {
        events.push(event);
        if (event.type === 'session') resolveSession(event.sessionId);
        if (event.type === 'result') result = event;
      }
    }
    if (!result) throw new Error('Run ended without a result message');
    return result;
  })();

  return { events, sessionId, done, abort: () => abortController.abort() };
}
