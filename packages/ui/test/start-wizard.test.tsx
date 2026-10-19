// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartWizard, type RecentProject } from '../src/projects/StartWizard.js';

afterEach(cleanup);

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
  {
    id: 'p2',
    name: 'Billing',
    path: 'C:\\work\\billing',
    lastOpenedAt: null,
    phase: null,
    phaseLabel: null,
    missing: true,
  },
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

const row = (name: string) => screen.getByRole('listitem', { name });

describe('US-017 AC-1: start wizard', () => {
  it('offers Open existing project and Create new project', async () => {
    const props = renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Open existing project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create new project' }));

    expect(props.onOpenExisting).toHaveBeenCalled();
    expect(props.onCreateNew).toHaveBeenCalled();
  });

  it('lists recent projects with name, path, last opened and phase', async () => {
    const props = renderWizard();
    const item = row('Task Manager');

    expect(within(item).getByText('C:\\work\\tasks')).toBeInTheDocument();
    expect(within(item).getByText('Design · awaiting approval')).toBeInTheDocument();
    expect(within(item).getByText(/Last opened/)).toHaveTextContent('2026');
    expect(within(row('Billing')).getByText('Never opened')).toBeInTheDocument();

    await userEvent.click(within(item).getByRole('button', { name: 'Open Task Manager' }));
    expect(props.onOpenRecent).toHaveBeenCalledWith('p1');
  });

  it('shows actions without a handler as disabled', () => {
    renderWizard({ onOpenExisting: undefined, onCreateNew: undefined, onLocate: undefined });

    expect(screen.getByRole('button', { name: 'Open existing project' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create new project' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Locate Billing' })).toHaveAttribute('title', 'Not available yet');
  });

  it('shows a hint when there are no recent projects', () => {
    renderWizard({ recent: [] });
    expect(screen.getByText('No recent projects')).toBeInTheDocument();
  });
});

describe('US-017 AC-2: rename and remove', () => {
  it('renames a project inline', async () => {
    const props = renderWizard();
    const item = row('Task Manager');

    await userEvent.click(within(item).getByRole('button', { name: 'Rename Task Manager' }));
    const input = within(item).getByRole('textbox', { name: 'Project name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tasks v2{Enter}');

    expect(props.onRename).toHaveBeenCalledWith('p1', 'Tasks v2');
  });

  it('removes a project after confirmation, leaving files untouched', async () => {
    const props = renderWizard();
    const item = row('Task Manager');

    await userEvent.click(within(item).getByRole('button', { name: 'Remove Task Manager' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('files in C:\\work\\tasks are not deleted');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove from list' }));

    expect(props.onRemove).toHaveBeenCalledWith('p1');
  });

  it('shows why a removal was refused (active runs)', async () => {
    renderWizard({ onRemove: vi.fn(async () => Promise.reject(new Error('Tasks has 2 active runs. Cancel them first.'))) });

    await userEvent.click(within(row('Task Manager')).getByRole('button', { name: 'Remove Task Manager' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('2 active runs');
  });
});

describe('US-017 AC-3: missing folder', () => {
  it('offers Locate and Remove from list instead of opening', async () => {
    const props = renderWizard();
    const item = row('Billing');

    expect(within(item).getByText('Folder not found')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Open Billing' })).not.toBeInTheDocument();
    await userEvent.click(within(item).getByRole('button', { name: 'Locate Billing' }));
    expect(props.onLocate).toHaveBeenCalledWith('p2');

    await userEvent.click(within(item).getByRole('button', { name: 'Remove Billing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    expect(props.onRemove).toHaveBeenCalledWith('p2');
  });
});
