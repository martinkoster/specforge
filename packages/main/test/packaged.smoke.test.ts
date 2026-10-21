// SPDX-License-Identifier: Apache-2.0
// US-009 AC-4: the packaged app (output of `pnpm package`) starts with a fresh profile and shows the setup wizard.
// Opt-in: `pnpm test:packaged` (vitest.packaged.config.ts). The fuses disable the Node inspector Playwright's Electron
// launcher needs, so the test starts the executable itself and inspects the page over the Chromium DevTools protocol.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { unpackedExecutable } from '../../../tooling/src/packaging/builder-config.js';

const ROOT = join(__dirname, '..', '..', '..');
const PORT = 9333;

let app: ChildProcess | undefined;
let browser: Browser | undefined;
afterAll(async () => {
  await browser?.close().catch(() => undefined);
  app?.kill();
});

/** A clean per-user profile location for each OS, like a first start on a fresh machine. */
function freshProfileEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, APPDATA: home, XDG_CONFIG_HOME: home, HOME: home, SPECFORGE_TEST: '', SPECFORGE_USER_DATA: '' };
}

async function connect(deadline: number): Promise<Browser> {
  for (;;) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

describe('US-009 AC-4: packaged app launches to the setup wizard', () => {
  it('starts the installed layout with a fresh profile and shows the setup steps', async () => {
    const executable = unpackedExecutable(join(ROOT, 'release'), process.platform);
    const home = mkdtempSync(join(tmpdir(), 'sf-packaged-'));
    const output: string[] = [];
    app = spawn(executable, [`--remote-debugging-port=${PORT}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], {
      env: freshProfileEnv(home),
    });
    app.stdout?.on('data', (d: Buffer) => output.push(d.toString()));
    app.stderr?.on('data', (d: Buffer) => output.push(d.toString()));

    browser = await connect(Date.now() + 30_000);
    const deadline = Date.now() + 30_000;
    let page = browser.contexts()[0]?.pages()[0];
    while (!page && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      page = browser.contexts()[0]?.pages()[0];
    }
    expect(page, output.join('')).toBeDefined();

    await page!.getByRole('navigation', { name: 'Setup steps' }).waitFor({ timeout: 30_000 });
    expect(await page!.title()).toBe('SpecForge');
    expect(app.exitCode, output.join('')).toBeNull();
  });
});
