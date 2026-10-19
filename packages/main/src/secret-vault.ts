// SPDX-License-Identifier: Apache-2.0
// Secret vault in the main process (ADR-012): values are encrypted with Electron safeStorage (DPAPI / Keychain / libsecret)
// and stored as ciphertext in the app-data directory; the core only ever holds references.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The subset of Electron's `safeStorage` used by the vault. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  /** Linux only: 'basic_text' | 'gnome_libsecret' | 'kwallet' | … | 'unknown'. */
  getSelectedStorageBackend?(): string;
}

export interface VaultStatus {
  available: boolean;
  weak: boolean;
  backend: string;
}

export class SecretStorageUnavailableError extends Error {
  constructor() {
    super('The operating system does not provide secure secret storage; secrets cannot be stored.');
    this.name = 'SecretStorageUnavailableError';
  }
}

export class WeakSecretStorageError extends Error {
  constructor(backend: string) {
    super(
      `No secret service is available (backend "${backend}"); secrets would only be weakly protected. Confirm explicitly to store them anyway.`,
    );
    this.name = 'WeakSecretStorageError';
  }
}

interface VaultFile {
  version: 1;
  secrets: Record<string, string>;
}

const WEAK_LINUX_BACKENDS = new Set(['basic_text', 'unknown']);

export interface SecretVaultOptions {
  file: string;
  safeStorage: SafeStorageLike;
  platform: NodeJS.Platform;
}

export class SecretVault {
  constructor(private readonly options: SecretVaultOptions) {}

  status(): VaultStatus {
    const available = this.options.safeStorage.isEncryptionAvailable();
    const backend = this.options.safeStorage.getSelectedStorageBackend?.() ?? 'os';
    const weak = !available || (this.options.platform === 'linux' && WEAK_LINUX_BACKENDS.has(backend));
    return { available, weak, backend };
  }

  set(key: string, value: string, options: { acknowledgeWeakStorage?: boolean } = {}): void {
    const status = this.status();
    if (!status.available) throw new SecretStorageUnavailableError();
    if (status.weak && !options.acknowledgeWeakStorage) throw new WeakSecretStorageError(status.backend);
    const file = this.read();
    file.secrets[key] = this.options.safeStorage.encryptString(value).toString('base64');
    this.write(file);
  }

  get(key: string): string | undefined {
    const encrypted = this.read().secrets[key];
    return encrypted === undefined ? undefined : this.options.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  delete(key: string): void {
    const file = this.read();
    delete file.secrets[key];
    this.write(file);
  }

  keys(): string[] {
    return Object.keys(this.read().secrets).sort();
  }

  private read(): VaultFile {
    if (!existsSync(this.options.file)) return { version: 1, secrets: {} };
    return JSON.parse(readFileSync(this.options.file, 'utf8')) as VaultFile;
  }

  /** Atomic write (temp + rename), user-only permissions on POSIX. */
  private write(file: VaultFile): void {
    mkdirSync(dirname(this.options.file), { recursive: true, mode: 0o700 });
    const temp = `${this.options.file}.tmp`;
    writeFileSync(temp, JSON.stringify(file, null, 2), { mode: 0o600 });
    renameSync(temp, this.options.file);
    if (this.options.platform !== 'win32') chmodSync(this.options.file, 0o600);
  }
}
