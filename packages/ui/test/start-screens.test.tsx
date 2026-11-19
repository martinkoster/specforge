// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-073 (UF-01b, NFR-029, NFR-033, ui_design_concept.md §4.2): start cards, recent list, empty states and skeletons.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState, Skeleton } from '../src/components/index.js';
import { ArtifactList } from '../src/specs/ArtifactList.js';
import { PendingDecisionsPanel } from '../src/pending/PendingDecisionsPanel.js';
import { StartWizard, type RecentProject } from '../src/projects/StartWizard.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(cleanupChecked);

const recent: RecentProject[] = [
  {
    id: 'p1',
    name: 'Task Manager',
    path: 'C:\\work\\tasks',
    lastOpenedAt: '2026-10-14T09:00:00.000Z',
    phase: { phase: 'design', state: 'awaiting_approval' },
    phaseLabel: 'Design · awaiting approval',
    missing: false,
  },
  { id: 'p2', name: 'Billing', path: 'C:\\work\\billing', lastOpenedAt: null, phase: null, phaseLabel: null, missing: true },
];

function renderWizard(overrides: Partial<Parameters<typeof StartWizard>[0]> = {}) {
  const props = {
    recent,
    onOpenExisting: vi.fn(),
    onCreateNew: vi.fn(),
    onOpenRecent: vi.fn(),
    onRename: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    onLocate: vi.fn(),
    ...overrides,
  };
  render(<StartWizard {...props} />);
  return props;
}

describe('US-073 AC-1: start wizard', () => {
  it('shows Open and Create as interactive cards with icon, title and explanation', () => {
    renderWizard();
    for (const name of ['Open existing project', 'Create new project']) {
      const card = screen.getByRole('button', { name });
      expect(card).toHaveClass('start-card');
      expect(card.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(card).toHaveAccessibleDescription(/.+/);
    }
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to SpecForge' })).toBeInTheDocument();
  });

  it('lists recent projects with mono path, phase badge, last opened and a row menu', async () => {
    const props = renderWizard();
    const item = screen.getByRole('listitem', { name: 'Task Manager' });

    expect(within(item).getByText('C:\\work\\tasks')).toHaveClass('path');
    const phase = within(item).getByText('Design · awaiting approval').closest('.badge')!;
    expect(phase).toHaveClass('badge-warning');
    expect(phase.querySelector('svg')).not.toBeNull();

    await userEvent.click(within(item).getByRole('button', { name: 'Actions for Task Manager' }));
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from list' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove from list' }));
    expect(props.onRemove).toHaveBeenCalledWith('p1');
  });

  it('renames through the row menu; a missing folder keeps Locate visible and has no Rename', async () => {
    const props = renderWizard();
    const item = screen.getByRole('listitem', { name: 'Task Manager' });
    await userEvent.click(within(item).getByRole('button', { name: 'Actions for Task Manager' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await within(item).findByRole('textbox', { name: 'Project name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tasks v2{Enter}');
    expect(props.onRename).toHaveBeenCalledWith('p1', 'Tasks v2');

    const missing = screen.getByRole('listitem', { name: 'Billing' });
    expect(within(missing).getByText('Folder not found').closest('.badge')).toHaveClass('badge-warning');
    await userEvent.click(within(missing).getByRole('button', { name: 'Locate Billing' }));
    expect(props.onLocate).toHaveBeenCalledWith('p2');
    await userEvent.click(within(missing).getByRole('button', { name: 'Actions for Billing' }));
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: 'Remove from list' })).toBeInTheDocument();
  });
});

describe('US-073 AC-3: empty states', () => {
  it('empty state: icon, title, explanation and an optional primary action', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No stories yet"
        description="Generate stories from the approved design."
        action={{ label: 'Generate stories', onClick: onAction }}
      />,
    );
    const empty = document.querySelector('.empty-state')!;
    expect(empty.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(within(empty as HTMLElement).getByText('No stories yet')).toHaveClass('empty-state-title');
    expect(empty).toHaveTextContent('Generate stories from the approved design.');
    await userEvent.click(screen.getByRole('button', { name: 'Generate stories' }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate stories' })).toHaveClass('btn-primary');
  });

  it('is used for no recent projects, no artifacts and no pending decisions', () => {
    renderWizard({ recent: [] });
    expect(screen.getByText('No recent projects').closest('.empty-state')).not.toBeNull();
    cleanupChecked();

    render(<ArtifactList groups={[]} selected={null} onSelect={() => undefined} />);
    expect(screen.getByText(/No specifications yet/).closest('.empty-state')).not.toBeNull();
    cleanupChecked();

    render(
      <PendingDecisionsPanel groups={[]} onDecide={async () => ({ ok: true })} onOpenBoard={() => undefined} onClose={() => undefined} />,
    );
    expect(screen.getByText('Nothing is waiting for you.').closest('.empty-state')).not.toBeNull();
  });
});

describe('US-073 AC-4: skeletons', () => {
  it('skeleton placeholders announce a busy state instead of "Loading…" text', () => {
    render(<Skeleton label="Loading the board" lines={3} />);
    const skeleton = screen.getByRole('status', { name: 'Loading the board' });
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton.querySelectorAll('.skeleton-line')).toHaveLength(3);
    expect(skeleton).not.toHaveTextContent('Loading');
  });
});
