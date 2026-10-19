// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-018, US-019): create a project through the UI, restart the app and find it restored.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { launch, stubFolderPicker, tempProfile } from './e2e-support.js';

const apps: ElectronApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('US-018/US-019 end-to-end: create, restart, restore', () => {
  it('creates a git project at the Intent phase and reopens it after a restart', async () => {
    const profile = tempProfile();
    const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-parent-'));

    const first = await launch(profile);
    apps.push(first.app);
    await stubFolderPicker(first.app, parent);
    const { page } = first;
    await page.getByRole('button', { name: 'Create new project' }).click();
    await page.getByRole('textbox', { name: 'Project name' }).fill('E2E Project');
    await page.getByRole('button', { name: 'Choose location…' }).click();
    await page.getByText(parent).waitFor();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await page.getByRole('heading', { name: 'Intent' }).waitFor();
    expect(await page.getByText(/^Git · /).count()).toBe(1);
    const folder = join(parent, 'e2e-project');
    expect(existsSync(join(folder, '.specforge', 'project.yaml'))).toBe(true);
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: folder, encoding: 'utf8' }).trim()).toBe('Initialise SpecForge project');

    await first.app.close();
    apps.splice(0);

    const second = await launch(profile);
    apps.push(second.app);
    await second.page.getByRole('button', { name: 'Close project' }).waitFor();
    expect(await second.page.getByRole('combobox', { name: 'Project' }).locator('option:checked').textContent()).toBe('E2E Project');
  }, 240_000);
});
