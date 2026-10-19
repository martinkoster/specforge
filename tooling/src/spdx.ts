// SPDX-License-Identifier: Apache-2.0
// Ensures every source file carries the Apache-2.0 SPDX header (CON-015).
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

export const SPDX_HEADER = 'SPDX-License-Identifier: Apache-2.0';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', 'out', 'build', '.git']);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* sourceFiles(path);
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      yield path;
    }
  }
}

/** Returns all source files below `roots` whose first five lines do not contain the SPDX header. */
export function findMissingSpdx(roots: string[]): string[] {
  const missing: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const head = readFileSync(file, 'utf8').split('\n', 5).join('\n');
      if (!head.includes(SPDX_HEADER)) missing.push(file);
    }
  }
  return missing;
}
