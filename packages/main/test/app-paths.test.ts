// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appPaths } from '../src/app-paths.js';

describe('US-009 AC-4 (support): main finds preload, core and page in both layouts', () => {
  it('uses the workspace build outputs in development', () => {
    const here = join('/repo', 'packages', 'main', 'dist');

    expect(appPaths(here, false)).toEqual({
      preload: join(here, 'preload.cjs'),
      core: join('/repo', 'packages', 'core', 'dist', 'main.js'),
      page: join('/repo', 'packages', 'ui', 'dist', 'app', 'index.html'),
    });
  });

  it('uses the bundled files beside main.js in a packaged app', () => {
    const here = join('/app', 'resources', 'app.asar');

    expect(appPaths(here, true)).toEqual({
      preload: join(here, 'preload.cjs'),
      core: join(here, 'core.js'),
      page: join(here, 'ui', 'index.html'),
    });
  });
});
