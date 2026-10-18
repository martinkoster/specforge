// SPDX-License-Identifier: Apache-2.0
// Detection and verification of a user-installed Claude Code (FR-048, CON-002; findings of spike S1).
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

/** Required minimum Claude Code version (validated with 2.1.299 in spike S1); configurable per call. */
export const DEFAULT_MIN_VERSION = '2.1.0';

export interface RuntimeEnvironment {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homedir: string;
  isFile(path: string): boolean;
  readFile(path: string): string | undefined;
  realpath(path: string): string;
  run(executable: string, args: string[]): Promise<{ code: number; stdout: string }>;
}

export type DetectResult =
  { found: true; path: string; version: string; source: 'path' | 'location' } | { found: false; searched: string[] };

export type VerifyError = 'not_found' | 'not_runnable' | 'not_claude_code' | 'too_old';
export type VerifyResult = { ok: true; path: string; version: string } | { ok: false; error: VerifyError; message: string };

export function systemEnvironment(): RuntimeEnvironment {
  return {
    platform: process.platform,
    env: process.env,
    homedir: homedir(),
    isFile: (p) => existsSync(p) && statSync(p).isFile(),
    readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : undefined),
    realpath: (p) => realpathSync(p),
    run: (executable, args) =>
      new Promise((resolve) => {
        execFile(executable, args, { timeout: 15_000, windowsHide: true }, (error, stdout) => {
          resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout });
        });
      }),
  };
}

const pathApi = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix);

export function parseClaudeVersion(output: string): string | undefined {
  return /^(\d+\.\d+\.\d+)\s+\(Claude Code\)/m.exec(output.trim())?.[1];
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Per-OS install locations of the native installer and npm, checked after the PATH. */
export function candidateLocations(env: RuntimeEnvironment): string[] {
  const { join } = pathApi(env.platform);
  const home = env.homedir;
  if (env.platform === 'win32') {
    const appData = env.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return [join(home, '.local', 'bin', 'claude.exe'), join(appData, 'npm', 'claude.cmd')];
  }
  const shared = [join(home, '.local', 'bin', 'claude'), join(home, '.claude', 'local', 'claude')];
  const system =
    env.platform === 'darwin' ? ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'] : ['/usr/local/bin/claude', '/usr/bin/claude'];
  return [...shared, ...system, join(home, '.npm-global', 'bin', 'claude')];
}

function pathCandidates(env: RuntimeEnvironment): string[] {
  const api = pathApi(env.platform);
  const entries = (env.env.PATH ?? env.env.Path ?? '').split(api.delimiter).filter(Boolean);
  const names = env.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  return entries.flatMap((dir) => names.map((name) => api.join(dir, name)));
}

/** npm on Windows installs a `.cmd` shim that launches `node_modules\@anthropic-ai\claude-code\bin\claude.exe`. */
function resolveExecutable(path: string, env: RuntimeEnvironment): string | undefined {
  if (path.toLowerCase().endsWith('.cmd')) {
    const target = /"%dp0%\\([^"]+)"/.exec(env.readFile(path) ?? '')?.[1];
    if (!target) return undefined;
    const api = pathApi(env.platform);
    const resolved = api.join(api.dirname(path), ...target.split('\\'));
    return env.isFile(resolved) ? resolved : undefined;
  }
  return env.realpath(path);
}

export async function verifyClaudeCode(
  path: string,
  env: RuntimeEnvironment,
  options: { minVersion?: string } = {},
): Promise<VerifyResult> {
  const minVersion = options.minVersion ?? DEFAULT_MIN_VERSION;
  if (!env.isFile(path)) return { ok: false, error: 'not_found', message: `No file at ${path}.` };
  const executable = resolveExecutable(path, env);
  if (!executable) return { ok: false, error: 'not_runnable', message: `${path} could not be resolved to a Claude Code executable.` };
  const { code, stdout } = await env.run(executable, ['--version']);
  if (code !== 0) return { ok: false, error: 'not_runnable', message: `${path} could not be started (exit code ${code}).` };
  const version = parseClaudeVersion(stdout);
  if (!version)
    return { ok: false, error: 'not_claude_code', message: `${path} does not report a Claude Code version ("${stdout.trim()}").` };
  if (compareVersions(version, minVersion) < 0) {
    return {
      ok: false,
      error: 'too_old',
      message: `Claude Code ${version} is older than the required ${minVersion}. Please update Claude Code.`,
    };
  }
  return { ok: true, path: executable, version };
}

export async function detectClaudeCode(env: RuntimeEnvironment, options: { minVersion?: string } = {}): Promise<DetectResult> {
  const searched: string[] = [];
  const sources: Array<[string[], 'path' | 'location']> = [
    [pathCandidates(env), 'path'],
    [candidateLocations(env), 'location'],
  ];
  for (const [candidates, source] of sources) {
    for (const candidate of candidates) {
      searched.push(candidate);
      if (!env.isFile(candidate)) continue;
      const result = await verifyClaudeCode(candidate, env, options);
      if (result.ok) return { found: true, path: result.path, version: result.version, source };
    }
  }
  return { found: false, searched };
}
