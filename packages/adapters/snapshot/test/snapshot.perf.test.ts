// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUSIONS, SnapshotStore, type SnapshotProgress } from '../src/index.js';

function write(root: string, rel: string, content: string | Buffer) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const store = () => new SnapshotStore(mkdtempSync(join(tmpdir(), 'sf-snap-store-')));

describe('US-047 AC-4: initial snapshot with progress, pre-run snapshot in < 5 s (5,000 files / 500 MB)', () => {
  it('reports progress for the initial snapshot and takes the pre-run snapshot in under 5 seconds', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-snap-big-'));
    const chunk = Buffer.alloc(100 * 1024);
    for (let i = 0; i < 5000; i++) {
      chunk.writeUInt32LE(i, 0);
      write(root, `d${i % 50}/file-${i}.bin`, chunk);
    }
    const progress: SnapshotProgress[] = [];
    const s = store();

    // Initial snapshot: one-time background preparation when the project is opened (no hard limit, progress reported).
    const initial = await s.create(root, { exclusions: DEFAULT_EXCLUSIONS, onProgress: (p) => progress.push(p) });
    expect(Object.keys(initial.manifest.files)).toHaveLength(5000);
    expect(initial.manifest.totalBytes).toBe(5000 * 100 * 1024);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toEqual({ filesDone: 5000, filesTotal: 5000, bytesDone: 5000 * 100 * 1024 });
    expect(progress.map((p) => p.filesDone)).toEqual([...progress.map((p) => p.filesDone)].sort((a, b) => a - b));

    // Typical work between runs: a few files changed.
    for (let i = 0; i < 20; i++) write(root, `d${i % 50}/file-${i}.bin`, Buffer.alloc(100 * 1024, i + 1));

    const t0 = performance.now();
    const preRun = await s.create(root, { exclusions: DEFAULT_EXCLUSIONS });
    const ms = performance.now() - t0;

    expect(preRun.stats).toEqual({ filesRead: 20, filesReused: 4980 });
    expect(ms).toBeLessThan(5000);
    rmSync(root, { recursive: true, force: true });
    rmSync(s.root, { recursive: true, force: true });
  }, 300_000);
});
