// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Resolves workspace packages (`@specforge/*`) to their sources so tests never depend on a prior build. */
export function workspaceAliases(root: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const dir of [join(root, 'packages'), join(root, 'packages', 'adapters')]) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const manifest = join(dir, entry.name, 'package.json');
      const source = join(dir, entry.name, 'src', 'index.ts');
      if (entry.isDirectory() && existsSync(manifest) && existsSync(source)) {
        aliases[(JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name] = source;
      }
    }
  }
  return aliases;
}
