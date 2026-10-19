// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-063 AC-1): the main workflow with the scripted agent — setup → create project → intent → generate
// requirements, epics and stories → move stories → parallel runs and the queue → permission prompt → review → approve.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { allowPending, columnOf, createProject, launch, moveTo, tempProfile, waitForColumn } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

async function keepReview(page: Page, target: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: `Review changes in ${target}` });
  await dialog.waitFor({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await dialog.waitFor({ state: 'detached' });
}

async function approveArtifact(page: Page, fileName: string): Promise<void> {
  await page.getByRole('button', { name: fileName, exact: true }).click();
  await page.getByText(`spec/`, { exact: false }).first().waitFor();
  const approve = page.getByRole('button', { name: 'Approve', exact: true });
  await approve.click();
  await approve.waitFor({ state: 'detached' });
}

async function generate(page: Page, target: string, folder: string, firstOfKind: boolean): Promise<void> {
  await page.getByRole('combobox', { name: 'Target' }).selectOption({ label: target });
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const draftConfirm = page.getByRole('button', { name: 'Continue anyway' });
  if (await draftConfirm.isVisible().catch(() => false)) await draftConfirm.click();
  if (firstOfKind) await allowPending(page);
  await keepReview(page, folder);
}

describe('US-063 AC-1: the main workflow end to end (scripted agent)', () => {
  it('goes from the first start to approved stories', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-flow-'));
    const started = await launch(tempProfile(), { mockAgent: true, setup: 'keep' });
    app = started.app;
    const { page } = started;
    try {
      await flow(page, parent);
    } catch (e) {
      if (process.env.SPECFORGE_E2E_SHOTS) {
        await page.screenshot({ path: join(process.env.SPECFORGE_E2E_SHOTS, 'workflow-failure.png'), fullPage: true });
      }
      throw e;
    }
  }, 600_000);
});

async function flow(page: Page, parent: string): Promise<void> {
  // First start: the setup wizard, finished from its last step.
  await page
    .getByRole('navigation', { name: 'Setup steps' })
    .getByRole('button', { name: /^Ready/ })
    .click();
  await page.getByRole('button', { name: 'Finish' }).click();

  // Create a project (Git when available).
  await createProject(app!, page, parent, 'Flow');
  const workspace = join(parent, 'flow');

  // Intent from the template, approved.
  await page.getByRole('button', { name: 'Start from the template' }).click();
  const approveIntent = page.getByRole('button', { name: 'Approve', exact: true });
  await approveIntent.click();
  await approveIntent.waitFor({ state: 'detached' });

  // Requirements: generate (one permission prompt, then a rule), keep, approve.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Specifications' }).click();
  await generate(page, 'Requirements', 'spec/02_requirements', true);
  await approveArtifact(page, 'functional_requirements.md');

  // Epics: generate, keep, approve the epic structure.
  await generate(page, 'Epics', 'spec/04_user_stories/epics', false);
  await page.getByRole('button', { name: 'Approve epic structure' }).click();
  await page.getByRole('button', { name: 'Approve epic structure' }).waitFor({ state: 'detached' });

  // Stories for the approved epic; approve them.
  await generate(page, 'User stories', 'spec/04_user_stories', false);
  for (const file of ['US-001-log-in.md', 'US-002-log-out.md', 'US-003-remember-me.md']) await approveArtifact(page, file);
  expect(readFileSync(join(workspace, 'spec', '04_user_stories', 'US-002-log-out.md'), 'utf8')).toContain('epic: EP-001');

  // Kanban by epic: Ready, then In Progress. US-002 waits for US-001; US-001 and US-003 run in parallel.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' }).click();
  await page.getByRole('region', { name: 'Lane EP-001 Accounts' }).waitFor();
  for (const id of ['US-001', 'US-002', 'US-003']) await moveTo(page, id, 'Ready');
  for (const id of ['US-001', 'US-002', 'US-003']) await moveTo(page, id, 'In Progress');
  await page.getByText('Waiting for US-001', { exact: false }).waitFor({ timeout: 30_000 });

  // The implementation writes need permission: answer the prompt.
  await allowPending(page);
  for (const id of ['US-001', 'US-003']) await waitForColumn(page, id, 'Review', 90_000);

  // Review and approve US-001; the queued US-002 starts and reaches Review.
  await page.getByRole('button', { name: 'Open US-001' }).click();
  await page.getByRole('region', { name: 'Review of US-001' }).getByText('US-001 implemented.').waitFor({ timeout: 30_000 });
  await page.getByRole('region', { name: 'Decision' }).getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('region', { name: 'Merge instructions' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await waitForColumn(page, 'US-002', 'Review', 90_000);
  expect(await columnOf(page, 'US-001')).toContain('Done');
  if (existsSync(join(workspace, '.git')))
    expect(readFileSync(join(workspace, 'spec', '04_user_stories', 'US-001-log-in.md'), 'utf8')).toContain('status: done');
}
