// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_VERSION,
  candidateLocations,
  compareVersions,
  detectClaudeCode,
  parseClaudeVersion,
  systemEnvironment,
  verifyClaudeCode,
  type RuntimeEnvironment,
} from '../src/index.js';

function fakeEnv(opts: {
  platform: NodeJS.Platform;
  files?: Record<string, string>;
  env?: Record<string, string>;
  home?: string;
  versions?: Record<string, { code: number; stdout: string }>;
}): RuntimeEnvironment {
  const files = opts.files ?? {};
  return {
    platform: opts.platform,
    env: opts.env ?? {},
    homedir: opts.home ?? (opts.platform === 'win32' ? 'C:\\Users\\u' : '/home/u'),
    isFile: (p) => p in files,
    readFile: (p) => files[p],
    realpath: (p) => p,
    run: async (exe) => opts.versions?.[exe] ?? { code: 1, stdout: '' },
  };
}

describe('US-010 AC-1: detection via PATH and per-OS install locations', () => {
  it('lists per-OS install locations', () => {
    expect(candidateLocations(fakeEnv({ platform: 'win32', env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' } }))).toEqual([
      win32.join('C:\\Users\\u', '.local', 'bin', 'claude.exe'),
      win32.join('C:\\Users\\u\\AppData\\Roaming', 'npm', 'claude.cmd'),
    ]);
    expect(candidateLocations(fakeEnv({ platform: 'darwin', home: '/Users/u' }))).toEqual([
      posix.join('/Users/u', '.local', 'bin', 'claude'),
      posix.join('/Users/u', '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      posix.join('/Users/u', '.npm-global', 'bin', 'claude'),
    ]);
    expect(candidateLocations(fakeEnv({ platform: 'linux' }))).toEqual([
      posix.join('/home/u', '.local', 'bin', 'claude'),
      posix.join('/home/u', '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      posix.join('/home/u', '.npm-global', 'bin', 'claude'),
    ]);
  });

  it('finds claude on the PATH first and returns path and version', async () => {
    const env = fakeEnv({
      platform: 'linux',
      env: { PATH: '/opt/tools:/usr/local/bin' },
      files: { '/usr/local/bin/claude': 'bin', [posix.join('/home/u', '.local', 'bin', 'claude')]: 'bin' },
      versions: { '/usr/local/bin/claude': { code: 0, stdout: '2.1.299 (Claude Code)\n' } },
    });

    await expect(detectClaudeCode(env)).resolves.toEqual({
      found: true,
      path: '/usr/local/bin/claude',
      version: '2.1.299',
      source: 'path',
    });
  });

  it('falls back to install locations and resolves npm .cmd shims on Windows', async () => {
    const npm = win32.join('C:\\Users\\u\\AppData\\Roaming', 'npm');
    const exe = win32.join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    const env = fakeEnv({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', Path: 'C:\\Windows' },
      files: {
        [win32.join(npm, 'claude.cmd')]: '@ECHO off\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n',
        [exe]: 'binary',
      },
      versions: { [exe]: { code: 0, stdout: '2.1.299 (Claude Code)' } },
    });

    await expect(detectClaudeCode(env)).resolves.toEqual({ found: true, path: exe, version: '2.1.299', source: 'location' });
  });

  it('reports where it searched when nothing is found', async () => {
    const result = await detectClaudeCode(fakeEnv({ platform: 'linux', env: { PATH: '/bin' } }));

    expect(result.found).toBe(false);
    if (!result.found) expect(result.searched).toEqual(expect.arrayContaining(['/bin/claude', '/usr/local/bin/claude']));
  });

  it('works against the real system (finds an installed Claude Code or reports the search)', async () => {
    const result = await detectClaudeCode(systemEnvironment());
    if (result.found) expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    else expect(result.searched.length).toBeGreaterThan(0);
  }, 30_000);
});

describe('US-010 AC-2: verification of a manually entered path', () => {
  const ok = { code: 0, stdout: '2.1.299 (Claude Code)' };

  it('accepts an executable reporting a sufficient Claude Code version', async () => {
    const env = fakeEnv({ platform: 'linux', files: { '/x/claude': 'bin' }, versions: { '/x/claude': ok } });

    await expect(verifyClaudeCode('/x/claude', env)).resolves.toEqual({ ok: true, path: '/x/claude', version: '2.1.299' });
  });

  it.each([
    ['a missing file', {}, {}, 'not_found', 'No file at /x/claude.'],
    [
      'an executable that fails to run',
      { '/x/claude': 'bin' },
      { '/x/claude': { code: 1, stdout: '' } },
      'not_runnable',
      '/x/claude could not be started (exit code 1).',
    ],
    [
      'an executable that is not Claude Code',
      { '/x/claude': 'bin' },
      { '/x/claude': { code: 0, stdout: 'Python 3.12.1' } },
      'not_claude_code',
      '/x/claude does not report a Claude Code version ("Python 3.12.1").',
    ],
    [
      'a too old version',
      { '/x/claude': 'bin' },
      { '/x/claude': { code: 0, stdout: '1.0.3 (Claude Code)' } },
      'too_old',
      `Claude Code 1.0.3 is older than the required ${DEFAULT_MIN_VERSION}. Please update Claude Code.`,
    ],
  ])('rejects %s with a specific error', async (_name, files, versions, error, message) => {
    const env = fakeEnv({ platform: 'linux', files, versions });

    await expect(verifyClaudeCode('/x/claude', env)).resolves.toEqual({ ok: false, error, message });
  });

  it('honours a configured minimum version', async () => {
    const env = fakeEnv({ platform: 'linux', files: { '/x/claude': 'bin' }, versions: { '/x/claude': ok } });

    await expect(verifyClaudeCode('/x/claude', env, { minVersion: '3.0.0' })).resolves.toMatchObject({ ok: false, error: 'too_old' });
  });

  it('parses and compares versions', () => {
    expect(parseClaudeVersion('2.1.299 (Claude Code)')).toBe('2.1.299');
    expect(parseClaudeVersion('claude 2.0')).toBeUndefined();
    expect(compareVersions('2.1.10', '2.1.9')).toBeGreaterThan(0);
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0);
    expect(compareVersions('1.9.9', '2.0.0')).toBeLessThan(0);
  });

  it('runs a real executable through the system environment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-claude-'));
    mkdirSync(dir, { recursive: true });
    const script = join(dir, 'fake-claude.mjs');
    writeFileSync(script, "console.log('2.1.300 (Claude Code)');\n");
    const env = systemEnvironment();

    const result = await env.run(process.execPath, [script]);

    expect(result).toEqual({ code: 0, stdout: '2.1.300 (Claude Code)\n' });
  });
});
