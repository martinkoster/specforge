// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard, type BoardData, type KanbanBoardProps } from '../src/board/KanbanBoard.js';

afterEach(cleanup);

type Card = BoardData['columns'][number]['cards'][number];
const card = (storyId: string, status: Card['status'], overrides: Partial<Card> = {}): Card => ({
  storyId,
  title: `Story ${storyId}`,
  size: 'S',
  approval: 'approved',
  status,
  subState: status === 'in_progress' ? 'queued' : 'none',
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  dependsOn: [],
  related: [],
  ...overrides,
});

const board: BoardData = {
  columns: [
    { status: 'backlog', cards: [card('US-001', 'backlog'), card('US-005', 'backlog')] },
    { status: 'ready', cards: [card('US-002', 'ready', { dependsOn: ['US-001'], related: ['US-005'] })] },
    {
      status: 'in_progress',
      cards: [
        card('US-003', 'in_progress', { dependsOn: ['US-002'], queueReason: 'dependency', waitingFor: ['US-002'] }),
        card('US-004', 'in_progress', { subState: 'blocked_conflict', queueReason: 'conflict', waitingFor: ['src/a.ts', 'src/b.ts'] }),
        card('US-006', 'in_progress', { queueReason: 'slot' }),
      ],
    },
    { status: 'review', cards: [] },
    { status: 'done', cards: [] },
  ],
  queue: ['US-003', 'US-006', 'US-004'],
  slots: { active: 3, limit: 3 },
};

function renderBoard(overrides: Partial<KanbanBoardProps> = {}) {
  const props: KanbanBoardProps = {
    board,
    onMove: vi.fn(async () => ({ ok: true as const })),
    onRecheck: vi.fn(async () => ({ ok: true as const })),
    onAddDependency: vi.fn(async () => ({ ok: true as const })),
    onRemoveDependency: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  render(<KanbanBoard {...props} />);
  return props;
}

const article = (id: string) => screen.getByRole('article', { name: new RegExp(`^${id} `) });

describe('US-041 AC-1: dependency badges', () => {
  it('shows "Blocked by n", "Blocks n" and "Related" badges', () => {
    renderBoard();
    expect(within(article('US-002')).getByText('Blocked by 1')).toBeInTheDocument();
    expect(within(article('US-002')).getByText('Blocks 1')).toBeInTheDocument();
    expect(within(article('US-002')).getByText('Related')).toHaveAttribute('title', 'Related to US-005');
    expect(within(article('US-001')).getByText('Blocks 1')).toBeInTheDocument();
    expect(within(article('US-001')).queryByText(/Blocked by/)).not.toBeInTheDocument();
  });
});

describe('US-041 AC-2: selecting a card highlights its dependencies', () => {
  it('marks predecessors and successors, dims unrelated cards and draws connector lines', async () => {
    renderBoard();

    await userEvent.click(within(article('US-002')).getByRole('button', { name: 'Show dependencies of US-002' }));

    expect(article('US-002')).toHaveClass('card-selected');
    expect(article('US-001')).toHaveClass('card-predecessor');
    expect(article('US-003')).toHaveClass('card-successor');
    expect(article('US-005')).toHaveClass('card-related');
    expect(article('US-006')).toHaveClass('card-dimmed');
    expect(document.querySelectorAll('[data-connector]')).toHaveLength(3);

    await userEvent.keyboard('{Escape}');
    expect(article('US-006')).not.toHaveClass('card-dimmed');
  });
});

describe('US-043: queue on the board', () => {
  it('AC-1: queued cards show why they wait', () => {
    renderBoard();
    expect(within(article('US-003')).getByText('Waiting for US-002 (Ready)')).toBeInTheDocument();
    expect(within(article('US-006')).getByText('Waiting for run slot (3/3)')).toBeInTheDocument();
  });

  it('AC-2: starting a story behind an unstarted predecessor asks for confirmation', async () => {
    const props = renderBoard();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move US-002 to' }), 'in_progress');
    const dialog = screen.getByRole('alertdialog', { name: 'Queue behind unstarted stories?' });
    expect(dialog).toHaveTextContent('US-002 depends on US-001 (Backlog)');
    expect(props.onMove).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(props.onMove).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move US-002 to' }), 'in_progress');
    await userEvent.click(screen.getByRole('button', { name: 'Queue anyway' }));
    expect(props.onMove).toHaveBeenCalledWith('US-002', 'in_progress', null);
  });

  it('AC-3: the card drawer shows the queue position and removes the story from the queue', async () => {
    const props = renderBoard();

    await userEvent.click(within(article('US-006')).getByRole('button', { name: 'Open US-006' }));
    const drawer = screen.getByRole('dialog', { name: 'US-006 Story US-006' });
    expect(drawer).toHaveTextContent('Position 2 of 3 in the queue');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Remove from queue' }));

    expect(props.onMove).toHaveBeenCalledWith('US-006', 'ready', null);
  });

  it('AC-3 / US-040: the drawer embeds the dependency editor', async () => {
    const props = renderBoard();
    await userEvent.click(within(article('US-002')).getByRole('button', { name: 'Open US-002' }));
    const drawer = screen.getByRole('dialog', { name: 'US-002 Story US-002' });

    expect(within(drawer).getByText('depends on US-001')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Remove dependency on US-001' }));
    expect(props.onRemoveDependency).toHaveBeenCalledWith('US-002', { to: 'US-001', type: 'blocking' });
  });

  it('AC-4: blocked (conflict) cards list the conflicting files and offer Re-check', async () => {
    const props = renderBoard();
    const blocked = article('US-004');

    expect(within(blocked).getByText('Blocked (conflict)')).toBeInTheDocument();
    expect(within(blocked).getByText('Conflicting files: src/a.ts, src/b.ts')).toBeInTheDocument();
    await userEvent.click(within(blocked).getByRole('button', { name: 'Re-check US-004' }));

    expect(props.onRecheck).toHaveBeenCalledWith('US-004');
  });
});
