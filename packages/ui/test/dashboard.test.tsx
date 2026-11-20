// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupChecked } from './styled-controls.js';
import type { QueryOutput } from '@specforge/ipc-contract';
import { DashboardArea } from '../src/dashboard/DashboardArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
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
  maintenance: false,
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
    expect(within(artifacts).getByRole('button', { name: /^02_requirements\/fr\.md — / })).toHaveTextContent(
      'Draft · potentially impacted',
    );
    await userEvent.click(within(artifacts).getByRole('button', { name: /^01_intent\/intent\.md — / }));
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

describe('US-082 AC-1/AC-4: Add feature on the dashboard', () => {
  async function renderWith(options: { intentApproved: boolean; drafts?: { id: string; title: string }[] }) {
    const props = {
      onNextStep: vi.fn(),
      onOpenArtifact: vi.fn(),
      onOpenEpic: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenPending: vi.fn(),
      onOpenPhase: vi.fn(),
      onAddFeature: vi.fn(),
      onEditSpecs: vi.fn(),
    };
    const session = await fakeCore({
      'dashboard.get': async () => dashboard,
      'features.wizard.drafts': async () => (options.drafts ?? []).map((d) => ({ ...d, step: 'describe' as const, updatedAt: 't' })),
    });
    render(
      <DashboardArea
        session={session}
        projectId="p1"
        nextStep={nextStep}
        phases={phases}
        intentApproved={options.intentApproved}
        {...props}
      />,
    );
    await screen.findByRole('region', { name: 'Stories' });
    return props;
  }

  it('shows the split button once the main intent is approved; the menu offers Edit specs directly', async () => {
    const props = await renderWith({ intentApproved: true });
    await userEvent.click(screen.getByRole('button', { name: '＋ Add feature' }));
    expect(props.onAddFeature).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'More ways to add a feature' }));
    expect(screen.queryByRole('menuitem', { name: 'Capture idea' })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit specs directly' }));
    expect(props.onEditSpecs).toHaveBeenCalled();
  });

  it('points to the main intent before it is approved', async () => {
    const props = await renderWith({ intentApproved: false });
    expect(screen.queryByRole('button', { name: '＋ Add feature' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Approve the main intent to add features' }));
    expect(props.onOpenPhase).toHaveBeenCalledWith('intent');
  });

  it('lists unsaved feature drafts with resume', async () => {
    const props = await renderWith({ intentApproved: true, drafts: [{ id: 'w1', title: 'Task comments' }] });
    const drafts = await screen.findByRole('list', { name: 'Draft features' });
    expect(drafts).toHaveTextContent('Draft feature: Task comments');
    await userEvent.click(within(drafts).getByRole('button', { name: 'Resume Task comments' }));
    expect(props.onAddFeature).toHaveBeenCalledWith('w1');
  });
});

type FeatureRow = QueryOutput<'features.list'>[number];
const PHASE_IDS = ['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review'] as const;
const featureRow = (
  id: string,
  title: string,
  status: FeatureRow['status'],
  current: FeatureRow['current'],
  over: Partial<FeatureRow> = {},
): FeatureRow => ({
  id,
  title,
  approval: status === 'draft' ? 'draft' : 'approved',
  status,
  sourceIdea: null,
  baseline: null,
  path: `spec/01_intent/${id}.md`,
  storyCount: 0,
  phases: PHASE_IDS.map((phase) => ({
    phase,
    state: PHASE_IDS.indexOf(phase) < PHASE_IDS.indexOf(current) ? 'approved' : phase === current ? 'awaiting_approval' : 'not_started',
    unapprovedEarlier: [],
    enabled: true,
  })),
  current,
  nextStep: null,
  progress: { done: 0, total: 0 },
  ...over,
});

describe('US-085: Active features widget', () => {
  async function renderFeatures(rows: FeatureRow[]) {
    const onOpenFeature = vi.fn();
    const session = await fakeCore({ 'dashboard.get': async () => dashboard, 'features.list': async () => rows });
    render(
      <DashboardArea
        session={session}
        projectId="p1"
        nextStep={nextStep}
        phases={phases}
        onNextStep={vi.fn()}
        onOpenArtifact={vi.fn()}
        onOpenEpic={vi.fn()}
        onOpenKanban={vi.fn()}
        onOpenPending={vi.fn()}
        onOpenPhase={vi.fn()}
        onOpenFeature={onOpenFeature}
      />,
    );
    return { onOpenFeature, widget: await screen.findByRole('region', { name: 'Active features' }) };
  }

  it('AC-1/AC-4: FI-001 in Design (delta) awaiting approval and FI-002 Draft appear with their steppers, progress and next step', async () => {
    const { widget } = await renderFeatures([
      featureRow('FI-001', 'Task comments', 'in_delivery', 'design', {
        nextStep: 'Approve delta design for FI-001',
        progress: { done: 1, total: 3 },
      }),
      featureRow('FI-002', 'PDF export', 'draft', 'intent', { nextStep: 'Approve FI-002 PDF export' }),
    ]);

    const fi1 = within(widget).getByRole('listitem', { name: 'FI-001 Task comments' });
    const stepper1 = within(fi1).getByRole('list', { name: 'FI-001 phases' });
    expect(within(stepper1).getByText('Design (delta)').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(fi1).toHaveTextContent('In delivery');
    expect(fi1).toHaveTextContent('1 of 3 stories done');
    expect(fi1).toHaveTextContent('Next: Approve delta design for FI-001');
    const fi2 = within(widget).getByRole('listitem', { name: 'FI-002 PDF export' });
    expect(
      within(within(fi2).getByRole('list', { name: 'FI-002 phases' }))
        .getByText('Feature intent')
        .closest('li'),
    ).toHaveAttribute('aria-current', 'step');
    expect(fi2).toHaveTextContent('Draft');
  });

  it('AC-2/AC-3: done features are collapsed with their baseline, withdrawn ones hidden; clicking opens the feature page', async () => {
    const { widget, onOpenFeature } = await renderFeatures([
      featureRow('FI-001', 'Task comments', 'in_delivery', 'design'),
      featureRow('FI-003', 'Labels', 'done', 'epic_review', { baseline: 'spec-v1.3' }),
      featureRow('FI-004', 'Dropped', 'withdrawn', 'intent'),
    ]);
    const done = within(widget).getByText('Done features (1)').closest('details')!;
    expect(done).not.toHaveAttribute('open');
    expect(done).toHaveTextContent('FI-003 Labels · spec-v1.3');
    expect(widget).not.toHaveTextContent('FI-004');
    await userEvent.click(within(widget).getByRole('button', { name: 'Open FI-001 Task comments' }));
    expect(onOpenFeature).toHaveBeenCalledWith('FI-001');
  });
});
