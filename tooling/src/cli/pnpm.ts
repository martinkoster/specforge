// SPDX-License-Identifier: Apache-2.0
// Runs pnpm from a pnpm script without a shell: npm_execpath points to the running pnpm (JS entry or native binary).
import { execFileSync } from 'node:child_process';

export function runPnpm(args: string[]): string {
  const pnpmEntry = process.env.npm_execpath;
  const options = { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
  if (!pnpmEntry) return execFileSync('pnpm', args, options);
  return /\.c?js$/.test(pnpmEntry) ? execFileSync(process.execPath, [pnpmEntry, ...args], options) : execFileSync(pnpmEntry, args, options);
}
