// SPDX-License-Identifier: Apache-2.0
// Core side of the secret bridge (ADR-012): secrets are stored by the main process (safeStorage); the core sends
// requests over its parent port and only ever holds values transiently (e.g. to start an agent process).
import type { SecretStore } from '@specforge/application';

export interface SecretChannel {
  post(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

interface Result {
  type: 'secret-result';
  id: number;
  ok: boolean;
  value?: string;
  error?: string;
}

export class BridgeSecretStore implements SecretStore {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: string | undefined): void; reject(error: Error): void }>();

  constructor(private readonly channel: SecretChannel) {
    channel.onMessage((message) => this.handle(message));
  }

  async set(key: string, value: string): Promise<void> {
    await this.request('set', key, value);
  }

  get(key: string): Promise<string | undefined> {
    return this.request('get', key);
  }

  async delete(key: string): Promise<void> {
    await this.request('delete', key);
  }

  private request(op: 'set' | 'get' | 'delete', key: string, value?: string): Promise<string | undefined> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.channel.post({ type: 'secret', id, op, key, ...(value === undefined ? {} : { value }) });
    });
  }

  private handle(message: unknown): void {
    const m = message as Partial<Result> | null;
    if (m?.type !== 'secret-result' || typeof m.id !== 'number') return;
    const waiting = this.pending.get(m.id);
    if (!waiting) return;
    this.pending.delete(m.id);
    if (m.ok) waiting.resolve(m.value);
    else waiting.reject(new Error(m.error ?? 'The secret could not be stored.'));
  }
}
