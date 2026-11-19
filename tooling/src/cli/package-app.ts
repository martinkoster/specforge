// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm package` — stages the built app, generates THIRD_PARTY_NOTICES and builds this OS's installers with
// electron-builder (US-009); output in release/. `pnpm package --dir` builds only the unpacked app (no installer).
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listPackage } from '@electron/asar';
import { build as bundle, type Metafile } from 'esbuild';
import { build as buildInstallers } from 'electron-builder';
import { parsePnpmLicenses } from '../licenses.js';
import { builderConfig, packagedExecutable, unpackedExecutable } from '../packaging/builder-config.js';
import { missingNotices, noticeEntries, readLicenseText, renderThirdPartyNotices } from '../packaging/notices.js';
import {
  EXTERNAL_MODULES,
  findClaudeCodeBinaries,
  keepModuleFile,
  packagesFromInputs,
  stagedManifest,
  type ExternalModule,
  type RootManifest,
} from '../packaging/stage.js';
import { runPnpm } from './pnpm.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const stageDir = join(root, 'build', 'stage');
// Fuse configuration of main (US-005), from its build output: tooling compiles only its own sources.
const { applyFuses } = (await import(pathToFileURL(join(root, 'packages', 'main', 'dist', 'fuses.js')).href)) as {
  applyFuses(electronBinary: string): Promise<void>;
};
const resourcesDir = join(root, 'build', 'resources');
const outDir = join(root, 'release');
const dirOnly = process.argv.includes('--dir');
// The packages that depend on the external modules (pnpm installs them only there).
const MODULE_OWNER: Record<ExternalModule, string> = {
  'better-sqlite3': join(root, 'packages', 'adapters', 'sqlite'),
  '@anthropic-ai/claude-agent-sdk': join(root, 'packages', 'adapters', 'agent-claude-code'),
};

function step(message: string) {
  console.log(`▸ ${message}`);
}

async function bundleEntry(entry: string, outfile: string, external: string[]): Promise<Metafile> {
  const result = await bundle({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external,
    metafile: true,
    legalComments: 'none',
    // CommonJS dependencies inside an ESM bundle need a real `require`.
    banner: { js: "import { createRequire as __sfCreateRequire } from 'node:module'; const require = __sfCreateRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  return result.metafile;
}

/** Copies the staged files of an external module and returns its version. */
function copyModule(module: ExternalModule): string {
  const source = realpathSync(join(MODULE_OWNER[module], 'node_modules', ...module.split('/')));
  const target = join(stageDir, 'node_modules', ...module.split('/'));
  const keep = keepModuleFile(module, process.platform, process.arch);
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(source, full).replaceAll('\\', '/');
      if (entry.isDirectory()) walk(full);
      else if (keep(rel)) {
        mkdirSync(dirname(join(target, rel)), { recursive: true });
        copyFileSync(full, join(target, rel));
      }
    }
  };
  walk(source);
  return (JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { version: string }).version;
}

step('Staging the application');
rmSync(join(root, 'build'), { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
const main = await bundleEntry(join(root, 'packages', 'main', 'dist', 'main.js'), join(stageDir, 'main.js'), ['electron']);
const core = await bundleEntry(join(root, 'packages', 'core', 'dist', 'main.js'), join(stageDir, 'core.js'), [
  'electron',
  ...EXTERNAL_MODULES,
]);
copyFileSync(join(root, 'packages', 'main', 'dist', 'preload.cjs'), join(stageDir, 'preload.cjs'));
cpSync(join(root, 'packages', 'ui', 'dist', 'app'), join(stageDir, 'ui'), { recursive: true });
const versions = Object.fromEntries(EXTERNAL_MODULES.map((module) => [module, copyModule(module)]));
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as RootManifest;
writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify(stagedManifest(rootManifest, versions), null, 2)}\n`);

step('Generating THIRD_PARTY_NOTICES');
const entries = noticeEntries(parsePnpmLicenses(runPnpm(['-r', 'licenses', 'list', '--prod', '--json'])), readLicenseText);
const shipped = [...packagesFromInputs([...Object.keys(main.inputs), ...Object.keys(core.inputs)]), ...EXTERNAL_MODULES];
const missing = missingNotices(shipped, entries);
if (missing.length > 0) {
  console.error(`✖ shipped packages missing from THIRD_PARTY_NOTICES (not production dependencies?): ${missing.join(', ')}`);
  process.exit(1);
}
mkdirSync(resourcesDir, { recursive: true });
writeFileSync(join(resourcesDir, 'THIRD_PARTY_NOTICES'), renderThirdPartyNotices(entries));
for (const file of ['LICENSE', 'NOTICE']) copyFileSync(join(root, file), join(resourcesDir, file));

step(dirOnly ? `Building the unpacked app for ${process.platform}` : `Building installers for ${process.platform}`);
// Same Electron version as the workspace; electron-builder downloads its release zip (without the default app).
const electronDir = realpathSync(join(root, 'packages', 'main', 'node_modules', 'electron'));
const electron = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')) as { version: string };
await buildInstallers({
  publish: 'never',
  dir: dirOnly,
  // The staged app is its own (npm) project, so electron-builder collects only its copied node_modules.
  projectDir: stageDir,
  config: {
    ...builderConfig({ outDir, resourcesDir, electronVersion: electron.version }),
    // Fuses must be flipped before signing (technical_decisions §4).
    afterPack: async (context) => applyFuses(packagedExecutable(context.appOutDir, context.electronPlatformName as NodeJS.Platform)),
  },
});

step('Checking the package (no Claude Code binary, no default app)');
const unpacked = dirname(unpackedExecutable(outDir, process.platform));
const appDir = process.platform === 'darwin' ? join(unpacked, '..', '..') : unpacked;
const resources = process.platform === 'darwin' ? join(appDir, 'Contents', 'Resources') : join(appDir, 'resources');
const inArchive = listPackage(join(resources, 'app.asar'), { isPack: false }).filter((p) => /claude-agent-sdk-/.test(p));
const binaries = [...findClaudeCodeBinaries(appDir), ...inArchive];
if (existsSync(join(resources, 'default_app.asar'))) {
  console.error('✖ Electron default app found in the package');
  process.exit(1);
}
if (binaries.length > 0) {
  console.error(`✖ Claude Code binary packages found in the app: ${binaries.join(', ')}`);
  process.exit(1);
}
console.log(
  dirOnly
    ? `✔ unpacked app in ${relative(root, appDir)}`
    : `✔ installers in ${relative(root, outDir)}: ${readdirSync(outDir)
        .filter((f) => /\.(exe|dmg|AppImage|deb)$/.test(f))
        .join(', ')}`,
);
