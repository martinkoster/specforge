// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { CoreSupervisor, type CoreProcess, type CoreStatus } from '../src/core-supervisor.js';

class FakeProcess implements CoreProcess {
  readonly received: unknown[] = [];
  private exitListener: ((code: number) => void) | undefined;
  private messageListener: ((message: unknown) => void) | undefined;
  killed = false;
  postMessage(message: unknown, transfer?: unknown[]): void {
    this.received.push({ message, transfer });
  }
  onExit(listener: (code: number) => void): void {
    this.exitListener = listener;
  }
  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }
  /** The core finished starting (database open, project reopened). */
  ready(): void {
    this.messageListener?.({ type: 'ready' });
  }
  kill(): void {
    this.killed = true;
    this.exitListener?.(0);
  }
  crash(code = 1): void {
    this.exitListener?.(code);
  }
}

function setup(maxRestarts = 3, readyTimeoutMs = 1000) {
  const processes: FakeProcess[] = [];
  const statuses: CoreStatus[] = [];
  const rendererPorts: string[] = [];
  let channel = 0;
  const supervisor = new CoreSupervisor({
    fork: () => {
      const p = new FakeProcess();
      processes.push(p);
      return p;
    },
    createChannel: () => {
      channel += 1;
      return { forCore: `core-port-${channel}`, forRenderer: `renderer-port-${channel}` };
    },
    connectRenderer: (port) => rendererPorts.push(String(port)),
    onStatus: (s) => statuses.push(s),
    restartDelayMs: 0,
    maxRestarts,
    readyTimeoutMs,
  });
  return { supervisor, processes, statuses, rendererPorts };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('US-005 AC-2/AC-3: core supervision and MessagePort brokering', () => {
  it('forks the core and hands one end of a fresh channel to core and renderer', () => {
    const { supervisor, processes, statuses, rendererPorts } = setup();

    supervisor.start();

    expect(processes).toHaveLength(1);
    expect(processes[0]!.received).toEqual([{ message: { type: 'connect' }, transfer: ['core-port-1'] }]);
    // The renderer is connected only once the core is ready (slow first starts must not fail the handshake).
    expect(rendererPorts).toEqual([]);
    expect(statuses).toEqual([]);

    processes[0]!.ready();

    expect(rendererPorts).toEqual(['renderer-port-1']);
    expect(statuses).toEqual(['connected']);
  });

  it('kills and restarts a core that does not become ready in time', async () => {
    const { supervisor, processes, statuses } = setup(3, 10);
    supervisor.start();

    await new Promise((r) => setTimeout(r, 40));

    expect(processes[0]!.killed).toBe(true);
    expect(processes.length).toBeGreaterThanOrEqual(2);
    expect(statuses[0]).toBe('reconnecting');
    processes.at(-1)!.ready();
    expect(statuses.at(-1)).toBe('connected');
    supervisor.stop();
  });

  it('ignores other messages from the core', () => {
    const { supervisor, processes, statuses } = setup();
    supervisor.start();
    (processes[0] as unknown as { messageListener(m: unknown): void }).messageListener({ type: 'log' });
    expect(statuses).toEqual([]);
    supervisor.stop();
  });

  it('restarts a crashed core, reports "reconnecting" and reconnects the renderer with a new channel', async () => {
    const { supervisor, processes, statuses, rendererPorts } = setup();
    supervisor.start();
    processes[0]!.ready();

    processes[0]!.crash();
    await tick();
    processes[1]!.ready();

    expect(statuses).toEqual(['connected', 'reconnecting', 'connected']);
    expect(processes).toHaveLength(2);
    expect(rendererPorts).toEqual(['renderer-port-1', 'renderer-port-2']);
  });

  it('gives up after too many consecutive crashes and reports "failed"', async () => {
    const { supervisor, processes, statuses } = setup(2);
    supervisor.start();

    for (let i = 0; i < 3; i++) {
      processes.at(-1)!.ready();
      processes.at(-1)!.crash();
      await tick();
    }

    expect(statuses.at(-1)).toBe('failed');
    expect(processes).toHaveLength(3);
  });

  it('does not restart after an intentional stop', async () => {
    const { supervisor, processes, statuses } = setup();
    supervisor.start();
    processes[0]!.ready();

    supervisor.stop();
    await tick();

    expect(processes[0]!.killed).toBe(true);
    expect(processes).toHaveLength(1);
    expect(statuses).toEqual(['connected', 'stopped']);
  });
});
