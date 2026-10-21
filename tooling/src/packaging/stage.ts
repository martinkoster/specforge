// SPDX-License-Identifier: Apache-2.0
// The staged application directory electron-builder packs (US-009): bundled main/core/preload, the renderer and the
// two modules that stay external — better-sqlite3 (native) and the Agent SDK (proprietary, kept as its own module).
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Modules copied into the staged `node_modules` instead of being bundled. */
export const EXTERNAL_MODULES = ['better-sqlite3', '@anthropic-ai/claude-agent-sdk'] as const;
export type ExternalModule = (typeof EXTERNAL_MODULES)[number];

/** Which files of an external module are staged (paths relative to the module, `/`-separated). */
export function keepModuleFile(module: ExternalModule, platform: NodeJS.Platform, arch: string): (file: string) => boolean {
  if (module === 'better-sqlite3') {
    const prebuild = `prebuilds/${platform}-${arch}.node`;
    return (file) => file === 'package.json' || file === 'LICENSE' || file.startsWith('lib/') || file === prebuild;
  }
  // The Agent SDK is self-contained; its optional per-platform packages carry the Claude Code binary (CON-015, ADR-006).
  return (file) => !file.startsWith('node_modules/');
}

export interface RootManifest {
  name: string;
  version: string;
  description: string;
  license: string;
}

/**
 * package.json of the staged app. It is a standalone npm project (outside the pnpm workspace's view) whose only
 * dependencies are the external modules, already copied into its node_modules: electron-builder collects exactly those.
 */
export function stagedManifest(root: RootManifest, modules: Partial<Record<ExternalModule, string>>): Record<string, unknown> {
  return {
    name: root.name,
    productName: 'SpecForge',
    version: root.version,
    description: root.description,
    license: root.license,
    author: { name: 'SpecForge contributors', email: 'specforge@users.noreply.github.com' },
    homepage: 'https://github.com/martinkoster/specforge',
    type: 'module',
    main: 'main.js',
    packageManager: 'npm@11.0.0',
    dependencies: modules,
  };
}

/** Package names of bundled input files (esbuild metafile inputs), for the THIRD_PARTY_NOTICES completeness check. */
export function packagesFromInputs(inputs: string[]): string[] {
  const names = inputs.flatMap((input) => {
    const parts = input.replaceAll('\\', '/').split('/');
    const at = parts.lastIndexOf('node_modules');
    if (at < 0 || at + 1 >= parts.length) return [];
    const first = parts[at + 1]!;
    return first.startsWith('@') ? [`${first}/${parts[at + 2]}`] : [first];
  });
  return [...new Set(names)].sort();
}

const CLAUDE_PACKAGE = /^claude-agent-sdk-/;

/** Directories of the Agent SDK's per-platform Claude Code packages anywhere below `dir` (relative paths). */
export function findClaudeCodeBinaries(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(current, entry.name);
      if (CLAUDE_PACKAGE.test(entry.name)) found.push(relative(dir, full));
      else walk(full);
    }
  };
  walk(dir);
  return found.sort();
}
