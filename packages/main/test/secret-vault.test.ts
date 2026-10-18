// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecretStorageUnavailableError, SecretVault, WeakSecretStorageError, type SafeStorageLike } from '../src/secret-vault.js';

/** Fake of Electron safeStorage: reversible but not plaintext. */
function fakeSafeStorage(backend = 'gnome_libsecret', available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from([...Buffer.from(plain, 'utf8')].map((b) => b ^ 0x5a)),
    decryptString: (data) => Buffer.from([...data].map((b) => b ^ 0x5a)).toString('utf8'),
    getSelectedStorageBackend: () => backend,
  };
}

const file = () => join(mkdtempSync(join(tmpdir(), 'sf-vault-')), 'secrets.json');

describe('US-011 AC-1: secrets are encrypted with safeStorage', () => {
  it('stores encrypted values and returns the decrypted value on request', () => {
    const path = file();
    const vault = new SecretVault({ file: path, safeStorage: fakeSafeStorage(), platform: 'win32' });

    vault.set('anthropic', 'sk-ant-api03-very-secret');

    expect(readFileSync(path, 'utf8')).not.toContain('sk-ant-api03-very-secret');
    expect(vault.get('anthropic')).toBe('sk-ant-api03-very-secret');
    expect(vault.keys()).toEqual(['anthropic']);
  });

  it('persists across vault instances and deletes secrets', () => {
    const path = file();
    new SecretVault({ file: path, safeStorage: fakeSafeStorage(), platform: 'win32' }).set('k', 'value-1234');
    const vault = new SecretVault({ file: path, safeStorage: fakeSafeStorage(), platform: 'win32' });

    expect(vault.get('k')).toBe('value-1234');
    vault.delete('k');
    expect(vault.get('k')).toBeUndefined();
    expect(vault.keys()).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('writes the vault file with user-only permissions (POSIX)', () => {
    const path = file();
    new SecretVault({ file: path, safeStorage: fakeSafeStorage(), platform: process.platform }).set('k', 'value-1234');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('refuses to store secrets when OS encryption is unavailable', () => {
    const vault = new SecretVault({ file: file(), safeStorage: fakeSafeStorage('unknown', false), platform: 'darwin' });

    expect(() => vault.set('k', 'v-123456')).toThrow(SecretStorageUnavailableError);
    expect(vault.status()).toMatchObject({ available: false });
  });
});

describe('US-011 AC-2: weak secret storage on Linux requires acknowledgement', () => {
  it.each(['basic_text', 'unknown'])('reports backend %s as weak and refuses without acknowledgement', (backend) => {
    const vault = new SecretVault({ file: file(), safeStorage: fakeSafeStorage(backend), platform: 'linux' });

    expect(vault.status()).toEqual({ available: true, weak: true, backend });
    expect(() => vault.set('k', 'value-1234')).toThrow(WeakSecretStorageError);
  });

  it('stores after explicit acknowledgement', () => {
    const vault = new SecretVault({ file: file(), safeStorage: fakeSafeStorage('basic_text'), platform: 'linux' });

    vault.set('k', 'value-1234', { acknowledgeWeakStorage: true });

    expect(vault.get('k')).toBe('value-1234');
  });

  it('treats libsecret/kwallet as strong on Linux', () => {
    expect(new SecretVault({ file: file(), safeStorage: fakeSafeStorage('gnome_libsecret'), platform: 'linux' }).status().weak).toBe(false);
  });
});
