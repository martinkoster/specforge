// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CMD_TARGET = /"%dp0%\\([^"]+)"/;

/**
 * Resolves the path of a user-installed Claude Code to the real executable.
 * npm installs on Windows put a `.cmd` shim next to the given path that launches
 * `node_modules\@anthropic-ai\claude-code\bin\claude.exe`; POSIX installs use symlinks.
 */
export function resolveClaudeExecutable(path: string): string {
  const cmd = path.toLowerCase().endsWith('.cmd') ? path : `${path}.cmd`;
  if (existsSync(cmd)) {
    const match = CMD_TARGET.exec(readFileSync(cmd, 'utf8'));
    if (match?.[1]) {
      const target = join(dirname(cmd), ...match[1].split('\\'));
      if (existsSync(target)) return target;
    }
  }
  if (existsSync(path) && statSync(path).isFile()) return realpathSync(path);
  throw new Error(`Claude Code executable not found at ${path}`);
}

/** Finds `claude` on the PATH (first match), as the setup wizard's auto-detection would. */
export function findClaudeOnPath(): string {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const out = execFileSync(finder, ['claude'], { encoding: 'utf8' });
  const first = out.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!first) throw new Error('Claude Code executable not found on PATH');
  return first.trim().replace(/\.cmd$/i, '');
}
