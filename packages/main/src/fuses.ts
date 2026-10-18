// SPDX-License-Identifier: Apache-2.0
// Electron fuses for packaged builds (technical_decisions §4); applied by the packaging step (US-009).
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

export const FUSES = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
} as const;

/** Flips the SpecForge fuse configuration in the given Electron executable. */
export async function applyFuses(electronBinary: string): Promise<void> {
  await flipFuses(electronBinary, { version: FuseVersion.V1, resetAdHocDarwinSignature: process.platform === 'darwin', ...FUSES });
}
