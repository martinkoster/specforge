// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { classifyLicense, evaluateLicenses, parsePnpmLicenses } from '../src/licenses.js';

const ROOT = join(__dirname, '..', '..');
const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')) as {
  on: Record<string, unknown>;
  jobs: Record<string, { 'runs-on': string; strategy?: { matrix: { os: string[] } }; steps: Array<{ run?: string; uses?: string }> }>;
};
const runs = (job: string) => workflow.jobs[job]!.steps.map((s) => s.run ?? '').join('\n');

describe('US-008 AC-1: CI matrix on Windows, macOS and Linux runs lint, typecheck and tests', () => {
  it('triggers on pushes and pull requests', () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
  });

  it('runs the build job on all three operating systems', () => {
    expect(workflow.jobs.build!.strategy!.matrix.os).toEqual(['windows-latest', 'macos-latest', 'ubuntu-latest']);
  });

  it('installs with the frozen lockfile and runs lint, typecheck/build and tests', () => {
    const steps = runs('build');
    expect(steps).toMatch(/pnpm install --frozen-lockfile/);
    expect(steps).toMatch(/pnpm lint/);
    expect(steps).toMatch(/pnpm build/);
    expect(steps).toMatch(/pnpm coverage/);
    expect(steps).toMatch(/pnpm check:spdx/);
    expect(steps).toMatch(/pnpm test:perf/);
  });

  it('provides a virtual display for the Electron end-to-end tests on Linux', () => {
    expect(runs('build')).toMatch(/xvfb-run/);
  });
});

describe('US-008 AC-2: coverage thresholds fail the build', () => {
  it('runs tests with coverage, whose thresholds are 75 % overall and 90 % for the domain', () => {
    expect(runs('build')).toMatch(/pnpm coverage/);
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    expect(config).toMatch(/lines: 75,\s*statements: 75,\s*functions: 75,\s*branches: 75/);
    expect(config).toMatch(/'packages\/domain\/src\/\*\*': \{ lines: 90, statements: 90, functions: 90, branches: 90 \}/);
  });
});

describe('US-008 AC-3: license scan', () => {
  it.each([
    ['MIT', 'allowed'],
    ['Apache-2.0', 'allowed'],
    ['BSD-3-Clause', 'allowed'],
    ['ISC', 'allowed'],
    ['(MIT OR GPL-3.0)', 'allowed'],
    ['GPL-3.0-only', 'forbidden'],
    ['AGPL-3.0', 'forbidden'],
    ['LGPL-2.1', 'review'],
    ['MPL-2.0', 'review'],
    ['EPL-2.0', 'review'],
    ['(MIT AND EPL-2.0)', 'review'],
    ['(Apache-2.0 AND GPL-2.0)', 'forbidden'],
    ['SEE LICENSE IN LICENSE.md', 'review'],
    ['UNLICENSED', 'review'],
    ['Unknown', 'forbidden'],
    ['', 'forbidden'],
  ])('classifies %s as %s', (license, expected) => {
    expect(classifyLicense(license)).toBe(expected);
  });

  it('parses pnpm licenses JSON and fails on forbidden licenses while listing review items', () => {
    const json = JSON.stringify({
      MIT: [{ name: 'a', versions: ['1.0.0'], license: 'MIT' }],
      'GPL-3.0': [{ name: 'b', versions: ['2.0.0'], license: 'GPL-3.0' }],
      'EPL-2.0': [{ name: 'c', versions: ['3.0.0'], license: 'EPL-2.0' }],
    });

    const report = evaluateLicenses(parsePnpmLicenses(json));

    expect(report.ok).toBe(false);
    expect(report.forbidden).toEqual([{ name: 'b', version: '2.0.0', license: 'GPL-3.0' }]);
    expect(report.review).toEqual([{ name: 'c', version: '3.0.0', license: 'EPL-2.0' }]);
  });

  it('runs the license check in CI', () => {
    expect(runs('supply-chain')).toMatch(/pnpm check:licenses/);
  });

  it('passes for the current production dependencies', () => {
    expect(() =>
      execFileSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', 'check:licenses'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }),
    ).not.toThrow();
  }, 120_000);
});

describe('US-008 AC-4: dependency audit in CI', () => {
  it('fails on high/critical vulnerabilities in production dependencies', () => {
    expect(runs('supply-chain')).toMatch(/pnpm audit:deps/);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(manifest.scripts['audit:deps']).toMatch(/audit --prod --audit-level high/);
  });
});

describe('US-008 AC-5: README with pipeline badge and instructions', () => {
  it('shows the CI badge and how to build, lint and test', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toMatch(/\[!\[CI\]\(.*actions\/workflows\/ci\.yml\/badge\.svg\)\]/);
    for (const cmd of ['pnpm install', 'pnpm build', 'pnpm lint', 'pnpm test', 'pnpm coverage']) expect(readme).toContain(cmd);
  });
});
