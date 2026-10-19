// SPDX-License-Identifier: Apache-2.0
// Main side of the secret bridge (ADR-012): answers the core's secret requests from the SecretVault.
import type { SecretVault } from './secret-vault.js';

export interface SecretRequest {
  type: 'secret';
  id: number;
  op: 'set' | 'get' | 'delete';
  key: string;
  value?: string;
}

export type SecretResponse =
  { type: 'secret-result'; id: number; ok: true; value?: string } | { type: 'secret-result'; id: number; ok: false; error: string };

function isRequest(message: unknown): message is SecretRequest {
  const m = message as Partial<SecretRequest> | null;
  return (
    m?.type === 'secret' && typeof m.id === 'number' && typeof m.key === 'string' && (m.op === 'set' || m.op === 'get' || m.op === 'delete')
  );
}

/** Returns the response to post back to the core, or undefined if the message is not a secret request. */
export function handleSecretRequest(vault: Pick<SecretVault, 'set' | 'get' | 'delete'>, message: unknown): SecretResponse | undefined {
  if (!isRequest(message)) return undefined;
  try {
    if (message.op === 'set') {
      vault.set(message.key, message.value ?? '');
      return { type: 'secret-result', id: message.id, ok: true };
    }
    if (message.op === 'delete') {
      vault.delete(message.key);
      return { type: 'secret-result', id: message.id, ok: true };
    }
    const value = vault.get(message.key);
    return value === undefined
      ? { type: 'secret-result', id: message.id, ok: true }
      : { type: 'secret-result', id: message.id, ok: true, value };
  } catch (e) {
    return { type: 'secret-result', id: message.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
