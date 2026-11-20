// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-072 (UF-00, UF-09, NFR-033, ui_design_concept.md §4.1, §5): sidebar, top bar, page header, banners, phase stepper.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Callout, PageHeader } from '../src/components/index.js';
import { AppShell, type ShellState } from '../src/shell/AppShell.js';
import { PhaseStepper, type PhaseStatus } from '../src/shell/PhaseStepper.js';
import { cleanupChecked } from './styled-controls.js';

const state = (overrides: Partial<ShellState> = {}): ShellState => ({
  projects: [{ id: 'p1', name: 'Task Manager' }],
  currentProjectId: 'p1',
  vcs: { mode: 'git', branch: 'main' },
  runs: { running: 2, queued: 1 },
  pendingDecisions: 3,
  storyCount: 12,
  ...overrides,
});

function mockWidth(narrow: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: narrow && query === '(max-width: 1279px)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return render(
    <AppShell
      state={state()}
      coreStatus="connected"
      active="dashboard"
      onNavigate={() => undefined}
      onSwitchProject={() => undefined}
      onOpenPendingDecisions={() => undefined}
      specChanges={2}
      onOpenSpecCommit={() => undefined}
      {...props}
    >
      <p>content</p>
    </AppShell>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockWidth(false);
});
afterEach(cleanupChecked);

describe('US-072 AC-1: sidebar', () => {
  it('shows icon and label per area, highlights the active one and pins Settings to the bottom', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const item of within(nav).getAllByRole('button')) {
      expect(item).toHaveClass('nav-item');
      expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(item.querySelector('.nav-label')).not.toBeNull();
    }
    expect(within(nav).getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Settings' }).closest('.nav-bottom')).not.toBeNull();
    expect(within(nav).getByRole('button', { name: 'Executions' }).closest('.nav-bottom')).toBeNull();
  });

  it('collapses to icons only, remembers the choice and keeps the accessible names', async () => {
    const { unmount } = renderShell();
    const sidebar = document.querySelector('.sidebar')!;
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeInTheDocument();
    expect(localStorage.getItem('specforge.sidebar')).toBe('collapsed');
    unmount();

    renderShell();
    expect(document.querySelector('.sidebar')).toHaveAttribute('data-collapsed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.sidebar')).toHaveAttribute('data-collapsed', 'false');
    expect(localStorage.getItem('specforge.sidebar')).toBe('expanded');
  });

  it('collapses automatically below 1280 px window width unless the user expanded it', () => {
    mockWidth(true);
    const { unmount } = renderShell();
    expect(document.querySelector('.sidebar')).toHaveAttribute('data-collapsed', 'true');
    unmount();

    localStorage.setItem('specforge.sidebar', 'expanded');
    renderShell();
    expect(document.querySelector('.sidebar')).toHaveAttribute('data-collapsed', 'false');
  });
});

describe('US-072 AC-2: top bar', () => {
  it('shows the app mark, project switcher, VCS badge, run indicator, pending bell with count and the commit indicator', () => {
    renderShell();
    const bar = document.querySelector('.top-bar') as HTMLElement;

    expect(within(bar).getByText('SpecForge').closest('.app-mark')).not.toBeNull();
    expect(within(bar).getByRole('combobox', { name: 'Project' })).toHaveClass('select');
    const vcs = within(bar).getByText('Git · main').closest('.badge')!;
    expect(vcs).toHaveClass('badge-neutral');
    expect(vcs.querySelector('svg')).not.toBeNull();
    expect(within(bar).getByText('2 running · 1 queued')).toBeInTheDocument();

    const bell = within(bar).getByRole('button', { name: '3 pending decisions' });
    expect(bell).toHaveClass('btn-ghost', 'pending-decisions');
    expect(within(bell).getByText('3')).toHaveClass('pill');
    expect(bell.querySelector('svg')).not.toBeNull();
    expect(within(bar).getByRole('button', { name: '2 spec files changed' })).toHaveClass('btn-ghost');
  });

  it('marks a non-git project as warning and shows no counter without pending decisions', () => {
    renderShell({ state: state({ vcs: { mode: 'none' }, pendingDecisions: 0 }) });
    expect(screen.getByText('No Git — runs are not isolated').closest('.badge')).toHaveClass('badge-warning');
    const bell = screen.getByRole('button', { name: 'No pending decisions' });
    expect(bell.querySelector('.pill')).toBeNull();
  });
});

describe('US-072 AC-3: page header and banners', () => {
  it('page header: title, description and actions', () => {
    render(
      <PageHeader
        title="Specifications"
        description="Requirements, design and user stories."
        actions={
          <button type="button" className="btn btn-primary">
            Generate
          </button>
        }
      />,
    );
    const header = document.querySelector('.page-header')!;
    expect(within(header as HTMLElement).getByRole('heading', { level: 1, name: 'Specifications' })).toBeInTheDocument();
    expect(header).toHaveTextContent('Requirements, design and user stories.');
    expect(header.querySelector('.page-actions')).toContainElement(screen.getByRole('button', { name: 'Generate' }));
  });

  it('banners sit full width under the top bar, above the area content', () => {
    renderShell({ banners: <Callout tone="warning">No Git repository</Callout> });
    const banners = document.querySelector('.shell-banners')!;
    expect(banners).toHaveTextContent('No Git repository');
    expect(banners.compareDocumentPosition(screen.getByText('content')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('US-072 AC-4: phase stepper', () => {
  const status: PhaseStatus = {
    phases: [
      { phase: 'intent', state: 'approved', step: 'approve', enabled: true, unapprovedInputs: [] },
      { phase: 'requirements', state: 'awaiting_approval', step: 'quality_check', enabled: true, unapprovedInputs: [] },
      { phase: 'design', state: 'not_started', step: 'write', enabled: true, unapprovedInputs: [] },
      { phase: 'stories', state: 'not_started', step: 'write', enabled: true, unapprovedInputs: [] },
      { phase: 'kanban', state: 'not_started', step: 'write', enabled: false, unapprovedInputs: [] },
    ],
    recommended: 'requirements',
    maintenance: false,
  };

  it('shows each step with a status icon and its label; names and keyboard access are unchanged', async () => {
    const onOpen = vi.fn();
    render(<PhaseStepper status={status} current="requirements" onOpen={onOpen} />);
    const steps = within(screen.getByRole('navigation', { name: 'Phases' })).getAllByRole('button');

    expect(steps[0]).toHaveClass('phase-step', 'phase-done');
    expect(steps[1]).toHaveClass('phase-step', 'phase-current');
    expect(steps[4]).toHaveClass('phase-step', 'phase-blocked');
    for (const step of steps) expect(step.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(steps[0]).toHaveAccessibleName('Intent · approved');

    steps[2]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('design');
  });
});
