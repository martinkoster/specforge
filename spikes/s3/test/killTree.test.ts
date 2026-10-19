// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isAlive, killTree, spawnTracked } from '../src/killTree.js';
import { identify, killOrphan, type ProcessRecord } from '../src/orphans.js';

const FIXTURE = join(__dirname, 'fixtures', 'tree.cjs');
const started: number[] = [];

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function readJson(path: string): Record<string, number> | undefined {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>) : undefined;
  } catch {
    return undefined;
  }
}

/** Starts the fixture tree and returns all pids once every level has started. */
async function startTree(extra: string[] = []): Promise<{ root: number; all: number[] }> {
  const out = join(mkdtempSync(join(tmpdir(), 's3-')), 'pids.json');
  const proc = spawnTracked(process.execPath, [FIXTURE, out, 'parent', ...extra]);
  started.push(proc.pid);
  const top = await waitFor(() => readJson(out));
  const child = await waitFor(() => readJson(`${out}.c`));
  const all = [top.parent!, top.child!, top.shell!, child.grandchild!];
  await waitFor(() => (all.every(isAlive) ? true : undefined));
  return { root: proc.pid, all };
}

afterEach(async () => {
  for (const pid of started.splice(0)) await killTree(pid, { graceMs: 0 }).catch(() => undefined);
});

describe('US-003 AC-1: a spawned process tree is terminated completely', () => {
  it('kills parent, nested node children and the shell child', async () => {
    const { root, all } = await startTree();

    await killTree(root);

    await waitFor(() => (all.every((p) => !isAlive(p)) ? true : undefined), 10_000);
    expect(all.filter(isAlive)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('escalates to SIGKILL after the grace period when SIGTERM is ignored (POSIX)', async () => {
    const { root, all } = await startTree(['--ignore-sigterm']);
    const t0 = Date.now();

    await killTree(root, { graceMs: 1000 });

    await waitFor(() => (all.every((p) => !isAlive(p)) ? true : undefined), 10_000);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
    expect(all.filter(isAlive)).toEqual([]);
  });

  it('is a no-op for a process that no longer exists', async () => {
    await expect(killTree(999_999)).resolves.toBeUndefined();
  });
});

describe('US-003 AC-2: orphan cleanup validates pid identity', () => {
  it('records start time and command line of a live process', async () => {
    const { root } = await startTree();

    const record = await identify(root);

    expect(record?.pid).toBe(root);
    expect(record?.startTime).toBeTruthy();
    expect(record?.commandLine).toMatch(/tree\.cjs/);
  });

  it('kills an orphan whose identity still matches the recorded one', async () => {
    const { root, all } = await startTree();
    const record = (await identify(root))!;

    await expect(killOrphan(record)).resolves.toBe('killed');

    await waitFor(() => (all.every((p) => !isAlive(p)) ? true : undefined), 10_000);
  });

  it('refuses to kill a reused pid whose start time differs', async () => {
    const { root } = await startTree();
    const record = (await identify(root))!;
    const reused: ProcessRecord = { ...record, startTime: '1999-01-01T00:00:00.000Z' };

    await expect(killOrphan(reused)).resolves.toBe('identity-mismatch');
    expect(isAlive(root)).toBe(true);
  });

  it('reports processes that are already gone', async () => {
    await expect(killOrphan({ pid: 999_999, startTime: 'x', commandLine: 'y' })).resolves.toBe('not-running');
  });
});
