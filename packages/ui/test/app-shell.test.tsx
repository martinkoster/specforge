// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, type ShellState } from '../src/shell/AppShell.js';

afterEach(cleanup);

const state = (overrides: Partial<ShellState> = {}): ShellState => ({
  projects: [
    { id: 'p1', name: 'Task Manager' },
    { id: 'p2', name: 'Billing' },
  ],
  currentProjectId: 'p1',
  vcs: { mode: 'git', branch: 'main' },
  runs: { running: 2, queued: 1 },
  pendingDecisions: 3,
  storyCount: 12,
  ...overrides,
});

function renderShell(overrides: Partial<ShellState> = {}, active: Parameters<typeof AppShell>[0]['active'] = 'dashboard') {
  const onNavigate = vi.fn();
  const onSwitchProject = vi.fn();
  const onOpenPendingDecisions = vi.fn();
  render(
    <AppShell
      state={state(overrides)}
      coreStatus="connected"
      active={active}
      onNavigate={onNavigate}
      onSwitchProject={onSwitchProject}
      onOpenPendingDecisions={onOpenPendingDecisions}
    >
      <p>content</p>
    </AppShell>,
  );
  return { onNavigate, onSwitchProject, onOpenPendingDecisions };
}

describe('US-022 AC-1: primary navigation', () => {
  it('shows the seven areas in order and marks the active one', () => {
    renderShell({}, 'intent');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const items = within(nav).getAllByRole('button');

    expect(items.map((b) => b.textContent)).toEqual([
      'Dashboard',
      'Projects',
      'Intent',
      'Specifications',
      'Kanban',
      'Executions',
      'Settings',
    ]);
    expect(within(nav).getByRole('button', { name: 'Intent' })).toHaveAttribute('aria-current', 'page');
  });

  it('disables Kanban until stories exist and explains why', () => {
    renderShell({ storyCount: 0 });
    const kanban = screen.getByRole('button', { name: 'Kanban' });

    expect(kanban).toBeDisabled();
    expect(kanban).toHaveAttribute('title', 'No user stories yet — generate or write stories first');
  });

  it('navigates when an area is clicked', async () => {
    const { onNavigate } = renderShell();

    await userEvent.click(screen.getByRole('button', { name: 'Kanban' }));

    expect(onNavigate).toHaveBeenCalledWith('kanban');
  });
});

describe('US-022 AC-2: top bar', () => {
  it('shows the project switcher with the current project and switches projects', async () => {
    const { onSwitchProject } = renderShell();
    const switcher = screen.getByRole('combobox', { name: 'Project' });

    expect(switcher).toHaveValue('p1');
    await userEvent.selectOptions(switcher, 'p2');
    expect(onSwitchProject).toHaveBeenCalledWith('p2');
  });

  it('shows the git badge with branch, or the isolation warning without git', () => {
    renderShell();
    expect(screen.getByText('Git · main')).toBeInTheDocument();
    cleanup();

    renderShell({ vcs: { mode: 'none' } });
    expect(screen.getByText('No Git — runs are not isolated')).toBeInTheDocument();
  });

  it('shows the run indicator and the pending-decisions counter', async () => {
    const { onOpenPendingDecisions } = renderShell();

    expect(screen.getByText('2 running · 1 queued')).toBeInTheDocument();
    const pending = screen.getByRole('button', { name: '3 pending decisions' });
    await userEvent.click(pending);
    expect(onOpenPendingDecisions).toHaveBeenCalled();
  });

  it('shows "No active runs" and no counter badge when idle', () => {
    renderShell({ runs: { running: 0, queued: 0 }, pendingDecisions: 0 });

    expect(screen.getByText('No active runs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No pending decisions' })).toBeInTheDocument();
  });

  it('shows the core connection status', () => {
    renderShell();
    expect(screen.getByTestId('core-status')).toHaveTextContent('connected');
  });
});

describe('US-022 AC-3: keyboard access', () => {
  it('reaches every area with Tab and activates it with Enter', async () => {
    const { onNavigate } = renderShell();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    onNavigate.mockClear();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Projects' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('projects');
  });

  it('navigates with Ctrl+1…7 shortcuts and ignores the shortcut of a disabled area', async () => {
    const { onNavigate } = renderShell({ storyCount: 0 });
    const user = userEvent.setup();

    await user.keyboard('{Control>}3{/Control}');
    await user.keyboard('{Control>}5{/Control}');
    await user.keyboard('{Control>}7{/Control}');

    expect(onNavigate.mock.calls).toEqual([['intent'], ['settings']]);
  });

  it('labels shortcuts for assistive technology', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-keyshortcuts', 'Control+7');
  });
});
