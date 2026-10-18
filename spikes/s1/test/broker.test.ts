// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionBroker } from '../src/broker.js';

describe('US-001 AC-2 (support): decision broker blocks until a human decides', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a request pending for more than 10 minutes and resolves with the later decision', async () => {
    const broker = new DecisionBroker();
    let settled = false;
    const answer = broker.ask({ toolName: 'Write', input: { file_path: 'a.txt' }, toolUseID: 't1' }, new AbortController().signal);
    void answer.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    expect(settled).toBe(false);
    expect(broker.pending()).toHaveLength(1);

    const id = broker.pending()[0]!.id;
    broker.decide(id, { behavior: 'allow' });

    await expect(answer).resolves.toEqual({ behavior: 'allow', updatedInput: { file_path: 'a.txt' } });
    expect(broker.pending()).toHaveLength(0);
  });

  it('passes a deny decision with its message to the agent', async () => {
    const broker = new DecisionBroker();
    const answer = broker.ask({ toolName: 'Bash', input: { command: 'rm -rf x' }, toolUseID: 't2' }, new AbortController().signal);

    broker.decide(broker.pending()[0]!.id, { behavior: 'deny', message: 'Not allowed' });

    await expect(answer).resolves.toEqual({ behavior: 'deny', message: 'Not allowed' });
  });

  it('denies a pending request when the run is aborted', async () => {
    const broker = new DecisionBroker();
    const ac = new AbortController();
    const answer = broker.ask({ toolName: 'Write', input: {}, toolUseID: 't3' }, ac.signal);

    ac.abort();

    await expect(answer).resolves.toMatchObject({ behavior: 'deny' });
    expect(broker.audit().at(-1)).toMatchObject({ decision: 'deny', decidedBy: 'abort' });
  });

  it('records an audit entry with request and decision timestamps', async () => {
    const broker = new DecisionBroker();
    const answer = broker.ask({ toolName: 'Write', input: {}, toolUseID: 't4' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(5000);
    broker.decide(broker.pending()[0]!.id, { behavior: 'allow' });
    await answer;

    const [entry] = broker.audit();
    expect(entry).toMatchObject({ toolName: 'Write', decision: 'allow', decidedBy: 'user' });
    expect(entry!.decidedAt - entry!.requestedAt).toBe(5000);
  });

  it('notifies listeners when a new request arrives', () => {
    const broker = new DecisionBroker();
    const seen: string[] = [];
    broker.onRequest((r) => seen.push(r.toolName));

    void broker.ask({ toolName: 'Edit', input: {}, toolUseID: 't5' }, new AbortController().signal);

    expect(seen).toEqual(['Edit']);
  });

  it('rejects decisions for unknown request ids', () => {
    const broker = new DecisionBroker();

    expect(() => broker.decide('nope', { behavior: 'allow' })).toThrow(/Unknown permission request/);
  });
});
