// SPDX-License-Identifier: Apache-2.0
// Thin Git CLI wrapper: argument arrays only (never a shell, NFR-011), long paths enabled for Windows.
import { execFile } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly code: number,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`);
    this.name = 'GitError';
  }
}

export type GitVersion = [number, number, number];

export function parseGitVersion(output: string): GitVersion {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
  if (!match) throw new Error(`Cannot parse git version from "${output.trim()}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export class GitClient {
  constructor(private readonly executable = 'git') {}

  raw(cwd: string, args: readonly string[]): Promise<GitResult> {
    return new Promise((resolve) => {
      execFile(this.executable, ['-c', 'core.longpaths=true', ...args], { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
        resolve({ code, stdout: stdout.trim(), stderr });
      });
    });
  }

  /** File content at a revision, untouched (no trimming); undefined if the file does not exist there. */
  blob(cwd: string, rev: string, path: string): Promise<Buffer | undefined> {
    return new Promise((resolve) => {
      execFile(
        this.executable,
        ['-c', 'core.longpaths=true', 'show', `${rev}:${path}`],
        { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
        (error, stdout) => resolve(error ? undefined : stdout),
      );
    });
  }

  async run(cwd: string, args: readonly string[]): Promise<string> {
    const result = await this.raw(cwd, args);
    if (result.code !== 0) throw new GitError(args, result.code, result.stderr);
    return result.stdout;
  }

  /** Runs a command whose exit code 1 means "false" (e.g. show-ref, merge-base --is-ancestor). */
  async test(cwd: string, args: readonly string[]): Promise<boolean> {
    const result = await this.raw(cwd, args);
    if (result.code === 0) return true;
    if (result.code === 1) return false;
    throw new GitError(args, result.code, result.stderr);
  }

  async version(): Promise<GitVersion> {
    return parseGitVersion(await this.run(process.cwd(), ['--version']));
  }
}
