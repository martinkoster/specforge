// SPDX-License-Identifier: Apache-2.0
// End-to-end (US-038): drag a card with the mouse; the move goes through the core and is written to the story file.
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

const story = (id: string, status: string, approval = 'approved') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: ${approval}\nstatus: ${status}\nsize: S\n---\nBody\n`;

describe('US-038 end-to-end: Kanban drag & drop', () => {
  it('drags a card from Backlog to Ready; an unapproved card snaps back with the explanation', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'sf-e2e-board-'));
    mkdirSync(join(ws, '.specforge'));
    writeFileSync(join(ws, '.specforge', 'project.yaml'), 'id: e2e-board\nname: Board E2E\n');
    mkdirSync(join(ws, 'spec', '04_user_stories'), { recursive: true });
    writeFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), story('US-001', 'backlog'));
    writeFileSync(join(ws, 'spec', '04_user_stories', 'US-002.md'), story('US-002', 'backlog', 'draft'));

    const started = await launch(tempProfile());
    app = started.app;
    const { page } = started;
    await stubFolderPicker(app, ws);
    await page.getByRole('button', { name: 'Open existing project' }).click();
    await page.getByRole('button', { name: 'Close project' }).waitFor();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Kanban' }).click();

    const drag = async (storyId: string, column: string) => {
      const handle = page.getByRole('button', { name: `Drag ${storyId}` });
      const target = page.getByRole('region', { name: new RegExp(`^${column} \\(`) });
      // Cards animate into place after a move (dnd-kit transitions); grab the handle once it stopped moving.
      let from = (await handle.boundingBox())!;
      for (;;) {
        await page.waitForTimeout(100);
        const now = (await handle.boundingBox())!;
        if (now.x === from.x && now.y === from.y) break;
        from = now;
      }
      const to = (await target.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 15 });
      // dnd-kit resolves the drop target on animation frames; let the pointer settle over the column.
      await page.waitForTimeout(150);
      await page.mouse.move(to.x + to.width / 2, to.y + to.height - 24);
      await page.waitForTimeout(150);
      await page.mouse.up();
    };

    await drag('US-001', 'Ready');
    await page.getByRole('region', { name: 'Ready (1)' }).getByRole('article', { name: 'US-001 Story US-001' }).waitFor();
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), 'utf8')).toContain('status: ready');

    await drag('US-002', 'Ready');
    await page.getByRole('alert').filter({ hasText: 'US-002: Approve this story before moving it to Ready.' }).waitFor();
    expect(await page.getByRole('region', { name: 'Backlog (1)' }).getByRole('article', { name: 'US-002 Story US-002' }).count()).toBe(1);
  }, 240_000);
});
