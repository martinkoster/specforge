// SPDX-License-Identifier: Apache-2.0
// US-031 AC-3 / CON-004: SpecForge never calls model APIs itself — no package depends on a model-API SDK; only the
// Claude Code adapter uses the Agent SDK, which drives the user's Claude Code process.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const MODEL_API_SDKS = ['@anthropic-ai/sdk', 'openai', '@google/generative-ai', '@aws-sdk/client-bedrock-runtime', '@azure/openai'];

function packageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (existsSync(join(full, 'package.json'))) found.push(join(full, 'package.json'));
    found.push(...packageFiles(full));
  }
  return found;
}

describe('CON-004: no model-API calls by SpecForge', () => {
  it('no workspace package depends on a model-API SDK; the Agent SDK only in the Claude Code adapter', () => {
    const offenders: string[] = [];
    for (const file of [join(root, 'package.json'), ...packageFiles(join(root, 'packages'))]) {
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      for (const dep of deps) {
        if (MODEL_API_SDKS.includes(dep)) offenders.push(`${pkg.name}: ${dep}`);
        if (dep === '@anthropic-ai/claude-agent-sdk' && pkg.name !== '@specforge/agent-claude-code') offenders.push(`${pkg.name}: ${dep}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
