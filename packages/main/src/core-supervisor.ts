// SPDX-License-Identifier: Apache-2.0
// Supervises the core utilityProcess and brokers a fresh MessagePort pair to core and renderer (ADR-002).

export type CoreStatus = 'connected' | 'reconnecting' | 'failed' | 'stopped';

export interface CoreProcess {
  postMessage(message: unknown, transfer?: unknown[]): void;
  onExit(listener: (code: number) => void): void;
  /** Messages from the core; `{ type: 'ready' }` once it has started (database open, last project reopened). */
  onMessage(listener: (message: unknown) => void): void;
  kill(): void;
}

export interface Channel<Port> {
  forCore: Port;
  forRenderer: Port;
}

export interface CoreSupervisorOptions<Port> {
  fork(): CoreProcess;
  createChannel(): Channel<Port>;
  connectRenderer(port: Port): void;
  onStatus(status: CoreStatus): void;
  restartDelayMs?: number;
  /** Consecutive restarts allowed before giving up. */
  maxRestarts?: number;
  /** A core that is not ready within this time is killed and restarted (default 60 s). */
  readyTimeoutMs?: number;
}

export class CoreSupervisor<Port = unknown> {
  private current: CoreProcess | undefined;
  private stopping = false;
  private restarts = 0;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: CoreSupervisorOptions<Port>) {}

  start(): void {
    this.stopping = false;
    this.launch();
  }

  stop(): void {
    this.stopping = true;
    clearTimeout(this.readyTimer);
    this.current?.kill();
    this.current = undefined;
    this.options.onStatus('stopped');
  }

  private launch(): void {
    const core = this.options.fork();
    this.current = core;
    const channel = this.options.createChannel();
    core.onExit(() => this.handleExit(core));
    // The renderer gets its port only when the core is ready, so a slow first start (e.g. on-access virus
    // scanning of freshly installed files) never times out the renderer's handshake.
    core.onMessage((message) => {
      if (core !== this.current || (message as { type?: unknown } | null)?.type !== 'ready') return;
      clearTimeout(this.readyTimer);
      this.options.connectRenderer(channel.forRenderer);
      this.options.onStatus('connected');
    });
    this.readyTimer = setTimeout(() => {
      if (core === this.current) core.kill();
    }, this.options.readyTimeoutMs ?? 60_000);
    core.postMessage({ type: 'connect' }, [channel.forCore]);
  }

  private handleExit(core: CoreProcess): void {
    if (this.stopping || core !== this.current) return;
    clearTimeout(this.readyTimer);
    if (this.restarts >= (this.options.maxRestarts ?? 5)) {
      this.current = undefined;
      this.options.onStatus('failed');
      return;
    }
    this.restarts += 1;
    this.options.onStatus('reconnecting');
    setTimeout(() => {
      if (!this.stopping) this.launch();
    }, this.options.restartDelayMs ?? 500);
  }
}
