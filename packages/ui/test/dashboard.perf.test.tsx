// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-061 AC-5 (NFR-030): the dashboard renders in under 1 s for a project with 1,000 stories and runs.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardArea } from '../src/dashboard/DashboardArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

describe('US-061 AC-5: dashboard render time', () => {
  it('renders 1,000 artifacts and 100 epics in under 1 s', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      path: `spec/04_user_stories/US-${i}.md`,
      approval: 'approved' as const,
      impacted: i % 10 === 0,
    }));
    const data = {
      storyCounts: { backlog: 200, ready: 200, in_progress: 200, review: 200, done: 200 },
      progress: { done: 200, total: 1000 },
      runs: { active: 3, queued: 20 },
      pendingDecisions: 4,
      unmerged: 2,
      activity: Array.from({ length: 10 }, (_, i) => ({
        runId: `r${i}`,
        storyId: `US-${i}`,
        label: `US-${i}: implementation completed`,
        at: '2026-10-16T10:00:00.000Z',
      })),
      artifacts: [
        { phase: 'intent' as const, items: [] },
        { phase: 'requirements' as const, items: [] },
        { phase: 'design' as const, items: [] },
        { phase: 'stories' as const, items },
      ],
      epics: Array.from({ length: 100 }, (_, i) => ({
        epicId: `EP-${i}`,
        title: `Epic ${i}`,
        status: 'in_progress' as const,
        progress: { done: 5, total: 10, doneWeight: 15, totalWeight: 30 },
      })),
      kanbanEnabled: true,
    };
    const session = await fakeCore({ 'dashboard.get': async () => data });
    const started = performance.now();
    render(
      <DashboardArea
        session={session}
        projectId="p1"
        nextStep={null}
        phases={null}
        onNextStep={() => undefined}
        onOpenArtifact={() => undefined}
        onOpenEpic={() => undefined}
        onOpenKanban={() => undefined}
        onOpenPending={() => undefined}
        onOpenPhase={() => undefined}
      />,
    );
    await screen.findByText('spec/04_user_stories/US-999.md — Approved');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
