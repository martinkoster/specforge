// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUSIONS, SnapshotStore } from '../src/index.js';

function write(root: string, rel: string, content: string | Buffer) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'sf-snap-ws-'));
  write(root, 'src/app.ts', 'export const a = 1;\n');
  write(root, 'src/util.ts', 'export const b = 2;\n');
  write(root, 'copy/util.ts', 'export const b = 2;\n');
  write(root, 'assets/logo.bin', Buffer.from([0, 1, 2, 3, 0, 255]));
  write(root, 'node_modules/pkg/index.js', 'ignored');
  write(root, 'debug.log', 'ignored too');
  return root;
}

const store = () => new SnapshotStore(mkdtempSync(join(tmpdir(), 'sf-snap-store-')));

describe('US-047 AC-1: content-addressed snapshot with manifest, respecting exclusions', () => {
  it('records every non-excluded file in the manifest and stores each distinct content once', async () => {
    const s = store();
    const root = workspace();

    const snapshot = await s.create(root, { exclusions: [...DEFAULT_EXCLUSIONS, '**/*.log'] });

    expect(Object.keys(snapshot.manifest.files).sort()).toEqual(['assets/logo.bin', 'copy/util.ts', 'src/app.ts', 'src/util.ts']);
    expect(snapshot.manifest.files['src/util.ts']!.hash).toBe(snapshot.manifest.files['copy/util.ts']!.hash);
    expect(s.objectCount()).toBe(3);
    expect(existsSync(join(s.root, 'manifests', `${snapshot.id}.json`))).toBe(true);
    expect(s.readObject(snapshot.manifest.files['src/app.ts']!.hash).toString()).toBe('export const a = 1;\n');
  });

  it('loads a stored snapshot by id', async () => {
    const s = store();
    const snapshot = await s.create(workspace(), { exclusions: DEFAULT_EXCLUSIONS });

    expect(s.load(snapshot.id)).toEqual({ id: snapshot.id, manifest: snapshot.manifest });
  });

  it('excludes node_modules, .git, .venv and build output by default', () => {
    expect(DEFAULT_EXCLUSIONS).toEqual(expect.arrayContaining(['**/node_modules/**', '**/.git/**', '**/.venv/**', '**/dist/**']));
  });
});

describe('US-047 AC-2: diff and restore', () => {
  it('lists added, modified and deleted files with text patches', async () => {
    const s = store();
    const root = workspace();
    const snapshot = await s.create(root, { exclusions: [...DEFAULT_EXCLUSIONS, '**/*.log'] });

    write(root, 'src/app.ts', 'export const a = 42;\n');
    rmSync(join(root, 'src', 'util.ts'));
    write(root, 'src/new.ts', 'export const c = 3;\n');
    write(root, 'assets/logo.bin', Buffer.from([9, 9, 0, 9]));

    const changes = await s.diff(snapshot.id, root);

    expect(changes.map((c) => [c.path, c.change])).toEqual([
      ['assets/logo.bin', 'M'],
      ['src/app.ts', 'M'],
      ['src/new.ts', 'A'],
      ['src/util.ts', 'D'],
    ]);
    const app = changes.find((c) => c.path === 'src/app.ts')!;
    expect(app.patch).toContain('-export const a = 1;');
    expect(app.patch).toContain('+export const a = 42;');
    expect(changes.find((c) => c.path === 'assets/logo.bin')!.patch).toBeUndefined();
    expect(changes.find((c) => c.path === 'src/new.ts')!.patch).toContain('+export const c = 3;');
  });

  it('reports no changes for an untouched workspace', async () => {
    const s = store();
    const root = workspace();
    const snapshot = await s.create(root, { exclusions: [...DEFAULT_EXCLUSIONS, '**/*.log'] });

    await expect(s.diff(snapshot.id, root)).resolves.toEqual([]);
  });

  it('restores modified and deleted files and removes added ones', async () => {
    const s = store();
    const root = workspace();
    const snapshot = await s.create(root, { exclusions: [...DEFAULT_EXCLUSIONS, '**/*.log'] });
    write(root, 'src/app.ts', 'changed\n');
    rmSync(join(root, 'src', 'util.ts'));
    write(root, 'src/new.ts', 'new\n');
    write(root, 'tmp/deep/new.txt', 'new\n');

    const summary = await s.restore(snapshot.id, root);

    expect(summary).toEqual({ restored: 2, removed: 2 });
    expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const a = 1;\n');
    expect(readFileSync(join(root, 'src', 'util.ts'), 'utf8')).toBe('export const b = 2;\n');
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(false);
    expect(existsSync(join(root, 'tmp'))).toBe(false);
    expect(readFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'utf8')).toBe('ignored');
    await expect(s.diff(snapshot.id, root)).resolves.toEqual([]);
  });
});

describe('US-047 AC-4: incremental snapshots reuse unchanged files', () => {
  it('reads only files whose size or modification time changed since the previous snapshot of the workspace', async () => {
    const s = store();
    const root = workspace();
    const first = await s.create(root, { exclusions: DEFAULT_EXCLUSIONS });
    write(root, 'src/app.ts', 'export const a = 2;\n');

    const second = await s.create(root, { exclusions: DEFAULT_EXCLUSIONS });

    expect(second.stats).toEqual({ filesRead: 1, filesReused: Object.keys(first.manifest.files).length - 1 });
    expect(second.manifest.files['src/util.ts']).toEqual(first.manifest.files['src/util.ts']);
    expect(second.manifest.files['src/app.ts']!.hash).not.toBe(first.manifest.files['src/app.ts']!.hash);
    expect(s.readObject(second.manifest.files['src/app.ts']!.hash).toString()).toBe('export const a = 2;\n');
  });

  it('does not reuse entries from snapshots of another workspace', async () => {
    const s = store();
    await s.create(workspace(), { exclusions: DEFAULT_EXCLUSIONS });

    const other = await s.create(workspace(), { exclusions: DEFAULT_EXCLUSIONS });

    expect(other.stats.filesReused).toBe(0);
  });
});

describe('US-047: snapshot store hygiene', () => {
  it('refuses unknown snapshot ids', () => {
    expect(() => store().load('nope')).toThrow(/Unknown snapshot/);
  });

  it('keeps manifests and objects outside the workspace', async () => {
    const s = store();
    const root = workspace();
    await s.create(root, { exclusions: DEFAULT_EXCLUSIONS });

    expect(readdirSync(root).sort()).toEqual(['assets', 'copy', 'debug.log', 'node_modules', 'src']);
  });
});

describe('US-058 AC-2: restore selected paths (reject in non-git mode)', () => {
  it('restores only the given paths: modified and deleted files come back, added files are removed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-snap-sel-'));
    write(root, 'src/a.ts', 'a1');
    write(root, 'src/b.ts', 'b1');
    write(root, 'notes.md', 'mine');
    const s = store();
    const snap = await s.create(root, { exclusions: [] });
    write(root, 'src/a.ts', 'a2');
    rmSync(join(root, 'src', 'b.ts'));
    write(root, 'src/new.ts', 'new');
    write(root, 'notes.md', 'edited by the user meanwhile');

    await expect(s.restorePaths(snap.id, root, ['src/a.ts', 'src/b.ts', 'src/new.ts'])).resolves.toEqual({ restored: 2, removed: 1 });

    expect(readFileSync(join(root, 'src', 'a.ts'), 'utf8')).toBe('a1');
    expect(readFileSync(join(root, 'src', 'b.ts'), 'utf8')).toBe('b1');
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(false);
    expect(readFileSync(join(root, 'notes.md'), 'utf8')).toBe('edited by the user meanwhile');
    await expect(s.restorePaths(snap.id, root, ['../escape.txt'])).rejects.toThrow(/Invalid path/);
  });
});
