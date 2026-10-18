// SPDX-License-Identifier: Apache-2.0
// Content-addressed workspace snapshots (ADR-011, FR-039): objects are stored once per content under <store>/objects,
// one manifest per snapshot under <store>/manifests. Used for diff and restore in non-git workspaces.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import picomatch from 'picomatch';

export const DEFAULT_EXCLUSIONS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
];

export interface ManifestEntry {
  hash: string;
  size: number;
  mtimeMs: number;
}

export interface Manifest {
  createdAt: string;
  exclusions: string[];
  totalBytes: number;
  files: Record<string, ManifestEntry>;
}

export interface Snapshot {
  id: string;
  manifest: Manifest;
}

export interface CreatedSnapshot extends Snapshot {
  /** Files read (new or changed) vs. reused unchanged from the previous snapshot of the same workspace. */
  stats: { filesRead: number; filesReused: number };
}

export interface SnapshotProgress {
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
}

export interface CreateOptions {
  exclusions: readonly string[];
  onProgress?(progress: SnapshotProgress): void;
}

export interface SnapshotChange {
  path: string;
  change: 'A' | 'M' | 'D';
  /** Unified diff for text files; undefined for binary or very large files. */
  patch?: string;
}

const CONCURRENCY = 32;
const PROGRESS_EVERY = 250;
const MAX_PATCH_BYTES = 1024 * 1024;

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const isText = (data: Buffer) => data.length <= MAX_PATCH_BYTES && !data.includes(0);

async function pool<T>(items: readonly T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

interface FileStat {
  path: string;
  size: number;
  mtimeMs: number;
}

async function scan(root: string, exclusions: readonly string[]): Promise<FileStat[]> {
  const excluded = picomatch([...exclusions], { dot: true });
  const files: FileStat[] = [];
  const walk = async (dir: string, rel: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!excluded(`${relPath}/_`)) await walk(join(dir, entry.name), relPath);
      } else if (entry.isFile() && !excluded(relPath)) {
        const s = await stat(join(dir, entry.name));
        files.push({ path: relPath, size: s.size, mtimeMs: s.mtimeMs });
      }
    }
  };
  await walk(root, '');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export class SnapshotStore {
  constructor(readonly root: string) {}

  async create(workspace: string, options: CreateOptions): Promise<CreatedSnapshot> {
    const files = await scan(workspace, options.exclusions);
    const previous = this.latest(workspace)?.manifest.files ?? {};
    const stats = { filesRead: 0, filesReused: 0 };
    const manifest: Manifest = { createdAt: new Date().toISOString(), exclusions: [...options.exclusions], totalBytes: 0, files: {} };
    let filesDone = 0;
    let bytesDone = 0;
    const report = () => options.onProgress?.({ filesDone, filesTotal: files.length, bytesDone });

    await pool(files, async (file) => {
      const known = previous[file.path];
      if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) {
        // Unchanged since the last snapshot (same size and mtime, like Git's index): reuse without reading.
        manifest.files[file.path] = known;
        stats.filesReused += 1;
      } else {
        const data = await readFile(join(workspace, ...file.path.split('/')));
        const hash = sha256(data);
        await this.storeObject(hash, data);
        manifest.files[file.path] = { hash, size: data.length, mtimeMs: file.mtimeMs };
        stats.filesRead += 1;
      }
      filesDone += 1;
      bytesDone += file.size;
      if (filesDone % PROGRESS_EVERY === 0 && filesDone < files.length) report();
    });
    manifest.totalBytes = bytesDone;
    manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
    report();

    const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    await mkdir(join(this.root, 'manifests'), { recursive: true });
    await writeFile(join(this.root, 'manifests', `${id}.json`), JSON.stringify(manifest));
    await mkdir(join(this.root, 'latest'), { recursive: true });
    await writeFile(this.latestPointer(workspace), id);
    return { id, manifest, stats };
  }

  /** The most recent snapshot of `workspace`, if any. */
  latest(workspace: string): Snapshot | undefined {
    const pointer = this.latestPointer(workspace);
    return existsSync(pointer) ? this.load(readFileSync(pointer, 'utf8').trim()) : undefined;
  }

  private latestPointer(workspace: string): string {
    return join(this.root, 'latest', createHash('sha256').update(resolve(workspace)).digest('hex').slice(0, 32));
  }

  load(id: string): Snapshot {
    const file = join(this.root, 'manifests', `${id}.json`);
    if (!/^[a-z0-9-]+$/.test(id) || !existsSync(file)) throw new Error(`Unknown snapshot ${id}`);
    return { id, manifest: JSON.parse(readFileSync(file, 'utf8')) as Manifest };
  }

  readObject(hash: string): Buffer {
    return readFileSync(this.objectPath(hash));
  }

  objectCount(): number {
    const dir = join(this.root, 'objects');
    return existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0;
  }

  async diff(id: string, workspace: string): Promise<SnapshotChange[]> {
    const { manifest } = this.load(id);
    const current = await scan(workspace, manifest.exclusions);
    const changes: SnapshotChange[] = [];
    const seen = new Set<string>();

    await pool(current, async (file) => {
      seen.add(file.path);
      const before = manifest.files[file.path];
      if (before && before.size === file.size && before.mtimeMs === file.mtimeMs) return;
      const data = await readFile(join(workspace, ...file.path.split('/')));
      if (!before) {
        changes.push({
          path: file.path,
          change: 'A',
          ...(isText(data) ? { patch: createTwoFilesPatch(file.path, file.path, '', data.toString('utf8')) } : {}),
        });
        return;
      }
      if (sha256(data) === before.hash) return;
      const old = this.readObject(before.hash);
      const patch =
        isText(data) && isText(old) ? createTwoFilesPatch(file.path, file.path, old.toString('utf8'), data.toString('utf8')) : undefined;
      changes.push({ path: file.path, change: 'M', ...(patch ? { patch } : {}) });
    });
    for (const path of Object.keys(manifest.files)) if (!seen.has(path)) changes.push({ path, change: 'D' });
    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Returns the workspace to the snapshot state: rewrites modified/deleted files, removes added ones. */
  async restore(id: string, workspace: string): Promise<{ restored: number; removed: number }> {
    const { manifest } = this.load(id);
    const changes = await this.diff(id, workspace);
    let restored = 0;
    let removed = 0;
    const touchedDirs = new Set<string>();
    for (const change of changes) {
      const full = join(workspace, ...change.path.split('/'));
      if (change.change === 'A') {
        await rm(full, { force: true });
        touchedDirs.add(dirname(full));
        removed += 1;
      } else {
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, this.readObject(manifest.files[change.path]!.hash));
        restored += 1;
      }
    }
    await this.removeEmptyDirs(workspace, touchedDirs);
    return { restored, removed };
  }

  /** Restores only `paths` (workspace-relative, POSIX) to their snapshot state: e.g. the files a rejected run changed. */
  async restorePaths(id: string, workspace: string, paths: readonly string[]): Promise<{ restored: number; removed: number }> {
    const { manifest } = this.load(id);
    let restored = 0;
    let removed = 0;
    const touchedDirs = new Set<string>();
    for (const path of paths) {
      const segments = path.split('/');
      if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || segments.some((s) => s === '..' || s === '' || s === '.')) {
        throw new Error(`Invalid path ${path}`);
      }
      const full = join(workspace, ...segments);
      const entry = manifest.files[path];
      if (entry) {
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, this.readObject(entry.hash));
        restored += 1;
      } else if (existsSync(full)) {
        await rm(full, { force: true });
        touchedDirs.add(dirname(full));
        removed += 1;
      }
    }
    await this.removeEmptyDirs(workspace, touchedDirs);
    return { restored, removed };
  }

  private async removeEmptyDirs(workspace: string, dirs: Set<string>): Promise<void> {
    const ordered = [...dirs].sort((a, b) => b.length - a.length);
    for (let dir of ordered) {
      while (dir.startsWith(workspace + sep)) {
        if (!existsSync(dir) || (await readdir(dir)).length > 0) break;
        await rmdir(dir);
        dir = dirname(dir);
      }
    }
  }

  private objectPath(hash: string): string {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`Invalid object hash ${hash}`);
    return join(this.root, 'objects', hash.slice(0, 2), hash.slice(2));
  }

  private async storeObject(hash: string, data: Buffer): Promise<void> {
    const path = this.objectPath(hash);
    if (existsSync(path)) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'EEXIST') throw e;
    });
  }
}
