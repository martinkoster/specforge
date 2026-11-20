// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-082, UC-043, UF-17): with an approved main intent, Ctrl/Cmd+Shift+F opens the feature wizard; a draft
// survives closing; *Save without AI* → *Save & approve* writes the feature intent and shows the feature stepper.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { launch, stubFolderPicker, tempProfile } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

function project(): string {
  const ws = mkdtempSync(join(tmpdir(), 'sf-e2e-feature-'));
  mkdirSync(join(ws, '.specforge'));
  writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: e2e-feature\nname: Features\nschemaVersion: 1\n');
  mkdirSync(join(ws, 'spec', '01_intent'), { recursive: true });
  writeFileSync(
    join(ws, 'spec', '01_intent', 'intent.md'),
    '---\nkind: intent\napproval: approved\napproved_at: 2026-11-20T09:00:00.000Z\n---\n# Intent\nA task manager.\n',
  );
  return ws;
}

describe('US-082: feature wizard end to end', () => {
  it('opens with the shortcut, keeps a draft and saves an approved feature intent', async () => {
    const ws = project();
    const started = await launch(tempProfile());
    app = started.app;
    const { page } = started;
    await stubFolderPicker(app, ws);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    await page.getByRole('button', { name: '＋ Add feature' }).waitFor({ timeout: 30_000 });

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+F`);
    const sheet = page.getByRole('dialog', { name: 'Add feature' });
    await sheet.getByRole('textbox', { name: 'What would you like to add or change?' }).fill('Users can comment on tasks');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await sheet.waitFor({ state: 'detached' });

    const drafts = page.getByRole('list', { name: 'Draft features' });
    await drafts.getByRole('button', { name: 'Resume Users can comment on tasks' }).click();
    await sheet.getByRole('button', { name: 'Save without AI' }).click();
    const title = sheet.getByRole('textbox', { name: 'Title' });
    await title.fill('Task comments');
    await sheet.getByLabel('Preview of spec/01_intent/FI-001-task-comments.md').waitFor();
    await sheet.getByRole('button', { name: 'Save & approve' }).click();

    await sheet.getByRole('heading', { name: 'FI-001 saved' }).waitFor();
    expect(readFileSync(join(ws, 'spec', '01_intent', 'FI-001-task-comments.md'), 'utf8')).toContain('approval: approved');
    await sheet.getByRole('button', { name: 'Back to dashboard' }).click();
    await sheet.waitFor({ state: 'detached' });
    expect(await page.getByRole('list', { name: 'Draft features' }).count()).toBe(0);
  }, 240_000);
});

describe('US-083: AI review and clarification end to end (scripted agent)', () => {
  it('reviews the FR-103 example, answers the question and saves FI-001-task-comments.md with the answer', async () => {
    const ws = project();
    await app?.close();
    const started = await launch(tempProfile(), { mockAgent: true });
    app = started.app;
    const { page } = started;
    await stubFolderPicker(app, ws);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    await page.getByRole('button', { name: '＋ Add feature' }).click({ timeout: 30_000 });

    const sheet = page.getByRole('dialog', { name: 'Add feature' });
    await sheet.getByRole('textbox', { name: 'What would you like to add or change?' }).fill('Users can comment on tasks');
    await sheet.getByRole('button', { name: 'Review with AI' }).click();
    await sheet.getByRole('region', { name: 'Enhanced draft' }).waitFor({ timeout: 60_000 });
    await sheet.getByRole('button', { name: 'Continue' }).click();
    const card = sheet.getByRole('group', { name: 'Which formatting may comments use?' });
    await card.getByRole('button', { name: 'Markdown' }).click();
    await sheet.getByRole('button', { name: 'Send answers' }).click();
    await card.getByText('Answer: Markdown').waitFor({ timeout: 60_000 });
    await sheet.getByRole('button', { name: 'Done clarifying' }).click();
    await sheet.getByLabel('Preview of spec/01_intent/FI-001-task-comments.md').waitFor();
    await sheet.getByRole('button', { name: 'Save & approve' }).click();
    await sheet.getByRole('heading', { name: 'FI-001 saved' }).waitFor();

    const content = readFileSync(join(ws, 'spec', '01_intent', 'FI-001-task-comments.md'), 'utf8');
    expect(content).toContain('| 1 | Which formatting may comments use? | Markdown |');
    expect(content).toContain('- Comments use Markdown');
  }, 240_000);
});
