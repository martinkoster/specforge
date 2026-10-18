// SPDX-License-Identifier: Apache-2.0
// Maps Agent SDK messages to the vendor-neutral events of SpecForge's AgentAdapter (ADR-008).

export type AgentEvent =
  | { type: 'session'; sessionId: string; model?: string }
  | { type: 'output'; text: string }
  | { type: 'tool_use'; toolUseId: string; toolName: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; isError: boolean }
  | { type: 'result'; sessionId: string; subtype: string; isError: boolean; text?: string; costUsd?: number; turns?: number };

type Block = { type: string; [key: string]: unknown };
type Message = { type: string; subtype?: string; [key: string]: unknown };

function blocks(message: Message): Block[] {
  const content = (message.message as { content?: unknown } | undefined)?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

export function mapSdkMessage(message: Message): AgentEvent[] {
  switch (message.type) {
    case 'system':
      return message.subtype === 'init'
        ? [{ type: 'session', sessionId: String(message.session_id), model: message.model as string | undefined }]
        : [];
    case 'assistant':
      return blocks(message).flatMap((b): AgentEvent[] => {
        if (b.type === 'text') return [{ type: 'output', text: String(b.text) }];
        if (b.type === 'tool_use') return [{ type: 'tool_use', toolUseId: String(b.id), toolName: String(b.name), input: b.input }];
        return [];
      });
    case 'user':
      return blocks(message)
        .filter((b) => b.type === 'tool_result')
        .map((b): AgentEvent => ({ type: 'tool_result', toolUseId: String(b.tool_use_id), isError: b.is_error === true }));
    case 'result':
      return [
        {
          type: 'result',
          sessionId: String(message.session_id),
          subtype: String(message.subtype),
          isError: message.is_error === true,
          text: message.result as string | undefined,
          costUsd: message.total_cost_usd as number | undefined,
          turns: message.num_turns as number | undefined,
        },
      ];
    default:
      return [];
  }
}
