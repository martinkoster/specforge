// SPDX-License-Identifier: Apache-2.0
// US-065 AC-1 (NFR-001, NFR-002): with three runs streaming ≥ 100 lines/s each into tiled live logs, interaction
// feedback stays < 100 ms (p95) and the renderer never freezes > 250 ms. Measured in the renderer with the Event
// Timing API (input → handlers → next paint) and, for freezes (main thread blocked), the Long Tasks and Long Animation
// Frames APIs. Frames delayed while the main thread is idle (GPU/compositor of the machine) are not freezes.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { allowPending, createProject, launch, moveTo, storyFile, tempProfile, waitForColumn } from './e2e-support.js';

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
});

const STORIES = ['US-001', 'US-002', 'US-003'];
const INTERACTIONS = 40;

/** Starts measuring in the renderer: interaction durations (Event Timing), long tasks and frame gaps. */
async function startMeasuring(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = { events: [] as number[], longTasks: [] as number[], blocked: [] as number[] };
    (window as unknown as { __perf: typeof m }).__perf = m;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'click' || e.name === 'pointerdown') m.events.push(e.duration);
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) m.longTasks.push(e.duration);
    }).observe({ type: 'longtask' });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) m.blocked.push((e as PerformanceEntry & { blockingDuration: number }).blockingDuration);
    }).observe({ type: 'long-animation-frame' } as PerformanceObserverInit);
  });
}

async function stopMeasuring(page: Page): Promise<{ events: number[]; longTasks: number[]; blocked: number[] }> {
  return page.evaluate(() => (window as unknown as { __perf: { events: number[]; longTasks: number[]; blocked: number[] } }).__perf);
}

/** p95 of the interactions; interactions faster than the 16 ms reporting threshold are not reported and count as 16. */
function p95(reported: number[], total: number): number {
  const all = [...reported, ...Array<number>(Math.max(0, total - reported.length)).fill(16)].sort((a, b) => a - b);
  return all[Math.ceil(all.length * 0.95) - 1]!;
}

describe('US-065 AC-1: responsiveness with three streaming runs', () => {
  it('interaction feedback < 100 ms p95 and no freeze > 250 ms', async () => {
    ({ app } = await launch(tempProfile(), { mockAgent: true }));
    const page = (await app.firstWindow()) as Page;
    const parent = mkdtempSync(join(tmpdir(), 'sf-e2e-perf-'));
    await createProject(app, page, parent, 'Perf');
    const workspace = join(parent, 'perf');
    writeFileSync(
      join(workspace, 'spec', '02_requirements', 'functional_requirements.md'),
      '---\nkind: requirements\n---\n### FR-001: X\n',
    );
    for (const id of STORIES) writeFileSync(join(workspace, 'spec', '04_user_stories', `${id}.md`), storyFile(id, `Stream logs ${id}`));

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect.poll(() => nav.getByRole('button', { name: 'Kanban' }).isEnabled(), { timeout: 30_000 }).toBe(true);
    await nav.getByRole('button', { name: 'Kanban' }).click();
    for (const id of STORIES) await waitForColumn(page, id, 'Backlog');
    for (const id of STORIES) await moveTo(page, id, 'Ready');
    for (const id of STORIES) await moveTo(page, id, 'In Progress');
    await allowPending(page);

    // Three tiled live logs.
    await nav.getByRole('button', { name: 'Executions' }).click();
    const runs = page.getByRole('table', { name: 'Runs' });
    await expect.poll(() => runs.getByText('Running').count(), { timeout: 60_000 }).toBe(3);
    await page.getByRole('checkbox', { name: /Tile/ }).check();
    for (const id of STORIES) await runs.getByRole('button', { name: new RegExp(`^${id} — `) }).click();
    await expect.poll(() => page.getByRole('article').count()).toBe(3);

    await startMeasuring(page);
    for (let i = 0; i < INTERACTIONS; i++) {
      const panel = page.getByRole('article', { name: `Run ${STORIES[i % 3]}` });
      await panel.getByRole('tab', { name: i % 2 === 0 ? 'Context' : 'Log' }).click();
      await page.waitForTimeout(100);
    }
    const measured = await stopMeasuring(page);
    // The runs were still streaming during all interactions.
    expect(await runs.getByText('Running').count()).toBe(3);

    expect(p95(measured.events, INTERACTIONS)).toBeLessThan(100);
    expect(Math.max(0, ...measured.longTasks)).toBeLessThanOrEqual(250);
    expect(Math.max(0, ...measured.blocked)).toBeLessThanOrEqual(250);
    // The runs end on their own (closing with active runs would ask first).
    await expect.poll(() => runs.getByText('Running').count(), { timeout: 60_000 }).toBe(0);
  }, 300_000);
});
