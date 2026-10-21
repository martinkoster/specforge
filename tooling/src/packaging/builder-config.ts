// SPDX-License-Identifier: Apache-2.0
// electron-builder configuration for the unsigned R1 installers (US-009, FR-058, NFR-026); signing follows in US-067.
import { join } from 'node:path';
import type { Configuration } from 'electron-builder';

export const PRODUCT_NAME = 'SpecForge';

export interface BuilderPaths {
  /** Output directory for installers and unpacked apps. */
  outDir: string;
  /** Directory holding LICENSE, NOTICE and THIRD_PARTY_NOTICES. */
  resourcesDir: string;
  /** Electron version of the workspace (the staged app does not depend on electron). */
  electronVersion: string;
}

const NOTICE_FILES = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES'] as const;

export function builderConfig(paths: BuilderPaths): Configuration {
  return {
    appId: 'io.github.martinkoster.specforge',
    productName: PRODUCT_NAME,
    copyright: 'Copyright © SpecForge contributors',
    // The staged app (stage.ts) is the project directory itself.
    directories: { output: paths.outDir },
    electronVersion: paths.electronVersion,
    files: ['**/*', '!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**'],
    asar: true,
    // Native modules cannot be loaded from inside the archive.
    asarUnpack: ['node_modules/better-sqlite3/**'],
    // The staged app declares no dependencies; better-sqlite3's N-API prebuild loads unchanged in Electron.
    npmRebuild: false,
    nodeGypRebuild: false,
    extraResources: NOTICE_FILES.map((file) => ({ from: join(paths.resourcesDir, file), to: file })),
    win: { target: [{ target: 'nsis', arch: ['x64'] }] },
    // Per-user installation without administrator rights (NFR-026).
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      license: join(paths.resourcesDir, 'LICENSE'),
    },
    // Unsigned until US-067 (no Developer ID identity; arm64 builds get an ad-hoc signature).
    mac: { target: [{ target: 'dmg' }], category: 'public.app-category.developer-tools', identity: null },
    linux: { target: [{ target: 'AppImage' }, { target: 'deb' }], category: 'Development', maintainer: 'SpecForge contributors' },
    publish: null,
  };
}

/** The executable inside a packed app directory (electron-builder's `afterPack` `appOutDir`). */
export function packagedExecutable(appOutDir: string, platform: NodeJS.Platform, productName = PRODUCT_NAME): string {
  if (platform === 'win32') return join(appOutDir, `${productName}.exe`);
  if (platform === 'darwin') return join(appOutDir, `${productName}.app`, 'Contents', 'MacOS', productName);
  return join(appOutDir, productName.toLowerCase());
}

/** The executable of the unpacked app electron-builder leaves in the output directory. */
export function unpackedExecutable(outDir: string, platform: NodeJS.Platform, arch: string = process.arch): string {
  const dir = platform === 'win32' ? 'win-unpacked' : platform === 'darwin' ? (arch === 'arm64' ? 'mac-arm64' : 'mac') : 'linux-unpacked';
  return packagedExecutable(join(outDir, dir), platform);
}
