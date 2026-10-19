// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { GitClient, GitError } from '../src/index.js';
import { makeRepo } from './helpers.js';

vi.setConfig({ testTimeout: 120_000 });

describe('US-046 AC-5: GitClient error handling', () => {
  it('raises GitError with the failing arguments and stderr', async () => {
    const repo = makeRepo();

    const error = await new GitClient().run(repo, ['rev-parse', 'does-not-exist']).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitError);
    expect((error as GitError).args).toEqual(['rev-parse', 'does-not-exist']);
    expect((error as GitError).message).toMatch(/rev-parse does-not-exist failed/);
  });

  it('distinguishes "false" (exit 1) from real failures in test()', async () => {
    const repo = makeRepo();
    const git = new GitClient();

    await expect(git.test(repo, ['show-ref', '--verify', '--quiet', 'refs/heads/main'])).resolves.toBe(true);
    await expect(git.test(repo, ['show-ref', '--verify', '--quiet', 'refs/heads/nope'])).resolves.toBe(false);
    await expect(git.test(repo, ['merge-base', '--is-ancestor', 'no-such-ref', 'main'])).rejects.toBeInstanceOf(GitError);
  });
});
