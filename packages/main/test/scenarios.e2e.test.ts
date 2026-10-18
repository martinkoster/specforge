// SPDX-License-Identifier: Apache-2.0
// End-to-end scenarios (US-063 AC-2): non-git mode, cancelling a run, crash recovery (the core is killed during a
// run) and limited mode — with the scripted agent (stories titled "Hang …" never finish).
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { allowPending, columnOf, createProject, launch, moveTo, storyFile, tempProfile, waitForColumn } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A project with the given approved Backlog stories, written into the workspace; opens the board. */
async function projectWithStories(page: Page, stories: Record<string, string>, options: { git?: boolean } = {}): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-scn-'));
  await createProject(app!, page, parent, 'Scenario', options);
  const workspace = join(parent, 'scenario');
  writeFileSync(
    join(workspace, 'spec', '02_requirements', 'functional_requirements.md'),
    '---\nkind: requirements\n---\n### FR-001: Something\n',
  );
  for (const [id, title] of Object.entries(stories)) {
    writeFileSync(join(workspace, 'spec', '04_user_stories', `${id}.md`), storyFile(id, title));
  }
  const kanban = page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' });
  await expect.poll(() => kanban.isEnabled(), { timeout: 30_000 }).toBe(true);
  await kanban.click();
  for (const id of Object.keys(stories)) await waitForColumn(page, id, 'Backlog');
  return workspace;
}

/** Starts a story and answers its permission request; it is then running. */
async function start(page: Page, storyId: string): Promise<void> {
  await moveTo(page, storyId, 'Ready');
  await moveTo(page, storyId, 'In Progress');
  await allowPending(page);
}

describe('US-063 AC-2: end-to-end scenarios', () => {
  it('non-git mode: a run reaches Review; rejecting restores the files the run changed', async () => {
    ({ app } = await launch(tempProfile(), { mockAgent: true }));
    const page = (await app.firstWindow()) as Page;
    const workspace = await projectWithStories(page, { 'US-001': 'Log in' }, { git: false });
    await page.getByText('No Git').first().waitFor();

    await start(page, 'US-001');
    await waitForColumn(page, 'US-001', 'Review', 90_000);
    expect(existsSync(join(workspace, 'src', 'us-001.ts'))).toBe(true);

    await page.getByRole('button', { name: 'Open US-001' }).click();
    const decision = page.getByRole('region', { name: 'Decision' });
    await decision.getByRole('button', { name: 'Reject…' }).click();
    await decision.getByRole('checkbox', { name: 'Restore the files the run changed' }).check();
    await decision.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await waitForColumn(page, 'US-001', 'Ready');
    expect(existsSync(join(workspace, 'src', 'us-001.ts'))).toBe(false);
  }, 300_000);

  it('cancel: cancelling a running story stops the run and returns the story to Ready', async () => {
    ({ app } = await launch(tempProfile(), { mockAgent: true }));
    const page = (await app.firstWindow()) as Page;
    await projectWithStories(page, { 'US-001': 'Hang on login' });
    await start(page, 'US-001');

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Executions' }).click();
    const cancel = page.getByRole('button', { name: 'Cancel US-001' });
    await cancel.waitFor({ timeout: 60_000 });
    await cancel.click();
    await page.getByRole('table', { name: 'Runs' }).getByText('Cancelled').waitFor({ timeout: 30_000 });

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' }).click();
    await waitForColumn(page, 'US-001', 'Ready');
  }, 300_000);

  it('crash recovery: a core killed during a run restarts; the run is interrupted and can be recovered', async () => {
    ({ app } = await launch(tempProfile(), { mockAgent: true }));
    const page = (await app.firstWindow()) as Page;
    await projectWithStories(page, { 'US-001': 'Hang on login' });
    await start(page, 'US-001');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Executions' }).click();
    await page.getByRole('table', { name: 'Runs' }).getByText('Running').waitFor({ timeout: 60_000 });

    await page.locator('[data-testid="crash"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="core-status"]')?.textContent !== 'connected', undefined, {
      timeout: 10_000,
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="core-status"]')?.textContent === 'connected', undefined, {
      timeout: 60_000,
    });

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' }).click();
    const recover = page.getByRole('button', { name: 'Recover US-001' });
    await recover.waitFor({ timeout: 30_000 });
    expect(await columnOf(page, 'US-001')).toMatch(/In Progress/);
    await recover.click();
    await page.getByRole('dialog', { name: 'Recover US-001' }).waitFor();
  }, 300_000);

  it('limited mode: without an agent runtime AI functions are disabled with the reason', async () => {
    ({ app } = await launch(tempProfile()));
    const page = (await app.firstWindow()) as Page;
    await createProject(app, page, mkdtempSync(join(tmpdir(), 'sf-e2e-scn-')), 'Limited');
    const banner = page.getByRole('region', { name: 'AI functions disabled' });
    await banner.waitFor();
    expect(await banner.textContent()).toContain('No agent runtime is available.');

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Specifications' }).click();
    await expect.poll(() => page.getByRole('button', { name: 'Generate', exact: true }).isDisabled()).toBe(true);

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Dashboard' }).click();
    await page.getByText('Project chat').click();
    await page.getByRole('button', { name: 'New thread' }).click();
    await expect.poll(() => page.getByRole('textbox', { name: 'Message' }).isDisabled()).toBe(true);
  }, 300_000);
});
