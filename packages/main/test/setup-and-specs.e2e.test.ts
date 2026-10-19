// SPDX-License-Identifier: Apache-2.0
// End-to-end: first-start setup wizard (US-012) and editing an artifact in the Specifications area (US-025).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { launch, stubFolderPicker, tempProfile } from './e2e-support.js';

const apps: ElectronApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('US-012 end-to-end: first start', () => {
  it('opens the setup wizard on first start; after Finish the next start opens the start wizard directly', async () => {
    const profile = tempProfile();
    const first = await launch(profile, { setup: 'keep' });
    apps.push(first.app);
    const { page } = first;

    const steps = page.getByRole('navigation', { name: 'Setup steps' });
    expect(await steps.getByRole('button').count()).toBe(6);
    await steps.getByRole('button', { name: /^Ready/ }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Create new project' }).waitFor();
    await first.app.close();
    apps.splice(0);

    const second = await launch(profile, { setup: 'keep' });
    apps.push(second.app);
    await second.page.getByRole('button', { name: 'Create new project' }).waitFor();
    expect(await second.page.getByRole('navigation', { name: 'Setup steps' }).count()).toBe(0);
  }, 240_000);
});

describe('US-025 end-to-end: edit and save an artifact', () => {
  it('edits the intent in CodeMirror, previews it and saves it with Ctrl+S', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'sf-e2e-specs-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: e2e-specs\nname: Specs E2E\n');
    mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });
    writeFileSync(join(ws, 'spec', '01_intent', 'intent.md'), '---\nkind: intent\napproval: draft\n---\n# Intent\n');

    const started = await launch(tempProfile());
    apps.push(started.app);
    const { app, page } = started;
    await stubFolderPicker(app, ws);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    await page.getByRole('button', { name: 'Close project' }).waitFor();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Specifications' }).click();
    await page.getByRole('button', { name: 'intent.md' }).click();

    const editor = page.locator('.cm-content');
    await editor.waitFor();
    // CodeMirror's injected styles must survive the renderer CSP (style-src 'self').
    expect(await page.locator('.cm-editor').evaluate((el) => getComputedStyle(el).display)).toBe('flex');
    await editor.click();
    // Cmd on macOS, Ctrl elsewhere (CodeMirror's `Mod` key and the editor's save shortcut).
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n## Goals\n');
    await page.getByRole('region', { name: 'Preview' }).getByRole('heading', { name: 'Goals' }).waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await page.getByText('Saved', { exact: true }).waitFor();

    expect(readFileSync(join(ws, 'spec', '01_intent', 'intent.md'), 'utf8')).toContain('## Goals');
  }, 240_000);
});
