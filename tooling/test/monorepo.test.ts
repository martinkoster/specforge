// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLayering } from '../src/layering.js';
import { findMissingSpdx } from '../src/spdx.js';

const ROOT = join(__dirname, '..', '..');
const PACKAGES = ['domain', 'application', 'ipc-contract', 'adapters/agent-mock', 'core', 'main', 'ui'];

function pnpm(...args: string[]): string {
  return execFileSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

describe('US-004 AC-1: pnpm workspace with the agreed packages builds', () => {
  it('declares every package in the workspace with an @specforge scope', () => {
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/packages\/\*/);
    expect(workspace).toMatch(/packages\/adapters\/\*/);
    for (const pkg of PACKAGES) {
      const manifest = JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8'));
      expect(manifest.name).toBe(`@specforge/${pkg.split('/').pop()}`);
      expect(manifest.license).toBe('Apache-2.0');
    }
  });

  it('builds all packages with `pnpm build`', () => {
    pnpm('build');
    for (const pkg of PACKAGES) expect(existsSync(join(ROOT, 'packages', pkg, 'dist', 'index.js'))).toBe(true);
  }, 300_000);
});

describe('US-004 AC-2: strict TypeScript, ESLint/Prettier via `pnpm lint`, Vitest with coverage', () => {
  it('rejects implicit any under the shared strict compiler options', () => {
    const dir = mkdtempSync(join(tmpdir(), 'us004-ts-'));
    writeFileSync(join(dir, 'a.ts'), 'export function f(x) { return x; }\n');
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ extends: join(ROOT, 'tsconfig.base.json'), include: ['a.ts'], compilerOptions: { noEmit: true } }),
    );

    let output = '';
    try {
      execFileSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', dir], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout);
    }
    expect(output).toMatch(/TS7006: Parameter 'x' implicitly has an 'any' type/);
  });

  it('`pnpm lint` passes on the repository', () => {
    expect(() => pnpm('lint')).not.toThrow();
  }, 300_000);

  it('the ESLint configuration reports errors in a bad file', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: ROOT });
    const code = [
      '// SPDX-License-Identifier: Apache-2.0',
      'export function bad(x: any) {',
      '  const unused = 1;',
      '  return x;',
      '}',
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, { filePath: join(ROOT, 'packages', 'domain', 'src', 'lint-probe.ts') });

    const rules = result!.messages.map((m) => m.ruleId);
    expect(rules).toContain('@typescript-eslint/no-explicit-any');
    expect(rules).toContain('@typescript-eslint/no-unused-vars');
  });

  it('configures Vitest coverage with the v8 provider and thresholds', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    expect(config).toMatch(/provider: 'v8'/);
    expect(config).toMatch(/thresholds/);
  });
});

describe('US-004 AC-3: dependency-cruiser enforces the layering', () => {
  it('reports domain → application and application → adapter imports', async () => {
    const violations = await checkLayering([join(__dirname, 'fixtures', 'layering', 'packages')]);

    const names = violations.map((v) => v.rule).sort();
    expect(names).toEqual(['agent-sdk-only-in-claude-adapter', 'application-not-to-adapters-or-ui', 'domain-is-pure']);
  });

  it('US-044 AC-4: allows the Claude Agent SDK only inside the Claude Code adapter package', async () => {
    const violations = await checkLayering([join(__dirname, 'fixtures', 'layering', 'packages')]);

    const vendor = violations.filter((v) => v.rule === 'agent-sdk-only-in-claude-adapter');
    expect(vendor).toHaveLength(1);
    expect(vendor[0]!.from).toMatch(/packages\/core\/src\/claude\.ts$/);
  });

  it('finds no violations in the real packages', async () => {
    await expect(checkLayering([join(ROOT, 'packages')])).resolves.toEqual([]);
  });
});

describe('US-004 AC-4: SPDX header check', () => {
  it('lists source files without the Apache-2.0 SPDX header and ignores generated folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'us004-spdx-'));
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'src', 'ok.ts'), '// SPDX-License-Identifier: Apache-2.0\nexport {};\n');
    writeFileSync(join(dir, 'src', 'missing.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', 'missing.tsx'), 'export {};\n');
    writeFileSync(join(dir, 'node_modules', 'x.js'), 'x');
    writeFileSync(join(dir, 'dist', 'y.js'), 'y');
    writeFileSync(join(dir, 'src', 'notes.md'), 'no header needed');

    expect(
      findMissingSpdx([dir])
        .map((f) => f.slice(dir.length + 1).replace(/\\/g, '/'))
        .sort(),
    ).toEqual(['src/missing.ts', 'src/missing.tsx']);
  });

  it('`pnpm check:spdx` passes on the repository', () => {
    expect(() => pnpm('check:spdx')).not.toThrow();
  }, 120_000);
});
