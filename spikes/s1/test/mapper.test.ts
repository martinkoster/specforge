// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { mapSdkMessage } from '../src/mapper.js';

describe('US-001 AC-1 (support): map SDK messages to adapter events', () => {
  it('maps the system init message to a session event with the session id', () => {
    const events = mapSdkMessage({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'm', tools: [] });

    expect(events).toEqual([{ type: 'session', sessionId: 'sess-1', model: 'm' }]);
  });

  it('maps assistant text and tool_use blocks to output and tool_use events', () => {
    const events = mapSdkMessage({
      type: 'assistant',
      session_id: 'sess-1',
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    });

    expect(events).toEqual([
      { type: 'output', text: 'Hello' },
      { type: 'tool_use', toolUseId: 'tu1', toolName: 'Bash', input: { command: 'ls' } },
    ]);
  });

  it('maps user tool_result blocks to tool_result events', () => {
    const events = mapSdkMessage({
      type: 'user',
      session_id: 'sess-1',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: 'denied' }] },
    });

    expect(events).toEqual([{ type: 'tool_result', toolUseId: 'tu1', isError: true }]);
  });

  it('maps the final result message to a result event with outcome and cost', () => {
    const events = mapSdkMessage({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'sess-1',
      result: 'PONG',
      total_cost_usd: 0.0123,
      num_turns: 1,
    });

    expect(events).toEqual([
      { type: 'result', sessionId: 'sess-1', subtype: 'success', isError: false, text: 'PONG', costUsd: 0.0123, turns: 1 },
    ]);
  });

  it('ignores message types the adapter does not need', () => {
    expect(mapSdkMessage({ type: 'stream_event', session_id: 's' })).toEqual([]);
    expect(mapSdkMessage({ type: 'user', session_id: 's', message: { content: 'plain text' } })).toEqual([]);
  });
});
