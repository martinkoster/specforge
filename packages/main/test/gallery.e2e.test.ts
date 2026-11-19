// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-070 AC-5, NFR-020, NFR-033): the test-only component gallery shows every control variant and passes the
// WCAG 2.1 AA contrast check in the light and the dark colour scheme.
import type { ElectronApplication } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { contrastViolations, launch, tempProfile } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('US-070 AC-5: component gallery', () => {
  it('renders all variants and passes the contrast check in light and dark', async () => {
    let page;
    ({ app, page } = await launch(tempProfile()));
    await page.evaluate(() => {
      window.location.hash = '#gallery';
    });
    await page.getByRole('heading', { name: 'Component gallery' }).waitFor();
    expect(await page.locator('.btn').count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator('.badge').count()).toBeGreaterThanOrEqual(8);

    const violations: string[] = [];
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(200);
      violations.push(...(await contrastViolations(page)).map((v) => `${colorScheme}: ${v}`));
    }
    expect(violations).toEqual([]);
  }, 120_000);
});
