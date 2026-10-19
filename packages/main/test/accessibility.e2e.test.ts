// SPDX-License-Identifier: Apache-2.0
// US-065 AC-3 (NFR-020): the primary workflow is completable with the keyboard only (every control reached with Tab,
// activated with Enter/Space or typed into), and every primary area passes the automated WCAG 2.1 AA contrast check
// (axe-core `color-contrast`).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { launch, storyFile, stubFolderPicker, tempProfile, waitForColumn } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

const AXE = (createRequire(import.meta.url)('axe-core') as { source: string }).source;
const AREAS = ['Dashboard', 'Projects', 'Intent', 'Specifications', 'Kanban', 'Executions', 'Settings'];

/** Accessible name of the focused element (aria-label, associated label or text). */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '';
    const label = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? '';
    return label.replace(/\s+/g, ' ').trim();
  });

/** Presses Tab until the control named `name` has the focus (fails if it is not reachable). */
async function tabTo(page: Page, name: string | RegExp, max = 300): Promise<void> {
  const matches = (text: string) => (typeof name === 'string' ? text === name : name.test(text));
  for (let i = 0; i < max; i++) {
    if (matches(await focusedName(page))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`"${String(name)}" is not reachable with the keyboard`);
}

async function press(page: Page, name: string | RegExp, key = 'Enter'): Promise<void> {
  await tabTo(page, name);
  await page.keyboard.press(key);
}

/** Chooses an option of a focused native select by typing its label (type-ahead). */
async function choose(page: Page, selectName: string, option: string): Promise<void> {
  await tabTo(page, selectName);
  await page.keyboard.type(option);
}

async function contrastViolations(page: Page): Promise<string[]> {
  // Evaluated through the DevTools protocol, so the renderer CSP does not apply.
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(context: Document, options: object): Promise<{ violations: { nodes: { target: string[]; failureSummary?: string }[] }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] });
    return result.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`));
  });
}

describe('US-065 AC-3: keyboard and contrast', () => {
  it('completes the primary workflow with the keyboard only; all primary areas pass the contrast check', async () => {
    ({ app } = await launch(tempProfile(), { mockAgent: true }));
    const page = (await app.firstWindow()) as Page;
    const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-a11y-'));
    await stubFolderPicker(app, parent);
    expect(await contrastViolations(page)).toEqual([]);

    // Create a project.
    await press(page, 'Create new project');
    await tabTo(page, /^Project name/);
    await page.keyboard.type('Keys');
    await press(page, 'Choose location…');
    await press(page, 'Create');
    await page.getByRole('heading', { name: 'Intent' }).waitFor();

    // Intent from the template, approved.
    await press(page, 'Start from the template');
    await press(page, 'Approve');
    await page.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'detached' });

    // A story (written like a user would), moved to Ready and In Progress on the board.
    const workspace = join(parent, 'keys');
    writeFileSync(
      join(workspace, 'spec', '02_requirements', 'functional_requirements.md'),
      '---\nkind: requirements\n---\n### FR-001: X\n',
    );
    writeFileSync(join(workspace, 'spec', '04_user_stories', 'US-001.md'), storyFile('US-001', 'Log in'));
    const kanban = page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' });
    await expect.poll(() => kanban.isEnabled(), { timeout: 30_000 }).toBe(true);
    await press(page, 'Kanban');
    await waitForColumn(page, 'US-001', 'Backlog');
    await choose(page, 'Move US-001 to', 'Ready');
    await waitForColumn(page, 'US-001', 'Ready');
    await choose(page, 'Move US-001 to', 'In Progress');

    // The permission prompt, answered from the pending-decisions panel.
    await page.waitForFunction(
      () => /^[1-9]\d* pending decision/.test(document.querySelector('.pending-decisions')?.textContent ?? ''),
      undefined,
      {
        timeout: 60_000,
      },
    );
    await press(page, /pending decisions?$/);
    await press(page, 'Always allow for this project');
    await page.keyboard.press('Escape');
    await waitForColumn(page, 'US-001', 'Review', 90_000);

    // Review and approve.
    await press(page, 'Open US-001');
    await page.getByRole('region', { name: 'Decision' }).waitFor({ timeout: 30_000 });
    await press(page, 'Approve');
    await page.getByRole('region', { name: 'Merge instructions' }).waitFor();
    await press(page, 'Close');
    await waitForColumn(page, 'US-001', 'Done');

    // Contrast in every primary area.
    const violations: string[] = [];
    for (const area of AREAS) {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: area }).click();
      await page.waitForTimeout(300);
      violations.push(...(await contrastViolations(page)).map((v) => `${area}: ${v}`));
    }
    expect(violations).toEqual([]);
  }, 300_000);
});
