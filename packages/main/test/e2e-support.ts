// SPDX-License-Identifier: Apache-2.0
// Shared helpers for the Electron end-to-end tests (Playwright for Electron).
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

export const ROOT = join(__dirname, '..', '..', '..');
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string;
const AXE = (createRequire(import.meta.url)('axe-core') as { source: string }).source;

/** A fresh, isolated SpecForge profile (database, secrets) per test file. */
export function tempProfile(): string {
  return mkdtempSync(join(tmpdir(), 'sf-e2e-profile-'));
}

/**
 * Starts the built app in test mode and waits until the renderer is connected and showing either the setup wizard
 * or the application. By default a first-start setup wizard is skipped.
 */
export async function launch(
  userData: string,
  options: { setup?: 'skip' | 'keep'; mockAgent?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [join(ROOT, 'packages', 'main', 'dist', 'main.js')],
    env: {
      ...process.env,
      SPECFORGE_TEST: '1',
      SPECFORGE_USER_DATA: userData,
      ...(options.mockAgent ? { SPECFORGE_MOCK_AGENT: '1' } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(
    () =>
      document.querySelector('nav[aria-label="Setup steps"]') !== null ||
      (document.querySelector('[data-testid="core-status"]')?.textContent === 'connected' &&
        (document.querySelector('section[aria-label="Start"]') !== null ||
          [...document.querySelectorAll('button')].some((b) => b.textContent === 'Close project'))),
    undefined,
    // The first start after a build can be slow (on-access virus scanning of new files).
    { timeout: 90_000 },
  );
  if ((options.setup ?? 'skip') === 'skip' && (await page.locator('nav[aria-label="Setup steps"]').count()) > 0) {
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Skip setup' }).click();
    await page.locator('[data-testid="core-status"]').waitFor();
  }
  return { app, page };
}

/** Replaces the native folder picker so tests can choose folders. */
export async function stubFolderPicker(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, folder);
}

/**
 * Creates a project through the start wizard (Git optional) and waits for the Intent phase. The project folder is
 * `parent/<name in lower case, words joined by "-">`, picked folder-first (US-068).
 */
export async function createProject(
  app: ElectronApplication,
  page: Page,
  parent: string,
  name: string,
  options: { git?: boolean } = {},
): Promise<void> {
  const folder = join(parent, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  mkdirSync(folder, { recursive: true });
  await stubFolderPicker(app, folder);
  await page.getByRole('button', { name: 'Create new project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  const git = page.getByRole('checkbox', { name: /Initialise Git repository/ });
  if (options.git === false && (await git.isChecked())) await git.uncheck();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('heading', { name: 'Intent' }).waitFor();
}

/** Answers every relayed permission request of the open project with "Always allow for this project". */
/**
 * `close: false` leaves the panel open — for callers that expect a modal (e.g. the review of a specification run) to
 * open right after the answer and close the panel themselves (closePendingPanel).
 */
export async function allowPending(page: Page, options: { close?: boolean } = {}): Promise<void> {
  const counter = page.getByRole('button', { name: /pending decisions?$/ });
  await page.waitForFunction(
    () => /^[1-9]\d* pending decision/.test(document.querySelector('.pending-decisions')?.textContent ?? ''),
    undefined,
    { timeout: 60_000 },
  );
  await counter.click();
  const panel = page.getByRole('dialog', { name: /^Pending decisions/ });
  const always = panel.getByRole('button', { name: 'Always allow for this project' });
  // One prompt at a time: the answered prompt disappears when the pending list is re-read.
  for (let remaining = await always.count(); remaining > 0; remaining = await always.count()) {
    await always.first().click();
    await page.waitForFunction(
      (before) => document.querySelectorAll('[aria-label^="Pending decisions"] .permission-prompt').length < before,
      remaining,
      { timeout: 30_000 },
    );
  }
  if (options.close ?? true) await closePendingPanel(page);
}

/** Closes the pending-decisions panel if it is open. */
export async function closePendingPanel(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: /^Pending decisions/ });
  if ((await panel.count()) > 0) await panel.getByRole('button', { name: 'Close' }).click();
}

/** Moves a story with the keyboard-accessible "Move to" control and waits until it left its column. */
export async function moveTo(page: Page, storyId: string, column: 'Ready' | 'In Progress'): Promise<void> {
  await page.getByRole('combobox', { name: `Move ${storyId} to`, exact: true }).selectOption({ label: column });
  // Starting behind an unstarted predecessor asks first (US-043).
  const queueConfirm = page.getByRole('button', { name: 'Queue anyway' });
  await queueConfirm.waitFor({ timeout: 1500 }).then(
    () => queueConfirm.click(),
    () => undefined,
  );
  await waitForColumn(page, storyId, column);
}

/** Waits until the card of `storyId` is in the column whose label contains `column`. */
export async function waitForColumn(page: Page, storyId: string, column: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    ([id, col]) => {
      const card = [...document.querySelectorAll('article')].find((a) => a.getAttribute('aria-label')?.startsWith(`${id} `));
      // Flat board: "Review (2)"; by epic: "EP-001 Accounts · Review (2)".
      const label = card?.closest('section.column')?.getAttribute('aria-label') ?? '';
      return label.startsWith(col!) || label.includes(`· ${col!}`);
    },
    [storyId, column] as const,
    { timeout },
  );
}

/** Label of the column the card of `storyId` is in, or null. */
export function columnOf(page: Page, storyId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const card = [...document.querySelectorAll('article')].find((a) => a.getAttribute('aria-label')?.startsWith(`${id} `));
    return card?.closest('section.column')?.getAttribute('aria-label') ?? null;
  }, storyId);
}

/** An approved Backlog story file (written into the workspace like a user would). */
export function storyFile(id: string, title: string): string {
  return `---\nkind: story\nid: ${id}\ntitle: ${title}\nstatus: backlog\napproval: approved\nsize: S\nrequirements: [FR-001]\n---\n## Description\nAs a user I want ${title.toLowerCase()}.\n## Acceptance criteria\n- [ ] ${title} works.\n`;
}

/** WCAG 2.1 AA colour-contrast violations of the current page (axe-core, NFR-020). */
export async function contrastViolations(page: Page): Promise<string[]> {
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
