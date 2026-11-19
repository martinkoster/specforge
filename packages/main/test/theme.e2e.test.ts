// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-077, FR-117): Settings → Appearance switches the theme at once, the choice survives a restart from the
// first frame (window background and page agree, no flash), and "System" follows the OS colour scheme.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { launch, tempProfile } from './e2e-support.js';

const apps: ElectronApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK = 'rgb(12, 12, 14)';
const LIGHT = 'rgb(255, 255, 255)';

/** Playwright emulates a light colour scheme by default; without emulation the page follows nativeTheme. */
const followNativeTheme = (page: Page) => page.emulateMedia({ colorScheme: null });

async function openAppearance(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radiogroup', { name: 'Theme' }).waitFor();
}

describe('US-077 end-to-end: colour theme', () => {
  it('AC-2/AC-3: applies the choice at once, keeps it across restarts without a flash and lets System follow the OS', async () => {
    const profile = tempProfile();
    const first = await launch(profile);
    apps.push(first.app);
    await followNativeTheme(first.page);
    await openAppearance(first.page);
    expect(await first.page.getByRole('radio', { name: 'System' }).isChecked()).toBe(true);

    await first.page.getByRole('radio', { name: 'Dark' }).check();
    await expect.poll(() => bodyBackground(first.page)).toBe(DARK);
    expect(JSON.parse(readFileSync(join(profile, 'ui-preferences.json'), 'utf8'))).toEqual({ theme: 'dark' });
    await first.app.close();
    apps.splice(0);

    const second = await launch(profile);
    apps.push(second.app);
    await followNativeTheme(second.page);
    // The window was created with the dark background and the dark theme source: the first frame is already dark.
    const native = await second.app.evaluate(({ BrowserWindow, nativeTheme }) => ({
      source: nativeTheme.themeSource,
      background: BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase(),
    }));
    expect(native).toEqual({ source: 'dark', background: '#0c0c0e' });
    expect(await bodyBackground(second.page)).toBe(DARK);

    await openAppearance(second.page);
    await second.page.getByRole('radio', { name: 'System' }).check();
    await expect.poll(() => second.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
    await second.page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bodyBackground(second.page)).toBe(LIGHT);
    await second.page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => bodyBackground(second.page)).toBe(DARK);
  }, 240_000);
});
