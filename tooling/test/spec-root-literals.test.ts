// SPDX-License-Identifier: Apache-2.0
// US-078 AC-2 (ADR-024): production code resolves specification paths against the project's specification root — no
// string literal names a path below a hard-coded `spec/` folder except the default in the domain's spec layout.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
// The scripted e2e agent writes a top-level `spec/` file on purpose (RSpec-style folder that must stay writable).
const ALLOWED = new Set(['packages/domain/src/project/spec-layout.ts', 'packages/core/src/test-agent.ts']);
/** A string literal (quote or backtick) that starts with `spec/`. */
const LITERAL = /['"`]spec\//;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

function sourceRoots(): string[] {
  const packages = join(root, 'packages');
  const roots: string[] = [];
  for (const d of readdirSync(packages, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    if (d.name === 'adapters') {
      for (const a of readdirSync(join(packages, 'adapters'), { withFileTypes: true }))
        if (a.isDirectory()) roots.push(join(packages, 'adapters', a.name, 'src'));
    } else roots.push(join(packages, d.name, 'src'));
  }
  return roots.filter((r) => existsSync(r));
}

describe('US-078 AC-2: no hard-coded specification folder', () => {
  it('detects path literals below spec/ and ignores comments and other uses of the word', () => {
    expect(LITERAL.test("const p = 'spec/01_intent/intent.md';")).toBe(true);
    expect(LITERAL.test('const t = `spec/${x}`;')).toBe(true);
    expect(LITERAL.test("type AppliesTo = 'implementation' | 'spec';")).toBe(false);
    expect(LITERAL.test('const t = `${root}/02_requirements`;')).toBe(false);
    expect(COMMENT.test('  /** Folder, e.g. `spec/02_requirements`. */')).toBe(true);
  });

  it('production sources contain no spec/ path literal outside the default of the spec layout', () => {
    const offenders: string[] = [];
    for (const file of sourceRoots().flatMap(sourceFiles)) {
      const rel = relative(root, file).split(sep).join('/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!COMMENT.test(line) && LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
