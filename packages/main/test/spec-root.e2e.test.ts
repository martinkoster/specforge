// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-078 AC-4, ADR-024): a project whose specification root is `docs/spec` — the intent and generated
// requirements land below it, an implementation run may not write there, and a top-level `spec/` folder (RSpec-style)
// stays ordinary code. Scripted agent, non-git mode (runs write the main workspace directly).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { allowPending, closePendingPanel, launch, moveTo, storyFile, stubFolderPicker, tempProfile, waitForColumn } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

function adoptedLayout(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'sf-e2e-root-'));
  mkdirSync(join(workspace, '.specforge'));
  writeFileSync(join(workspace, '.specforge', 'project.yaml'), 'id: e2e-root\nname: Rooted\nschemaVersion: 1\nspecRoot: docs/spec\n');
  for (const folder of ['01_intent', '02_requirements', '03_design', '04_user_stories', '05_test_concepts']) {
    mkdirSync(join(workspace, 'docs', 'spec', folder), { recursive: true });
  }
  mkdirSync(join(workspace, 'spec'));
  writeFileSync(join(workspace, 'spec', 'user_spec.rb'), 'describe "user" do\nend\n');
  return workspace;
}

describe('US-078 AC-4: specification root docs/spec end to end', () => {
  it('writes specifications below docs/spec and keeps implementation runs out of it, but not out of spec/', async () => {
    const workspace = adoptedLayout();
    const started = await launch(tempProfile(), { mockAgent: true });
    app = started.app;
    const { page } = started;

    await stubFolderPicker(app, workspace);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    // The project is open once the shell shows it; the specification root is shown as the switcher's tooltip (AC-3).
    const switcher = page.getByRole('combobox', { name: 'Project' });
    await expect.poll(() => switcher.getAttribute('title'), { timeout: 30_000 }).toBe('Specifications in docs/spec/');
    const primary = page.getByRole('navigation', { name: 'Primary' });
    await primary.getByRole('button', { name: 'Intent' }).click();

    // Intent from the template, below the specification root.
    await page.getByRole('button', { name: 'Start from the template' }).click();
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await approve.click();
    await approve.waitFor({ state: 'detached' });
    expect(existsSync(join(workspace, 'docs', 'spec', '01_intent', 'intent.md'))).toBe(true);
    expect(existsSync(join(workspace, 'spec', '01_intent'))).toBe(false);

    // Requirements generated into docs/spec/02_requirements.
    await primary.getByRole('button', { name: 'Specifications' }).click();
    await page.getByRole('combobox', { name: 'Target' }).selectOption({ label: 'Requirements' });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await allowPending(page, { close: false });
    const review = page.getByRole('dialog', { name: 'Review changes in docs/spec/02_requirements' });
    await review.waitFor({ timeout: 60_000 });
    await review.getByRole('button', { name: 'Keep' }).click();
    await review.waitFor({ state: 'detached' });
    await closePendingPanel(page);
    expect(existsSync(join(workspace, 'docs', 'spec', '02_requirements', 'functional_requirements.md'))).toBe(true);
    expect(readdirSync(join(workspace, 'spec'))).toEqual(['user_spec.rb']);

    // An implementation run: writing docs/spec/** is denied, spec/ is ordinary code.
    writeFileSync(join(workspace, 'docs', 'spec', '04_user_stories', 'US-001.md'), storyFile('US-001', 'Spec probe'));
    const kanban = primary.getByRole('button', { name: 'Kanban' });
    await expect.poll(() => kanban.isEnabled(), { timeout: 30_000 }).toBe(true);
    await kanban.click();
    await waitForColumn(page, 'US-001', 'Backlog');
    await moveTo(page, 'US-001', 'Ready');
    await moveTo(page, 'US-001', 'In Progress');
    await allowPending(page);
    await waitForColumn(page, 'US-001', 'Review', 90_000);
    expect(existsSync(join(workspace, 'src', 'us-001.ts'))).toBe(true);
    expect(existsSync(join(workspace, 'spec', 'probe_spec.rb'))).toBe(true);
    expect(existsSync(join(workspace, 'docs', 'spec', 'probe.md'))).toBe(false);
  }, 300_000);
});
