// SPDX-License-Identifier: Apache-2.0
// Builds main, core and the renderer once before all Electron end-to-end tests.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export default function setup(): void {
  const root = join(import.meta.dirname, '..', '..', '..');
  execFileSync(
    process.execPath,
    [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', 'packages/main', 'packages/core', 'packages/ui'],
    {
      cwd: root,
    },
  );
  execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', 'packages/ui'], { cwd: root });
}
