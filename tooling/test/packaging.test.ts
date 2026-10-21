// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parsePnpmLicenses } from '../src/licenses.js';
import { builderConfig, packagedExecutable, unpackedExecutable } from '../src/packaging/builder-config.js';
import { findClaudeCodeBinaries, keepModuleFile, packagesFromInputs, stagedManifest } from '../src/packaging/stage.js';
import { missingNotices, noticeEntries, readLicenseText, renderThirdPartyNotices } from '../src/packaging/notices.js';

const ROOT = join(__dirname, '..', '..');
const config = builderConfig({ outDir: '/release', resourcesDir: '/resources', electronVersion: '44.7.1' });

describe('US-009 AC-1: electron-builder produces per-OS installers in CI', () => {
  it('builds a per-user NSIS installer on Windows that never asks for elevation', () => {
    expect(config.win).toMatchObject({ target: [{ target: 'nsis', arch: ['x64'] }] });
    expect(config.nsis).toMatchObject({ oneClick: false, perMachine: false, allowElevation: false });
  });

  it('builds a dmg on macOS and AppImage + deb on Linux', () => {
    expect(config.mac).toMatchObject({ target: [{ target: 'dmg' }] });
    expect(config.linux).toMatchObject({ target: [{ target: 'AppImage' }, { target: 'deb' }] });
  });

  it('packages the staged app as an asar with the native SQLite module unpacked', () => {
    expect(config.directories).toEqual({ output: '/release' });
    expect(config.electronVersion).toBe('44.7.1');
    expect(config.asar).toBe(true);
    expect(config.asarUnpack).toEqual(['node_modules/better-sqlite3/**']);
    expect(config.npmRebuild).toBe(false);
  });

  it('locates the packed executable for applying the fuses', () => {
    expect(packagedExecutable('/out', 'win32', 'SpecForge')).toBe(join('/out', 'SpecForge.exe'));
    expect(packagedExecutable('/out', 'darwin', 'SpecForge')).toBe(join('/out', 'SpecForge.app', 'Contents', 'MacOS', 'SpecForge'));
    expect(packagedExecutable('/out', 'linux', 'SpecForge')).toBe(join('/out', 'specforge'));
  });

  it('locates the unpacked app electron-builder leaves beside the installers', () => {
    expect(unpackedExecutable('/release', 'win32', 'x64')).toBe(join('/release', 'win-unpacked', 'SpecForge.exe'));
    expect(unpackedExecutable('/release', 'darwin', 'arm64')).toBe(
      join('/release', 'mac-arm64', 'SpecForge.app', 'Contents', 'MacOS', 'SpecForge'),
    );
    expect(unpackedExecutable('/release', 'darwin', 'x64')).toBe(
      join('/release', 'mac', 'SpecForge.app', 'Contents', 'MacOS', 'SpecForge'),
    );
    expect(unpackedExecutable('/release', 'linux', 'x64')).toBe(join('/release', 'linux-unpacked', 'specforge'));
  });

  it('runs the packaging and the packaged smoke test on all three CI runners and keeps the installers', () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')) as {
      jobs: { build: { steps: Array<{ run?: string; uses?: string; with?: Record<string, string> }> } };
    };
    const steps = workflow.jobs.build.steps;
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toMatch(/pnpm package/);
    expect(runs).toMatch(/pnpm test:packaged/);
    const upload = steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
    expect(upload?.with?.path).toMatch(/release/);
  });
});

describe('US-009 AC-2: installers include LICENSE, NOTICE and THIRD_PARTY_NOTICES', () => {
  it('adds the three files as resources of every installer', () => {
    expect(config.extraResources).toEqual([
      { from: join('/resources', 'LICENSE'), to: 'LICENSE' },
      { from: join('/resources', 'NOTICE'), to: 'NOTICE' },
      { from: join('/resources', 'THIRD_PARTY_NOTICES'), to: 'THIRD_PARTY_NOTICES' },
    ]);
    expect(config.nsis).toMatchObject({ license: join('/resources', 'LICENSE') });
  });

  it('lists every production dependency with version, license and license text, without workspace packages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-notice-'));
    writeFileSync(join(dir, 'LICENSE.md'), 'MIT License\n\nCopyright (c) zod authors');
    const deps = parsePnpmLicenses(
      JSON.stringify({
        MIT: [
          { name: 'zod', versions: ['4.6.7'], paths: [dir], license: 'MIT' },
          { name: '@specforge/domain', versions: ['0.0.0'], paths: ['/x'], license: 'Apache-2.0' },
        ],
      }),
    );

    const entries = noticeEntries(deps, readLicenseText);
    const text = renderThirdPartyNotices(entries);

    expect(entries.map((e) => e.name)).toEqual(['zod']);
    expect(text).toMatch(/zod 4\.6\.7\s+License: MIT/);
    expect(text).toContain('Copyright (c) zod authors');
  });

  it('marks the Agent SDK as proprietary, not covered by Apache-2.0', () => {
    const entries = noticeEntries([{ name: '@anthropic-ai/claude-agent-sdk', version: '0.3.302', license: 'Unknown' }], () => undefined);

    const text = renderThirdPartyNotices(entries);

    expect(text).toMatch(/@anthropic-ai\/claude-agent-sdk 0\.3\.302\s+License: Proprietary/);
    expect(text).toMatch(/not licensed under the Apache License/);
  });

  it('reports shipped packages that are missing from the notices', () => {
    const entries = noticeEntries([{ name: 'zod', version: '4.6.7', license: 'MIT' }], () => undefined);

    expect(missingNotices(['zod', 'kysely', '@specforge/core'], entries)).toEqual(['kysely']);
  });

  it('derives the shipped package names from the bundled input files', () => {
    expect(
      packagesFromInputs([
        '../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core.js',
        'node_modules\\.pnpm\\@codemirror+view@6\\node_modules\\@codemirror\\view\\dist\\index.js',
        '../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/index.js',
        'packages/core/dist/main.js',
      ]),
    ).toEqual(['@codemirror/view', 'zod']);
  });

  it('reads the license file of a package directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-notice-'));
    expect(readLicenseText(dir)).toBeUndefined();
    writeFileSync(join(dir, 'LICENCE'), 'text');
    expect(readLicenseText(dir)).toBe('text');
  });
});

describe('US-009 AC-3: the Agent SDK bundled Claude Code binary is excluded', () => {
  it('copies the Agent SDK without nested node_modules', () => {
    const keep = keepModuleFile('@anthropic-ai/claude-agent-sdk', 'linux', 'x64');
    expect(keep('sdk.mjs')).toBe(true);
    expect(keep('LICENSE.md')).toBe(true);
    expect(keep('node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude')).toBe(false);
  });

  it('copies only the SQLite prebuild of the target platform', () => {
    const keep = keepModuleFile('better-sqlite3', 'win32', 'x64');
    expect(keep('lib/index.js')).toBe(true);
    expect(keep('prebuilds/win32-x64.node')).toBe(true);
    expect(keep('prebuilds/linux-x64.node')).toBe(false);
    expect(keep('src/better_sqlite3.cpp')).toBe(false);
    expect(keep('deps/sqlite3/sqlite3.c')).toBe(false);
  });

  it('excludes the platform binary packages from the packaged files', () => {
    expect(config.files).toEqual(expect.arrayContaining(['!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**']));
  });

  it('finds a Claude Code binary left anywhere in a packaged output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-pack-'));
    mkdirSync(join(dir, 'resources', 'app.asar.unpacked', 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(dir, 'resources', 'app.asar.unpacked', 'node_modules', 'x', 'index.js'), '');
    expect(findClaudeCodeBinaries(dir)).toEqual([]);

    mkdirSync(join(dir, 'resources', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64'), { recursive: true });
    writeFileSync(join(dir, 'resources', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe'), '');
    expect(findClaudeCodeBinaries(dir)).toEqual([join('resources', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64')]);
  });
});

describe('US-009 AC-4 (support): staged app manifest', () => {
  it('declares the bundled main entry and only the copied external modules as npm dependencies', () => {
    const manifest = stagedManifest(
      { name: 'specforge', version: '0.1.0', description: 'd', license: 'Apache-2.0' },
      { 'better-sqlite3': '13.0.3', '@anthropic-ai/claude-agent-sdk': '0.3.302' },
    );

    expect(manifest).toMatchObject({ name: 'specforge', productName: 'SpecForge', version: '0.1.0', main: 'main.js', type: 'module' });
    expect(manifest.packageManager).toMatch(/^npm@/);
    expect(manifest.dependencies).toEqual({ 'better-sqlite3': '13.0.3', '@anthropic-ai/claude-agent-sdk': '0.3.302' });
  });
});
