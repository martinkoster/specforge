// SPDX-License-Identifier: Apache-2.0
// End-to-end test of the Electron shell (US-005): starts the real app with Playwright for Electron.
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, tempProfile } from './e2e-support.js';

let app: ElectronApplication;
let page: Page;

async function status(): Promise<string> {
  return (await page.locator('[data-testid="core-status"]').textContent()) ?? '';
}

async function ping(): Promise<{ pid: number }> {
  await page.locator('[data-testid="ping"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="pong"]')?.textContent?.startsWith('pong'));
  const text = (await page.locator('[data-testid="pong"]').textContent()) ?? '';
  const result = { pid: Number(/pid (\d+)/.exec(text)?.[1]) };
  await page.evaluate(() => {
    document.querySelector('[data-testid="pong"]')!.textContent = '';
  });
  return result;
}

beforeAll(async () => {
  ({ app, page } = await launch(tempProfile()));
}, 180_000);

afterAll(async () => {
  await app?.close();
});

describe('US-005 end-to-end: Electron shell', () => {
  it('US-005 AC-1: renderer runs sandboxed with context isolation and without Node integration', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences());
    expect(prefs).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(() => typeof (globalThis as { process?: unknown }).process)).toBe('undefined');
  });

  it('US-005 AC-2: renderer and core exchange ping/pong over a MessagePort brokered by main', async () => {
    const mainPid = await app.evaluate(() => process.pid);

    const pong = await ping();

    expect(pong.pid).toBeGreaterThan(0);
    expect(pong.pid).not.toBe(mainPid);
  });

  it('US-005 AC-3: a crashed core is restarted and the UI recovers without reloading the window', async () => {
    const before = await ping();
    const reloads: string[] = [];
    page.on('load', () => reloads.push('load'));

    await page.locator('[data-testid="crash"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="core-status"]')?.textContent !== 'connected', undefined, {
      timeout: 10_000,
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="core-status"]')?.textContent === 'connected', undefined, {
      timeout: 15_000,
    });
    const after = await ping();

    expect(after.pid).not.toBe(before.pid);
    expect(reloads).toEqual([]);
    expect(await status()).toBe('connected');
  }, 60_000);
});
