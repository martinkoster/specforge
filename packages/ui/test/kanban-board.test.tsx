// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard, resolveDrop, type BoardData } from '../src/board/KanbanBoard.js';

afterEach(cleanup);

const card = (
  storyId: string,
  status: BoardData['columns'][number]['status'],
  overrides: Partial<BoardData['columns'][number]['cards'][number]> = {},
) => ({
  storyId,
  title: `Story ${storyId}`,
  size: 'M' as string | null,
  approval: 'approved' as const,
  status,
  subState: (status === 'in_progress' ? 'running' : 'none') as BoardData['columns'][number]['cards'][number]['subState'],
  queueReason: null as BoardData['columns'][number]['cards'][number]['queueReason'],
  waitingFor: [] as string[],
  statusNotice: null as string | null,
  dependsOn: [] as string[],
  related: [] as string[],
  ...overrides,
});

const board: BoardData = {
  columns: [
    { status: 'backlog', cards: [card('US-003', 'backlog', { approval: 'draft', size: null })] },
    { status: 'ready', cards: [card('US-001', 'ready'), card('US-004', 'ready')] },
    {
      status: 'in_progress',
      cards: [
        card('US-002', 'in_progress', { subState: 'queued', queueReason: 'dependency', waitingFor: ['US-001'] }),
        card('US-005', 'in_progress', { subState: 'failed', statusNotice: 'No agent adapter is available.' }),
      ],
    },
    { status: 'review', cards: [] },
    { status: 'done', cards: [] },
  ],
  queue: ['US-002'],
  slots: { active: 1, limit: 3 },
};

describe('US-038 AC-1: five columns with cards', () => {
  it('shows the columns with counts and cards with ID, title, size, approval and execution indicator', () => {
    render(<KanbanBoard board={board} onMove={vi.fn()} />);

    const columns = screen.getAllByRole('region');
    expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Backlog (1)',
      'Ready (2)',
      'In Progress (2)',
      'Review (0)',
      'Done (0)',
    ]);

    const draft = screen.getByRole('article', { name: 'US-003 Story US-003' });
    expect(within(draft).getByText('Draft')).toBeInTheDocument();
    const ready = screen.getByRole('article', { name: 'US-001 Story US-001' });
    expect(within(ready).getByText('M')).toBeInTheDocument();
    expect(within(ready).getByText('Approved')).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'US-002 Story US-002' })).getByText('Waiting for US-001 (Ready)'),
    ).toBeInTheDocument();
    const failed = screen.getByRole('article', { name: 'US-005 Story US-005' });
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
    expect(within(failed).getByText('No agent adapter is available.')).toBeInTheDocument();
  });
});

describe('US-038 AC-2: moving cards', () => {
  it('moves a card with the keyboard-accessible "Move to" control', async () => {
    const onMove = vi.fn(async () => ({ ok: true as const }));
    render(<KanbanBoard board={board} onMove={onMove} />);

    const move = screen.getByRole('combobox', { name: 'Move US-001 to' });
    expect(within(move).queryByRole('option', { name: 'Ready' })).not.toBeInTheDocument();
    await userEvent.selectOptions(move, 'in_progress');

    expect(onMove).toHaveBeenCalledWith('US-001', 'in_progress', null);
  });

  it('offers a drag handle per card for mouse and keyboard dragging (dnd-kit)', () => {
    render(<KanbanBoard board={board} onMove={vi.fn()} />);
    const handle = screen.getByRole('button', { name: 'Drag US-001' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('resolves drops onto columns and cards to a target status and position', () => {
    // Onto an empty column → end of that column.
    expect(resolveDrop(board, 'US-001', 'column:review')).toEqual({ to: 'review', beforeStoryId: null });
    // Onto a card in another column → before that card.
    expect(resolveDrop(board, 'US-003', 'US-004')).toEqual({ to: 'ready', beforeStoryId: 'US-004' });
    // Downwards within a column → after the card it is dropped on.
    expect(resolveDrop(board, 'US-001', 'US-004')).toEqual({ to: 'ready', beforeStoryId: null });
    // Upwards within a column → before the card it is dropped on.
    expect(resolveDrop(board, 'US-004', 'US-001')).toEqual({ to: 'ready', beforeStoryId: 'US-001' });
    // Dropped on itself or nowhere → no move.
    expect(resolveDrop(board, 'US-001', 'US-001')).toBeUndefined();
    expect(resolveDrop(board, 'US-001', null)).toBeUndefined();
  });
});

describe('US-038 AC-4: rejected moves snap back with the explanation', () => {
  it('keeps the card in place and shows why the move was refused', async () => {
    const onMove = vi.fn(async () => ({ ok: false as const, reason: 'Approve this story before moving it to Ready.' }));
    render(<KanbanBoard board={board} onMove={onMove} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move US-003 to' }), 'ready');

    expect(await screen.findByRole('alert')).toHaveTextContent('US-003: Approve this story before moving it to Ready.');
    expect(
      within(screen.getByRole('region', { name: 'Backlog (1)' })).getByRole('article', { name: 'US-003 Story US-003' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Move US-003 to' })).toHaveValue('');
  });
});

describe('US-034 AC-1: trace of a story from the board', () => {
  it('the story drawer shows the trace content for the story', async () => {
    const renderDetails = vi.fn((storyId: string) => <section aria-label="Trace">Trace of {storyId}</section>);
    render(<KanbanBoard board={board} onMove={vi.fn()} renderDetails={renderDetails} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open US-001' }));
    expect(within(screen.getByRole('dialog')).getByRole('region', { name: 'Trace' })).toHaveTextContent('Trace of US-001');
  });
});

describe('US-058 AC-1: the decision stays visible after approval', () => {
  it('keeps the review content (merge instructions) when the story moves from Review to Done', async () => {
    const at = (status: 'review' | 'done'): BoardData => ({
      ...board,
      columns: board.columns.map((c) => ({ ...c, cards: c.status === status ? [card('US-009', status)] : c.cards })),
    });
    const renderReview = (storyId: string) => <section aria-label="Merge instructions">Merge {storyId}</section>;
    const { rerender } = render(<KanbanBoard board={at('review')} onMove={vi.fn()} renderReview={renderReview} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open US-009' }));
    expect(screen.getByRole('region', { name: 'Merge instructions' })).toBeInTheDocument();

    rerender(<KanbanBoard board={at('done')} onMove={vi.fn()} renderReview={renderReview} />);
    expect(screen.getByRole('region', { name: 'Merge instructions' })).toBeInTheDocument();
  });

  it('shows no review for stories that were never in Review', async () => {
    const renderReview = vi.fn(() => <section aria-label="Merge instructions" />);
    render(<KanbanBoard board={board} onMove={vi.fn()} renderReview={renderReview} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open US-001' }));
    expect(screen.queryByRole('region', { name: 'Merge instructions' })).not.toBeInTheDocument();
  });
});
