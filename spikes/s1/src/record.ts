// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

export function resultsFile(platform: string = process.platform): string {
  return join(RESULTS_DIR, `live-${platform}.json`);
}

/** Merges one scenario outcome into results/live-<platform>.json (evidence for the spike report). */
export function recordResult(key: string, data: unknown, file: string = resultsFile()): void {
  mkdirSync(dirname(file), { recursive: true });
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  current[key] = { ...(data as object), recordedAt: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
}
