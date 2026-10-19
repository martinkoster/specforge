// SPDX-License-Identifier: Apache-2.0
// Watches the main workspace's artifacts and reports debounced batches of changed paths (FR-018, FR-116a).
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { watch } from 'chokidar';

export interface WatchOptions {
  debounceMs?: number;
  artifactRoots?: string[];
  /** Absolute directories never to watch (e.g. a worktree root inside the workspace). */
  ignore?: string[];
}

export interface WorkspaceWatcher {
  close(): Promise<void>;
}

const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage']);

export async function watchWorkspace(root: string, options: WatchOptions, onChange: (paths: string[]) => void): Promise<WorkspaceWatcher> {
  // Expand Windows 8.3 short names (e.g. JOHNDO~1): libuv's fs-event watcher asserts when reported
  // file names do not share the spelling of the watched directory.
  const base = realpathSync.native(resolve(root));
  const roots = options.artifactRoots ?? ['spec', '.specforge'];
  const ignoreDirs = (options.ignore ?? []).map((p) => (existsSync(p) ? realpathSync.native(resolve(p)) : resolve(p)));
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ignored = (path: string, stats?: { isDirectory(): boolean; isFile(): boolean }): boolean => {
    const full = resolve(path);
    if (full === base) return false;
    if (ignoreDirs.some((d) => full === d || full.startsWith(d + sep))) return true;
    const parts = relative(base, full).split(sep);
    if (!roots.includes(parts[0]!)) return true;
    if (parts.some((p) => SKIPPED.has(p))) return true;
    if (stats?.isDirectory() && parts.length > 1 && existsSync(join(full, '.git'))) return true; // nested repository / worktree
    if (stats?.isFile() && !full.endsWith('.md')) return true;
    return false;
  };

  const record = (path: string) => {
    if (!path.endsWith('.md')) return;
    pending.add(relative(base, resolve(path)).split(sep).join('/'));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = [...pending].sort();
      pending.clear();
      onChange(batch);
    }, options.debounceMs ?? 200);
  };

  const watcher = watch(base, { ignored, ignoreInitial: true, awaitWriteFinish: false });
  watcher.on('add', record).on('change', record).on('unlink', record);
  await new Promise<void>((ready) => watcher.once('ready', ready));
  return {
    close: async () => {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}
