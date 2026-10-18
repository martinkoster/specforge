// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { killTreePosix, type PosixDeps } from '../src/index.js';
import { parseLinuxProc, parseMacPs } from '../src/index.js';

function fakeSystem(opts: { ignoreTerm?: number[] } = {}) {
  const alive = new Set([10, 11, 12]);
  const signals: string[] = [];
  const deps: PosixDeps = {
    listDescendants: async () => [
      { pid: 11, ppid: 10, name: 'node' },
      { pid: 12, ppid: 11, name: 'sh' },
    ],
    signal: (pid, sig) => {
      signals.push(`${sig}:${pid}`);
      const targets = pid < 0 ? [10, 11, 12] : [pid];
      for (const t of targets) if (sig === 'SIGKILL' || !opts.ignoreTerm?.includes(t)) alive.delete(t);
    },
    isAlive: (pid) => alive.has(pid),
    sleep: async () => undefined,
    now: (() => {
      let t = 0;
      return () => (t += 100);
    })(),
  };
  return { deps, signals, alive };
}

describe('US-049 (from spike S3) AC-1 (POSIX logic, any OS): process group SIGTERM, SIGKILL after grace', () => {
  it('sends SIGTERM to the process group and every snapshot descendant, without SIGKILL when they exit', async () => {
    const { deps, signals, alive } = fakeSystem();

    await killTreePosix(10, 5000, deps);

    expect(signals).toEqual(['SIGTERM:-10', 'SIGTERM:10', 'SIGTERM:11', 'SIGTERM:12']);
    expect(alive.size).toBe(0);
  });

  it('escalates to SIGKILL for group and descendants when SIGTERM is ignored', async () => {
    const { deps, signals, alive } = fakeSystem({ ignoreTerm: [12] });

    await killTreePosix(10, 1000, deps);

    expect(signals.filter((s) => s.startsWith('SIGKILL'))).toEqual(['SIGKILL:-10', 'SIGKILL:10', 'SIGKILL:11', 'SIGKILL:12']);
    expect(alive.size).toBe(0);
  });
});

describe('US-049 (from spike S3) AC-2 (identity parsing, any OS)', () => {
  it('parses Linux /proc stat into boot-scoped start ticks and joins the NUL-separated command line', () => {
    const stat = '4242 (node (worker)) S 1 4242 4242 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 7 0 987654 1000 200';

    expect(parseLinuxProc(4242, stat, 'boot-1\n', 'node\0tree.cjs\0out\0')).toEqual({
      pid: 4242,
      startTime: 'boot-1:987654',
      commandLine: 'node tree.cjs out',
    });
  });

  it('parses macOS ps lstart/command output', () => {
    expect(parseMacPs(7, 'Mon Oct 14 08:00:00 2026     node /x/tree.cjs out\n')).toEqual({
      pid: 7,
      startTime: 'Mon Oct 14 08:00:00 2026',
      commandLine: 'node /x/tree.cjs out',
    });
    expect(parseMacPs(7, '  \n')).toBeUndefined();
  });
});
