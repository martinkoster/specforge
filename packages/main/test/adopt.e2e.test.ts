// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-079, US-080, UC-030): adopt a folder with existing code from the start screen, let the scripted agent
// analyse it, keep the current-state drafts and continue at the Intent phase. Existing files stay unchanged.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { closePendingPanel, launch, stubFolderPicker, tempProfile } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Answers permission prompts ("Always allow for this project") until the review dialog of the run is shown. */
async function allowUntilReview(page: Page, title: string): Promise<void> {
  const review = page.getByRole('dialog', { name: title });
  const deadline = Date.now() + 90_000;
  while (!(await review.isVisible().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`no review "${title}"`);
    const always = page.getByRole('button', { name: 'Always allow for this project' }).first();
    if (await always.isVisible().catch(() => false)) {
      await always.click({ timeout: 5_000 }).catch(() => undefined);
      continue;
    }
    const counter = page.getByRole('button', { name: /^[1-9]\d* pending decisions?$/ });
    if ((await counter.count()) > 0 && (await page.getByRole('dialog', { name: /^Pending decisions/ }).count()) === 0) {
      await counter.click();
      continue;
    }
    await page.waitForTimeout(200);
  }
}

describe('US-079/US-080: adopt existing code and analyse it end to end', () => {
  it('adopts a Rails-style folder below docs/spec, analyses it and opens the drafts at Intent', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'sf-e2e-adopt-'));
    writeFileSync(join(workspace, 'Gemfile'), "gem 'rails', '7.1.0'\n");
    mkdirSync(join(workspace, 'spec'));
    writeFileSync(join(workspace, 'spec', 'user_spec.rb'), 'describe "user" do\nend\n');
    const before = { Gemfile: hash(join(workspace, 'Gemfile')), spec: hash(join(workspace, 'spec', 'user_spec.rb')) };

    const started = await launch(tempProfile(), { mockAgent: true });
    app = started.app;
    const { page } = started;

    await stubFolderPicker(app, workspace);
    await page.getByRole('button', { name: 'Adopt existing code' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adopt existing code' });
    expect(await dialog.getByRole('textbox', { name: 'Specification folder' }).inputValue()).toBe('docs/spec');
    expect(await dialog.getByRole('checkbox', { name: /Analyse the codebase now/ }).isChecked()).toBe(true);
    const adopt = dialog.getByRole('button', { name: 'Adopt', exact: true });
    await expect.poll(() => adopt.isEnabled(), { timeout: 30_000 }).toBe(true);
    await adopt.click();

    await page.getByRole('heading', { name: 'Intent' }).waitFor({ timeout: 30_000 });
    expect(readFileSync(join(workspace, '.specforge', 'project.yaml'), 'utf8')).toContain('specRoot: docs/spec');

    await allowUntilReview(page, 'Review changes in docs/spec');
    const review = page.getByRole('dialog', { name: 'Review changes in docs/spec' });
    await review.getByRole('button', { name: 'Keep' }).click();
    await review.waitFor({ state: 'detached' });
    await closePendingPanel(page);

    expect(readFileSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'), 'utf8')).toContain('## Desired change');
    expect(existsSync(join(workspace, 'docs', 'spec', '03_design', 'current_state.md'))).toBe(true);
    await page.locator('.artifact-toolbar .path').filter({ hasText: 'intent.md' }).waitFor({ timeout: 30_000 });
    expect(hash(join(workspace, 'Gemfile'))).toBe(before.Gemfile);
    expect(hash(join(workspace, 'spec', 'user_spec.rb'))).toBe(before.spec);
  }, 300_000);
});
