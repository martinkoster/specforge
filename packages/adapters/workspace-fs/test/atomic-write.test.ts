// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceFiles, renameWithRetry } from '../src/index.js';

const locked = (code: string) => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

describe('Atomic writes on Windows (EPERM while another process holds the file)', () => {
  it('retries a rename that fails with EPERM, EACCES or EBUSY', async () => {
    const rename = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValueOnce(locked('EPERM'))
      .mockRejectedValueOnce(locked('EBUSY'))
      .mockResolvedValueOnce(undefined);
    await renameWithRetry('a.tmp', 'a.md', { rename, delayMs: 1 });
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempts and rethrows; other errors are not retried', async () => {
    const always = vi.fn<(from: string, to: string) => Promise<void>>().mockRejectedValue(locked('EACCES'));
    await expect(renameWithRetry('a.tmp', 'a.md', { rename: always, attempts: 3, delayMs: 1 })).rejects.toThrow(/EACCES/);
    expect(always).toHaveBeenCalledTimes(3);
    const missing = vi.fn<(from: string, to: string) => Promise<void>>().mockRejectedValue(locked('ENOENT'));
    await expect(renameWithRetry('a.tmp', 'a.md', { rename: missing, delayMs: 1 })).rejects.toThrow(/ENOENT/);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it('writeAtomic replaces the file and leaves no temp file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-atomic-'));
    const files = new WorkspaceFiles(root);
    const first = await files.writeAtomic('spec/a.md', 'one', { expectedHash: null });
    await files.writeAtomic('spec/a.md', 'two', { expectedHash: first });
    expect(readFileSync(join(root, 'spec', 'a.md'), 'utf8')).toBe('two');
    expect(readdirSync(join(root, 'spec'))).toEqual(['a.md']);
  });
});
