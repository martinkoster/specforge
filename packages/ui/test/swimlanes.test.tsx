// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard, resolveDrop, type BoardData } from '../src/board/KanbanBoard.js';
import { KanbanArea } from '../src/board/KanbanArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const card = (storyId: string, status: 'backlog' | 'ready' | 'done', epicId: string | null) => ({
  storyId,
  title: `Story ${storyId}`,
  size: 'M',
  approval: 'approved' as const,
  status,
  subState: 'none' as const,
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  dependsOn: [],
  related: [],
  epicId,
});

const board: BoardData = {
  columns: [
    { status: 'backlog', cards: [card('US-003', 'backlog', null)] },
    { status: 'ready', cards: [card('US-002', 'ready', 'EP-002')] },
    { status: 'in_progress', cards: [] },
    { status: 'review', cards: [] },
    { status: 'done', cards: [card('US-001', 'done', 'EP-001')] },
  ],
  lanes: [
    {
      epicId: 'EP-001',
      title: 'Login',
      status: 'ready_for_review',
      progress: { done: 1, total: 1, doneWeight: 3, totalWeight: 3 },
      colour: 0,
    },
    {
      epicId: 'EP-002',
      title: 'Profile',
      status: 'not_started',
      progress: { done: 0, total: 1, doneWeight: 0, totalWeight: 3 },
      colour: 1,
    },
    { epicId: null, title: 'No epic', status: 'not_started', progress: { done: 0, total: 1, doneWeight: 0, totalWeight: 3 }, colour: null },
  ],
  queue: [],
  slots: { active: 0, limit: 3 },
};

const renderBoard = (props: Partial<Parameters<typeof KanbanBoard>[0]> = {}) => {
  const onSetEpic = vi.fn(async () => ({}));
  const onReorderLanes = vi.fn(async () => ({}));
  const onMove = vi.fn(async () => ({ ok: true as const }));
  render(<KanbanBoard board={board} layout="epic" onMove={onMove} onSetEpic={onSetEpic} onReorderLanes={onReorderLanes} {...props} />);
  return { onSetEpic, onReorderLanes, onMove };
};

describe('US-039 AC-1: lanes by epic', () => {
  it('shows one lane per epic plus No epic with ID, title, derived status and progress (count and size-weighted)', () => {
    renderBoard();
    const lanes = screen.getAllByRole('region', { name: /^Lane / });
    expect(lanes.map((l) => l.getAttribute('aria-label'))).toEqual(['Lane EP-001 Login', 'Lane EP-002 Profile', 'Lane No epic']);
    expect(lanes[0]).toHaveTextContent('ready for review');
    expect(lanes[0]).toHaveTextContent('1/1 done · 3/3 points');
    expect(within(lanes[1]!).getByRole('region', { name: 'EP-002 Profile · Ready (1)' })).toHaveTextContent('US-002');
    expect(within(lanes[2]!).getByRole('region', { name: 'No epic · Backlog (1)' })).toHaveTextContent('US-003');
  });

  it('cards show an epic colour tag, also in the flat view', () => {
    const { unmount } = render(<KanbanBoard board={board} layout="flat" onMove={async () => ({ ok: true })} />);
    expect(screen.queryAllByRole('region', { name: /^Lane / })).toHaveLength(0);
    expect(screen.getByText('EP-002', { selector: '.epic-tag' })).toHaveClass('epic-colour-1');
    unmount();
  });
});

describe('US-039 AC-2: collapse, filter, reorder, flat toggle', () => {
  it('collapses a lane but keeps its header with counts; filters by epic', async () => {
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse EP-001 Login' }));
    const lane = screen.getByRole('region', { name: 'Lane EP-001 Login' });
    expect(within(lane).queryByText('US-001')).not.toBeInTheDocument();
    expect(lane).toHaveTextContent('1/1 done');
    await userEvent.click(screen.getByRole('button', { name: 'Expand EP-001 Login' }));
    expect(within(lane).getByText('US-001')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Epic filter' }), 'EP-002');
    expect(screen.getAllByRole('region', { name: /^Lane / }).map((l) => l.getAttribute('aria-label'))).toEqual(['Lane EP-002 Profile']);
  });

  it('reorders lanes with the buttons and by dragging a lane header', async () => {
    const { onReorderLanes } = renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Move lane EP-002 up' }));
    expect(onReorderLanes).toHaveBeenLastCalledWith(['EP-002', 'EP-001']);

    const headers = screen.getAllByRole('region', { name: /^Lane EP/ }).map((l) => l.querySelector('header')!);
    fireEvent.dragStart(headers[0]!);
    fireEvent.dragOver(headers[1]!);
    fireEvent.drop(headers[1]!);
    expect(onReorderLanes).toHaveBeenLastCalledWith(['EP-002', 'EP-001']);
  });

  it('toggles between board by epic (default with epics) and flat in the Kanban area', async () => {
    const session = await fakeCore({ 'board.get': async () => board });
    render(<KanbanArea session={session} projectId="p1" onChanged={() => undefined} />);
    expect(await screen.findAllByRole('region', { name: /^Lane / })).toHaveLength(3);
    await userEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    expect(screen.queryAllByRole('region', { name: /^Lane / })).toHaveLength(0);
    await userEvent.click(screen.getByRole('radio', { name: 'By epic' }));
    expect(screen.getAllByRole('region', { name: /^Lane / })).toHaveLength(3);
  });
});

describe('US-039 AC-3: moving a card into another lane', () => {
  it('drop targets carry the lane epic', () => {
    expect(resolveDrop(board, 'US-003', 'lane:EP-002:ready')).toEqual({ to: 'ready', beforeStoryId: null, epicId: 'EP-002' });
    expect(resolveDrop(board, 'US-002', 'lane:none:backlog')).toEqual({ to: 'backlog', beforeStoryId: null, epicId: null });
    expect(resolveDrop(board, 'US-003', 'US-002')).toEqual({ to: 'ready', beforeStoryId: 'US-002', epicId: 'EP-002' });
  });

  it('asks for confirmation, then writes the epic (and keeps the status when only the lane changes)', async () => {
    const { onSetEpic, onMove } = renderBoard();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move US-003 to epic' }), 'EP-002');
    const confirm = screen.getByRole('alertdialog', { name: 'Move US-003 to another epic?' });
    expect(confirm).toHaveTextContent('US-003 will belong to EP-002.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(onSetEpic).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move US-002 to epic' }), 'none');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('US-002 will have no epic.');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move' }));
    expect(onSetEpic).toHaveBeenCalledWith('US-002', null);
    expect(onMove).not.toHaveBeenCalled();
  });
});
