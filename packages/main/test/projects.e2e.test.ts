// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-018, US-019, US-068): create a project folder-first through the UI, restart the app and find it restored;
// non-empty folders are rejected and an empty folder opened via "Open existing project" becomes a project.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { launch, stubFolderPicker, tempProfile } from './e2e-support.js';

const apps: ElectronApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('US-018/US-019/US-068 end-to-end: create, restart, restore', () => {
  it('creates a git project in the picked folder at the Intent phase and reopens it after a restart', async () => {
    const profile = tempProfile();
    const folder = join(mkdtempSync(join(tmpdir(), 'sf-e2e-parent-')), 'e2e-project');
    mkdirSync(folder);

    const first = await launch(profile);
    apps.push(first.app);
    await stubFolderPicker(first.app, folder);
    const { page } = first;
    await page.getByRole('button', { name: 'Create new project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create new project' });
    await dialog.getByText(folder).waitFor();
    expect(await dialog.getByRole('textbox', { name: 'Project name' }).inputValue()).toBe('e2e-project');
    await dialog.getByRole('textbox', { name: 'Project name' }).fill('E2E Project');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await page.getByRole('heading', { name: 'Intent' }).waitFor();
    expect(await page.getByText(/^Git · /).count()).toBe(1);
    expect(existsSync(join(folder, '.specforge', 'project.yaml'))).toBe(true);
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: folder, encoding: 'utf8' }).trim()).toBe('Initialise SpecForge project');

    await first.app.close();
    apps.splice(0);

    const second = await launch(profile);
    apps.push(second.app);
    await second.page.getByRole('button', { name: 'Close project' }).waitFor();
    expect(await second.page.getByRole('combobox', { name: 'Project' }).locator('option:checked').textContent()).toBe('E2E Project');
  }, 240_000);

  it('US-068 AC-3/AC-4: rejects a non-empty folder; "Open existing project" on an empty folder offers "Create new project here"', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-folders-'));
    const code = join(parent, 'code');
    mkdirSync(code);
    writeFileSync(join(code, 'main.c'), 'int main(void) { return 0; }\n');
    const empty = join(parent, 'notes');
    mkdirSync(empty);

    const { app, page } = await launch(tempProfile());
    apps.push(app);

    await stubFolderPicker(app, code);
    await page.getByRole('button', { name: 'Create new project' }).click();
    await page.getByRole('alert').getByText('adopting existing code arrives in Release 2', { exact: false }).waitFor();
    expect(await page.getByRole('dialog', { name: 'Create new project' }).count()).toBe(0);
    expect(existsSync(join(code, '.specforge'))).toBe(false);

    await stubFolderPicker(app, empty);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    const offer = page.getByRole('region', { name: 'Empty folder' });
    await offer.getByRole('button', { name: 'Create new project here' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create new project' });
    expect(await dialog.getByRole('textbox', { name: 'Project name' }).inputValue()).toBe('notes');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await page.getByRole('heading', { name: 'Intent' }).waitFor();
    expect(existsSync(join(empty, '.specforge', 'project.yaml'))).toBe(true);
  }, 240_000);
});
