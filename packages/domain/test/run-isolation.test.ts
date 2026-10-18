// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { NON_GIT_ISOLATION_WARNING, runStartCheck } from '../src/index.js';

describe('US-047 AC-3: non-git runs require confirming the isolation warning', () => {
  it('requires confirmation with the isolation warning in non-git mode', () => {
    expect(runStartCheck({ vcsMode: 'none', confirmed: false })).toEqual({
      ok: false,
      requiresConfirmation: true,
      warning: NON_GIT_ISOLATION_WARNING,
    });
    expect(NON_GIT_ISOLATION_WARNING).toMatch(/directly in your workspace/);
    expect(NON_GIT_ISOLATION_WARNING).toMatch(/snapshot/);
  });

  it('allows the start once the user confirmed', () => {
    expect(runStartCheck({ vcsMode: 'none', confirmed: true })).toEqual({ ok: true, snapshot: true });
  });

  it('needs no confirmation in git mode, where runs are isolated in worktrees', () => {
    expect(runStartCheck({ vcsMode: 'git', confirmed: false })).toEqual({ ok: true, snapshot: false });
  });
});
