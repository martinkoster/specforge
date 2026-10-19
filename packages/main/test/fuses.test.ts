// SPDX-License-Identifier: Apache-2.0
import { cpSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { FUSES, applyFuses } from '../src/fuses.js';

describe('US-005 AC-4: Electron fuses for packaged builds', () => {
  it('disables RunAsNode and Node escape hatches and enables ASAR integrity validation', () => {
    expect(FUSES[FuseV1Options.RunAsNode]).toBe(false);
    expect(FUSES[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(false);
    expect(FUSES[FuseV1Options.EnableNodeCliInspectArguments]).toBe(false);
    expect(FUSES[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(true);
    expect(FUSES[FuseV1Options.OnlyLoadAppFromAsar]).toBe(true);
  });

  it('flips the fuses in an Electron binary', async () => {
    const executable = createRequire(import.meta.url)('electron') as unknown as string;
    // macOS: the fuses live in the Electron Framework of the app bundle, not in the launcher executable.
    const electronBinary = process.platform === 'darwin' ? executable.slice(0, executable.indexOf('.app') + 4) : executable;
    const copy = join(mkdtempSync(join(tmpdir(), 'sf-fuses-')), basename(electronBinary));
    cpSync(electronBinary, copy, { recursive: true, verbatimSymlinks: true });

    await applyFuses(copy);

    const wire = await getCurrentFuseWire(copy);
    expect(wire[FuseV1Options.RunAsNode]).toBe(FuseState.DISABLE);
    expect(wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(FuseState.ENABLE);
    expect(wire[FuseV1Options.OnlyLoadAppFromAsar]).toBe(FuseState.ENABLE);
  }, 120_000);
});
