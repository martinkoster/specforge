// SPDX-License-Identifier: Apache-2.0
// Log retention (US-015 AC-3, FR-052): run logs older than the configured number of days are removed at startup.
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Removes entries of `logsDir` whose modification time is older than `days`; returns the removed names. */
export function pruneLogs(logsDir: string, days: number, now: Date): string[] {
  let entries: string[];
  try {
    entries = readdirSync(logsDir);
  } catch {
    return [];
  }
  const cutoff = now.getTime() - days * 86_400_000;
  const removed: string[] = [];
  for (const name of entries.sort()) {
    const path = join(logsDir, name);
    if (statSync(path).mtimeMs < cutoff) {
      rmSync(path, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
