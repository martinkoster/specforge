// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { createSystemHandlers } from '../src/index.js';

describe('US-005/US-022: core system handlers on the IPC contract', () => {
  it('answers ping with the nonce and the core pid', async () => {
    const handlers = createSystemHandlers({ pid: 42, platform: 'win32', allowCrash: false, exit: vi.fn() });

    await expect(handlers['system.ping']!({ nonce: 'n1' })).resolves.toEqual({ nonce: 'n1', pid: 42 });
    await expect(handlers['system.info']!({})).resolves.toMatchObject({ platform: 'win32' });
  });

  it('US-005 AC-3: crashes on request only in test mode', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();

    await expect(createSystemHandlers({ pid: 1, platform: 'x', allowCrash: false, exit })['system.crash']!({})).resolves.toEqual({
      accepted: false,
    });
    await expect(createSystemHandlers({ pid: 1, platform: 'x', allowCrash: true, exit })['system.crash']!({})).resolves.toEqual({
      accepted: true,
    });
    vi.runAllTimers();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it('US-022: returns the shell state (empty until projects exist)', async () => {
    const handlers = createSystemHandlers({ pid: 1, platform: 'x', allowCrash: false, exit: vi.fn() });

    await expect(handlers['shell.state']!({})).resolves.toEqual({
      projects: [],
      currentProjectId: null,
      vcs: null,
      runs: { running: 0, queued: 0 },
      pendingDecisions: 0,
      storyCount: 0,
    });
  });
});
