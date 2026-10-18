// SPDX-License-Identifier: Apache-2.0
// Workspace file access for the indexer (ADR-004): scans only the main workspace, writes atomically with optimistic concurrency.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ArtifactConflictError, type ArtifactFiles } from '@specforge/application';

export function contentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The file changed since it was read (optimistic concurrency); recognised by the application as a conflict. */
export class ContentConflictError extends ArtifactConflictError {
  constructor(path: string) {
    super(path);
    this.name = 'ContentConflictError';
  }
}

export interface WorkspaceFilesOptions {
  /** Top-level folders containing artifacts. */
  artifactRoots?: string[];
  /** Absolute directories never to scan (e.g. a worktree root configured inside the workspace). */
  ignore?: string[];
  /** Called for every write just before the file is replaced, e.g. to register self-writes for the watcher. */
  onWrite?(path: string, hash: string): void;
}

const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage']);

const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Renames, retrying while the target is briefly held open by another process (Windows: virus scanners, indexers and
 * file watchers make `rename` fail with EPERM/EACCES/EBUSY for a moment).
 */
export async function renameWithRetry(
  from: string,
  to: string,
  options: { rename?: (from: string, to: string) => Promise<void>; attempts?: number; delayMs?: number } = {},
): Promise<void> {
  const doRename = options.rename ?? rename;
  const attempts = options.attempts ?? 10;
  for (let attempt = 1; ; attempt++) {
    try {
      return await doRename(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= attempts || !code || !LOCKED.has(code)) throw e;
      await new Promise((r) => setTimeout(r, (options.delayMs ?? 50) * attempt));
    }
  }
}

export class WorkspaceFiles implements ArtifactFiles {
  private readonly root: string;
  private readonly roots: string[];
  private readonly ignore: string[];
  private readonly onWrite: ((path: string, hash: string) => void) | undefined;

  constructor(root: string, options: WorkspaceFilesOptions = {}) {
    this.onWrite = options.onWrite;
    this.root = resolve(root);
    this.roots = options.artifactRoots ?? ['spec', '.specforge'];
    this.ignore = (options.ignore ?? []).map((p) => resolve(p));
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    for (const top of this.roots) {
      const dir = join(this.root, top);
      if (existsSync(dir)) await this.walk(dir, found);
    }
    return found.sort();
  }

  async read(path: string): Promise<{ content: string; hash: string } | undefined> {
    const full = this.resolveInside(path);
    if (!existsSync(full)) return undefined;
    const content = await readFile(full, 'utf8');
    return { content, hash: contentHash(content) };
  }

  /**
   * Writes `content` atomically (temp file + rename). `expectedHash` is the hash of the content the caller
   * based its change on (`null` = file must not exist); a mismatch raises ContentConflictError.
   */
  async writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string> {
    const full = this.resolveInside(path);
    const current = existsSync(full) ? contentHash(await readFile(full)) : null;
    if (current !== options.expectedHash) throw new ContentConflictError(path);
    await mkdir(dirname(full), { recursive: true });
    const temp = join(dirname(full), `.${basename(full)}.${randomBytes(6).toString('hex')}.tmp`);
    const hash = contentHash(content);
    // Register before the rename: the watcher may report the change before this call returns.
    this.onWrite?.(path, hash);
    await writeFile(temp, content);
    try {
      await renameWithRetry(temp, full);
    } catch (e) {
      await rm(temp, { force: true });
      throw e;
    }
    return hash;
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolveInside(path), { force: true });
  }

  private resolveInside(path: string): string {
    const full = resolve(this.root, path);
    if (!full.startsWith(this.root + sep)) throw new Error(`${path} is outside the workspace`);
    return full;
  }

  private async walk(dir: string, found: string[]): Promise<void> {
    if (this.ignore.includes(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    // A directory containing `.git` (file or folder) is a nested repository or a git worktree: not part of this workspace.
    if (dir !== this.root && entries.some((e) => e.name === '.git')) return;
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) await this.walk(full, found);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(relative(this.root, full).split(sep).join('/'));
      }
    }
  }
}

export * from './watcher.js';
export * from './project-folders.js';
