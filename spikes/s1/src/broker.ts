// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

export interface PermissionAsk {
  toolName: string;
  input: Record<string, unknown>;
  toolUseID: string;
}

export interface PendingRequest extends PermissionAsk {
  id: string;
  requestedAt: number;
}

export type Decision = { behavior: 'allow' } | { behavior: 'deny'; message: string };

export interface AuditEntry {
  id: string;
  toolName: string;
  requestedAt: number;
  decidedAt: number;
  decision: 'allow' | 'deny';
  decidedBy: 'user' | 'abort';
}

interface Waiting extends PendingRequest {
  resolve: (r: PermissionResult) => void;
}

/**
 * Holds agent permission requests until a human decides, with no timeout
 * (prototype of SpecForge's PermissionBroker, ADR-013).
 */
export class DecisionBroker {
  private readonly waiting = new Map<string, Waiting>();
  private readonly log: AuditEntry[] = [];
  private readonly listeners: Array<(r: PendingRequest) => void> = [];

  ask(ask: PermissionAsk, signal: AbortSignal): Promise<PermissionResult> {
    return new Promise((resolve) => {
      const request: Waiting = { ...ask, id: randomUUID(), requestedAt: Date.now(), resolve };
      this.waiting.set(request.id, request);
      signal.addEventListener('abort', () => this.settle(request.id, { behavior: 'deny', message: 'Run aborted.' }, 'abort'), {
        once: true,
      });
      for (const listener of this.listeners) listener(this.view(request));
    });
  }

  decide(id: string, decision: Decision): void {
    if (!this.waiting.has(id)) throw new Error(`Unknown permission request: ${id}`);
    this.settle(id, decision, 'user');
  }

  onRequest(listener: (r: PendingRequest) => void): void {
    this.listeners.push(listener);
  }

  pending(): PendingRequest[] {
    return [...this.waiting.values()].map((w) => this.view(w));
  }

  audit(): AuditEntry[] {
    return [...this.log];
  }

  private settle(id: string, decision: Decision, decidedBy: AuditEntry['decidedBy']): void {
    const request = this.waiting.get(id);
    if (!request) return;
    this.waiting.delete(id);
    this.log.push({
      id,
      toolName: request.toolName,
      requestedAt: request.requestedAt,
      decidedAt: Date.now(),
      decision: decision.behavior,
      decidedBy,
    });
    request.resolve(
      decision.behavior === 'allow' ? { behavior: 'allow', updatedInput: request.input } : { behavior: 'deny', message: decision.message },
    );
  }

  private view({ resolve: _resolve, ...request }: Waiting): PendingRequest {
    return request;
  }
}
