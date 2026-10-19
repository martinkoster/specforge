// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { BridgeSecretStore } from '../src/index.js';

/** Wires a core-side store to a fake main process that answers from a map. */
function setup(fail?: string) {
  const vault = new Map<string, string>();
  let deliver: ((message: unknown) => void) | undefined;
  const store = new BridgeSecretStore({
    post: (message) => {
      const m = message as { id: number; op: 'set' | 'get' | 'delete'; key: string; value?: string };
      queueMicrotask(() => {
        if (fail) return deliver?.({ type: 'secret-result', id: m.id, ok: false, error: fail });
        if (m.op === 'set') vault.set(m.key, m.value!);
        if (m.op === 'delete') vault.delete(m.key);
        deliver?.({
          type: 'secret-result',
          id: m.id,
          ok: true,
          ...(m.op === 'get' && vault.has(m.key) ? { value: vault.get(m.key) } : {}),
        });
      });
    },
    onMessage: (listener) => (deliver = listener),
  });
  return { store, vault };
}

describe('US-015 AC-1 / ADR-012: secrets are stored by the main process', () => {
  it('sets, reads and deletes secrets through main; requests are correlated by id', async () => {
    const { store, vault } = setup();

    await Promise.all([store.set('a', '1'), store.set('b', '2')]);
    expect(Object.fromEntries(vault)).toEqual({ a: '1', b: '2' });
    await expect(store.get('a')).resolves.toBe('1');
    await store.delete('a');
    await expect(store.get('a')).resolves.toBeUndefined();
  });

  it('reports vault errors (e.g. no secure storage) to the caller', async () => {
    const { store } = setup('The operating system does not provide secure secret storage; secrets cannot be stored.');
    await expect(store.set('a', '1')).rejects.toThrow(/secure secret storage/);
  });

  it('ignores unrelated messages', () => {
    const { store } = setup();
    expect(() => (store as unknown as { handle(m: unknown): void }).handle({ type: 'ready' })).not.toThrow();
  });
});
