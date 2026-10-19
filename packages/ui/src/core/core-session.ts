// SPDX-License-Identifier: Apache-2.0
// Renderer-side session with the core over the IPC contract; survives core restarts (US-005 AC-3, US-022).
import { connectClient, type CommandOutput, type ContractClient, type PortLike } from '@specforge/ipc-contract';

export type CoreStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'stopped';

export interface CoreSessionOptions {
  handshakeTimeoutMs?: number;
}

export class CoreSession {
  private current: ContractClient | undefined;
  private status: CoreStatus = 'connecting';
  private readonly listeners = new Set<(status: CoreStatus) => void>();
  /** Message of the last failed handshake, shown to the user. */
  lastError: string | undefined;

  constructor(private readonly options: CoreSessionOptions = {}) {}

  get currentStatus(): CoreStatus {
    return this.status;
  }

  onStatus(listener: (status: CoreStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Connects through a (new) core port; each core restart delivers a fresh port. */
  async attach(port: PortLike): Promise<void> {
    this.current = undefined;
    try {
      const timeout = this.options.handshakeTimeoutMs;
      this.current = await connectClient(port, timeout === undefined ? {} : { timeoutMs: timeout });
      this.lastError = undefined;
      this.setStatus('connected');
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.setStatus('failed');
    }
  }

  setStatus(status: CoreStatus): void {
    if (status !== 'connected') this.current = undefined;
    if (status === this.status && status !== 'connected') return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  client(): ContractClient {
    if (!this.current) throw new Error('The SpecForge core is not connected.');
    return this.current;
  }

  ping(): Promise<CommandOutput<'system.ping'>> {
    try {
      return this.client().command('system.ping', { nonce: Math.random().toString(36).slice(2) });
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }
}
