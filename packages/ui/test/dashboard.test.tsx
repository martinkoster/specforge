// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { DashboardArea } from '../src/dashboard/DashboardArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

export const dashboard: QueryOutput<'dashboard.get'> = {
  storyCounts: { backlog: 2, ready: 1, in_progress: 1, review: 1, done: 3 },
  progress: { done: 3, total: 8 },
  runs: { active: 1, queued: 2 },
  pendingDecisions: 4,
  unmerged: 1,
  activity: [{ runId: 'r1', storyId: 'US-003', label: 'US-003: implementation completed', at: '2026-10-16T10:00:00.000Z' }],
  artifacts: [
    { phase: 'intent', items: [{ path: 'spec/01_intent/intent.md', approval: 'approved', impacted: false }] },
    { phase: 'requirements', items: [{ path: 'spec/02_requirements/fr.md', approval: 'draft', impacted: true }] },
    { phase: 'design', items: [] },
    { phase: 'stories', items: [] },
  ],
  epics: [{ epicId: 'EP-001', title: 'Login', status: 'in_progress', progress: { done: 1, total: 3, doneWeight: 3, totalWeight: 9 } }],
  kanbanEnabled: true,
};

const nextStep = {
  code: 'review_stories',
  label: 'Review US-003',
  reason: 'Completed implementations are waiting for your review.',
  target: { area: 'kanban', storyId: 'US-003' },
};
const phases = {
  phases: [
    { phase: 'intent' as const, state: 'approved' as const, step: 'approve' as const, enabled: true, unapprovedInputs: [] },
    { phase: 'kanban' as const, state: 'in_progress' as const, step: 'write' as const, enabled: true, unapprovedInputs: [] },
  ],
  recommended: 'kanban' as const,
};

async function renderDashboard(data = dashboard) {
  const props = {
    onNextStep: vi.fn(),
    onOpenArtifact: vi.fn(),
    onOpenEpic: vi.fn(),
    onOpenKanban: vi.fn(),
    onOpenPending: vi.fn(),
    onOpenPhase: vi.fn(),
  };
  const session = await fakeCore({ 'dashboard.get': async () => data });
  render(<DashboardArea session={session} projectId="p1" nextStep={nextStep} phases={phases} {...props} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await screen.findByRole('region', { name: 'Stories' });
  return props;
}

describe('US-061 AC-1: overview', () => {
  it('shows the stepper, the next step with its action, story counts, progress, runs, decisions and activity', async () => {
    const props = await renderDashboard();
    expect(screen.getByRole('navigation', { name: 'Phases' })).toBeInTheDocument();
    const next = screen.getByRole('region', { name: 'Next step' });
    expect(next).toHaveTextContent('Completed implementations are waiting for your review.');
    await userEvent.click(within(next).getByRole('button', { name: 'Review US-003' }));
    expect(props.onNextStep).toHaveBeenCalledWith(nextStep.target);

    const stories = screen.getByRole('region', { name: 'Stories' });
    expect(stories).toHaveTextContent('Backlog 2');
    expect(stories).toHaveTextContent('Done 3');
    expect(stories).toHaveTextContent('3 of 8 done');
    expect(screen.getByRole('region', { name: 'Runs' })).toHaveTextContent('1 running · 2 queued · 1 approved branch to merge');
    await userEvent.click(screen.getByRole('button', { name: '4 pending decisions' }));
    expect(props.onOpenPending).toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Recent activity' })).toHaveTextContent('US-003: implementation completed');
  });
});

describe('US-061 AC-2/AC-3: artifacts and epics widgets', () => {
  it('lists artifacts per phase with state and opens them; epics with status and progress filter the board', async () => {
    const props = await renderDashboard();
    const artifacts = screen.getByRole('region', { name: 'Artifacts' });
    expect(within(artifacts).getByRole('button', { name: /spec\/02_requirements\/fr\.md/ })).toHaveTextContent(
      'Draft · potentially impacted',
    );
    await userEvent.click(within(artifacts).getByRole('button', { name: /spec\/01_intent\/intent\.md/ }));
    expect(props.onOpenArtifact).toHaveBeenCalledWith('spec/01_intent/intent.md');

    const epics = screen.getByRole('region', { name: 'Epics' });
    expect(epics).toHaveTextContent('EP-001 Login · in progress · 1/3');
    await userEvent.click(within(epics).getByRole('button', { name: /EP-001/ }));
    expect(props.onOpenEpic).toHaveBeenCalledWith('EP-001');
  });
});

describe('US-061 AC-4: Kanban link', () => {
  it('is disabled with a hint and a shortcut to the user stories phase until stories exist', async () => {
    const props = await renderDashboard({ ...dashboard, kanbanEnabled: false });
    const link = screen.getByRole('button', { name: 'Open Kanban' });
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute('title', 'No user stories yet — generate or write stories first');
    await userEvent.click(screen.getByRole('button', { name: 'Go to User stories' }));
    expect(props.onOpenPhase).toHaveBeenCalledWith('stories');
  });

  it('opens the board when stories exist', async () => {
    const props = await renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Open Kanban' }));
    expect(props.onOpenKanban).toHaveBeenCalled();
  });
});

describe('US-065 AC-2: startup timing mark (NFR-003)', () => {
  it('marks the first time the project screen shows its data', async () => {
    performance.clearMarks();
    await renderDashboard();
    await vi.waitFor(() => expect(performance.getEntriesByName('specforge:project-interactive')).toHaveLength(1));
  });
});
