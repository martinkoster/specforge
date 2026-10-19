// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClaudeExecutable } from '../src/executable.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 's1-exe-'));
}

describe('US-001 AC-1 (support): resolve the real Claude Code executable', () => {
  it('follows an npm .cmd shim to the native claude.exe it launches', () => {
    const dir = tempDir();
    const target = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'claude.exe'), 'binary');
    writeFileSync(
      join(dir, 'claude.cmd'),
      '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n',
    );

    expect(resolveClaudeExecutable(join(dir, 'claude'))).toBe(join(target, 'claude.exe'));
  });

  it('returns a native executable path unchanged', () => {
    const dir = tempDir();
    const exe = join(dir, 'claude.exe');
    writeFileSync(exe, 'binary');

    expect(resolveClaudeExecutable(exe)).toBe(exe);
  });

  it.skipIf(process.platform === 'win32')('resolves symlinks to their real target (POSIX installs)', () => {
    const dir = tempDir();
    const real = join(dir, 'real-claude');
    writeFileSync(real, 'binary');
    const link = join(dir, 'claude');
    symlinkSync(real, link);

    expect(resolveClaudeExecutable(link)).toBe(real);
  });

  it('throws a clear error when nothing usable exists at the path', () => {
    const dir = tempDir();

    expect(() => resolveClaudeExecutable(join(dir, 'missing'))).toThrow(/Claude Code executable not found/);
  });
});
