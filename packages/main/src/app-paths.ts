// SPDX-License-Identifier: Apache-2.0
// Where main finds the preload script, the core entry and the renderer page (US-009).
import { join } from 'node:path';

export interface AppPaths {
  preload: string;
  core: string;
  page: string;
}

/**
 * `here` is the directory of the running main.js: `packages/main/dist` in the workspace, the app archive root in a
 * packaged build, where the packaging step bundles everything side by side.
 */
export function appPaths(here: string, packaged: boolean): AppPaths {
  if (packaged) return { preload: join(here, 'preload.cjs'), core: join(here, 'core.js'), page: join(here, 'ui', 'index.html') };
  return {
    preload: join(here, 'preload.cjs'),
    core: join(here, '..', '..', 'core', 'dist', 'main.js'),
    page: join(here, '..', '..', 'ui', 'dist', 'app', 'index.html'),
  };
}
