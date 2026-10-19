// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { descendantsOf, listDescendants, parsePosixPs, parseWindowsProcessJson } from '../src/processTree.js';

describe('US-003 AC-1 (support): detect surviving child processes', () => {
  it('parses Windows process JSON (Get-CimInstance) into pid/ppid pairs', () => {
    const json = JSON.stringify([
      { ProcessId: 10, ParentProcessId: 1, Name: 'node.exe' },
      { ProcessId: 11, ParentProcessId: 10, Name: 'claude.exe' },
    ]);

    expect(parseWindowsProcessJson(json)).toEqual([
      { pid: 10, ppid: 1, name: 'node.exe' },
      { pid: 11, ppid: 10, name: 'claude.exe' },
    ]);
  });

  it('parses a single Windows process object (PowerShell unwraps one-element arrays)', () => {
    expect(parseWindowsProcessJson('{"ProcessId":5,"ParentProcessId":4,"Name":"x"}')).toEqual([{ pid: 5, ppid: 4, name: 'x' }]);
  });

  it('parses POSIX ps output into pid/ppid pairs', () => {
    expect(parsePosixPs('  10     1 node\n  11    10 claude\n')).toEqual([
      { pid: 10, ppid: 1, name: 'node' },
      { pid: 11, ppid: 10, name: 'claude' },
    ]);
  });

  it('computes all transitive descendants of a pid', () => {
    const table = [
      { pid: 10, ppid: 1, name: 'node' },
      { pid: 11, ppid: 10, name: 'claude' },
      { pid: 12, ppid: 11, name: 'bash' },
      { pid: 13, ppid: 12, name: 'sleep' },
      { pid: 20, ppid: 1, name: 'other' },
    ];

    expect(descendantsOf(10, table).map((p) => p.pid).sort()).toEqual([11, 12, 13]);
  });

  it('lists real child processes of the current process', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const descendants = await listDescendants(process.pid);
      expect(descendants.map((p) => p.pid)).toContain(child.pid);
    } finally {
      child.kill();
    }
  }, 30000);
});
