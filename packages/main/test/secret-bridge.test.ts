// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleSecretRequest } from '../src/secret-bridge.js';
import { SecretVault, type SafeStorageLike } from '../src/secret-vault.js';

const safeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${s}`),
  decryptString: (b) => b.toString().slice(4),
});

const vault = (available = true) =>
  new SecretVault({
    file: join(mkdtempSync(join(tmpdir(), 'sf-vault-')), 'secrets.json'),
    safeStorage: safeStorage(available),
    platform: 'win32',
  });

describe('US-015 / ADR-012: main answers core secret requests from the vault', () => {
  it('handles set, get and delete', () => {
    const v = vault();
    expect(handleSecretRequest(v, { type: 'secret', id: 1, op: 'set', key: 'k', value: 'v' })).toEqual({
      type: 'secret-result',
      id: 1,
      ok: true,
    });
    expect(handleSecretRequest(v, { type: 'secret', id: 2, op: 'get', key: 'k' })).toEqual({
      type: 'secret-result',
      id: 2,
      ok: true,
      value: 'v',
    });
    expect(handleSecretRequest(v, { type: 'secret', id: 3, op: 'delete', key: 'k' })).toEqual({ type: 'secret-result', id: 3, ok: true });
    expect(handleSecretRequest(v, { type: 'secret', id: 4, op: 'get', key: 'k' })).toEqual({ type: 'secret-result', id: 4, ok: true });
  });

  it('returns vault errors instead of throwing, and ignores other messages', () => {
    expect(handleSecretRequest(vault(false), { type: 'secret', id: 5, op: 'set', key: 'k', value: 'v' })).toEqual({
      type: 'secret-result',
      id: 5,
      ok: false,
      error: expect.stringMatching(/secure secret storage/),
    });
    expect(handleSecretRequest(vault(), { type: 'ready' })).toBeUndefined();
    expect(handleSecretRequest(vault(), { type: 'secret', id: 'x', op: 'set' })).toBeUndefined();
  });
});
