// SPDX-License-Identifier: Apache-2.0
// Process-tree termination for the ProcessRegistry (FR-034, FR-041; validated in spike S3).
import { execFile, spawn } from 'node:child_process';
import { listDescendants, type ProcessInfo } from './process-tree.js';

export interface KillOptions {
  /** POSIX: time between SIGTERM and SIGKILL. */
  graceMs?: number;
}

/**
 * Spawns a process so that its whole tree can be terminated later:
 * on POSIX it becomes the leader of its own process group (detached), on Windows taskkill /T walks the tree.
 */
export function spawnTracked(command: string, args: string[]): { pid: number } {
  const child = spawn(command, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
  if (child.pid === undefined) throw new Error(`Failed to spawn ${command}`);
  return { pid: child.pid };
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(pid, sig);
  } catch {
    // already gone or not permitted: nothing to do
  }
}

/** System functions used by the POSIX strategy (injectable for OS-independent tests). */
export interface PosixDeps {
  listDescendants(pid: number): Promise<ProcessInfo[]>;
  signal(pid: number, sig: NodeJS.Signals): void;
  isAlive(pid: number): boolean;
  sleep(ms: number): Promise<void>;
  now(): number;
}

const systemDeps: PosixDeps = {
  listDescendants,
  signal,
  isAlive,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

async function waitUntilDead(pids: number[], timeoutMs: number, deps: PosixDeps): Promise<boolean> {
  const deadline = deps.now() + timeoutMs;
  while (pids.some((p) => deps.isAlive(p))) {
    if (deps.now() >= deadline) return false;
    await deps.sleep(50);
  }
  return true;
}

/** POSIX: SIGTERM to the process group and all snapshot descendants, SIGKILL after `graceMs`. */
export async function killTreePosix(pid: number, graceMs: number, deps: PosixDeps = systemDeps): Promise<void> {
  // Snapshot descendants too: children that called setsid() leave the process group.
  const tree = [pid, ...(await deps.listDescendants(pid)).map((p) => p.pid)];
  deps.signal(-pid, 'SIGTERM');
  for (const p of tree) deps.signal(p, 'SIGTERM');
  if (await waitUntilDead(tree, graceMs, deps)) return;
  deps.signal(-pid, 'SIGKILL');
  for (const p of tree) deps.signal(p, 'SIGKILL');
}

function taskkill(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
  });
}

/** Terminates `pid` and all its descendants. Resolves when the attempt is complete. */
export async function killTree(pid: number, options: KillOptions = {}): Promise<void> {
  if (!isAlive(pid)) return;
  if (process.platform === 'win32') {
    await taskkill(pid);
    return;
  }
  await killTreePosix(pid, options.graceMs ?? 5000);
}
