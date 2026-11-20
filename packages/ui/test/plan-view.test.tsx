// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-101 (lane dependencies, epic graph), US-102 (Start epic), US-103 (implementation plan view).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { KanbanArea } from '../src/board/KanbanArea.js';
import { KanbanBoard } from '../src/board/KanbanBoard.js';
import { graphLayout } from '../src/board/DependencyGraph.js';
import { PlanView } from '../src/board/PlanView.js';
import { StartStoriesDialog } from '../src/board/StartStoriesDialog.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Board = QueryOutput<'board.get'>;
const card = (storyId: string, status: Board['columns'][number]['status'], epicId: string | null, dependsOn: string[] = []) => ({
  storyId,
  title: `Story ${storyId}`,
  size: 'S',
  approval: 'approved' as const,
  status,
  subState: 'none' as const,
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  dependsOn,
  related: [],
  epicId,
});
const progress = { done: 0, total: 1, doneWeight: 0, totalWeight: 2 };
const board: Board = {
  columns: [
    { status: 'backlog', cards: [card('US-012', 'backlog', 'EP-002', ['US-003'])] },
    { status: 'ready', cards: [card('US-003', 'ready', 'EP-001')] },
    { status: 'in_progress', cards: [] },
    { status: 'review', cards: [] },
    { status: 'done', cards: [] },
  ],
  lanes: [
    { epicId: 'EP-001', title: 'Accounts', status: 'not_started', progress, colour: 0, dependsOn: [] },
    { epicId: 'EP-002', title: 'Tasks', status: 'not_started', progress, colour: 1, dependsOn: ['EP-001'] },
    {
      epicId: null,
      title: 'No epic',
      status: 'not_started',
      progress: { ...progress, total: 0, totalWeight: 0 },
      colour: null,
      dependsOn: [],
    },
  ],
  queue: [],
  slots: { active: 0, limit: 3 },
};

describe('US-101 AC-2: epic dependencies on the board and in the graph', () => {
  it('lane headers show "depends on EP-001"; Start epic is offered per epic lane (US-102 AC-1)', async () => {
    const onStartEpic = vi.fn();
    render(<KanbanBoard board={board} layout="epic" onMove={vi.fn(async () => ({ ok: true as const }))} onStartEpic={onStartEpic} />);
    const lane = screen.getByRole('region', { name: 'Lane EP-002 Tasks' });
    expect(lane).toHaveTextContent('depends on EP-001');
    expect(screen.getByRole('region', { name: 'Lane EP-001 Accounts' })).not.toHaveTextContent('depends on');
    await userEvent.click(within(lane).getByRole('button', { name: 'Start epic EP-002' }));
    expect(onStartEpic).toHaveBeenCalledWith('EP-002');
    expect(screen.queryByRole('button', { name: 'Start epic No epic' })).not.toBeInTheDocument();
  });

  it('the dependency graph grouped by epic shows the epics and the derived epic edges', () => {
    const { nodes, edges } = graphLayout(board, { byEpic: true });
    expect(nodes.map((n) => n.id)).toEqual(['EP-001', 'EP-002']);
    expect(edges.map((e) => [e.source, e.target])).toEqual([['EP-001', 'EP-002']]);
  });
});

describe('US-102 AC-1: the start confirmation', () => {
  it('lists the stories to start and the skipped ones; Start confirms', async () => {
    const onConfirm = vi.fn();
    render(
      <StartStoriesDialog
        title="Start epic EP-001"
        preview={{ start: ['US-001', 'US-002'], skipped: [{ storyId: 'US-005', status: 'backlog' }] }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Start epic EP-001' });
    expect(within(dialog).getByRole('list', { name: 'Stories to start' })).toHaveTextContent('US-001US-002');
    expect(within(dialog).getByRole('list', { name: 'Skipped' })).toHaveTextContent('US-005 (Backlog)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 2 stories' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('US-103: the implementation plan view', () => {
  const plan: QueryOutput<'plan.get'> = {
    limit: 3,
    waves: [
      {
        index: 0,
        size: 6,
        stories: [
          { id: 'A', title: 'Story A', status: 'ready', epicId: 'EP-001', size: 'S' },
          { id: 'D', title: 'Story D', status: 'ready', epicId: 'EP-002', size: 'S' },
          { id: 'E', title: 'Story E', status: 'backlog', epicId: null, size: 'S' },
        ],
      },
      { index: 1, size: 2, stories: [{ id: 'B', title: 'Story B', status: 'backlog', epicId: 'EP-001', size: 'S' }] },
      { index: 2, size: 2, stories: [{ id: 'C', title: 'Story C', status: 'backlog', epicId: 'EP-001', size: 'S' }] },
    ],
    criticalPath: ['A', 'B', 'C'],
    epicEdges: [{ from: 'EP-002', to: 'EP-001' }],
  };

  async function renderPlan(handlers = {}) {
    const onChanged = vi.fn();
    const session = await fakeCore({ 'plan.get': async () => plan, ...handlers });
    render(<PlanView session={session} projectId="p1" onChanged={onChanged} />);
    await screen.findByRole('region', { name: 'Wave 1' });
    return { onChanged };
  }

  it('AC-1/AC-2: waves as columns with size totals, critical path, coloured cards and the epic graph', async () => {
    await renderPlan();
    expect(screen.getAllByRole('region', { name: /^Wave \d$/ }).map((w) => w.getAttribute('aria-label'))).toEqual([
      'Wave 1',
      'Wave 2',
      'Wave 3',
    ]);
    const wave1 = screen.getByRole('region', { name: 'Wave 1' });
    expect(wave1).toHaveTextContent('6 points');
    const a = within(wave1).getByRole('listitem', { name: 'A Story A' });
    expect(a).toHaveClass('plan-card-critical');
    expect(a).toHaveClass('plan-card-ready');
    expect(within(wave1).getByRole('listitem', { name: 'D Story D' })).not.toHaveClass('plan-card-critical');
    expect(screen.getByText('Critical path: A → B → C')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Epic dependencies' })).toHaveTextContent('EP-002 depends on EP-001');
  });

  it('AC-3: Start wave confirms the Ready stories and starts them', async () => {
    const startWave = vi.fn(async () => ({ started: ['A', 'D'], failed: [], skipped: [{ storyId: 'E', status: 'backlog' as const }] }));
    const { onChanged } = await renderPlan({
      'plan.wavePreview': async () => ({ start: ['A', 'D'], skipped: [{ storyId: 'E', status: 'backlog' as const }] }),
      'plan.startWave': startWave,
    });
    await userEvent.click(within(screen.getByRole('region', { name: 'Wave 1' })).getByRole('button', { name: 'Start wave 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start wave 1' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 2 stories' }));
    expect(startWave).toHaveBeenCalledWith({ projectId: 'p1', wave: 0 });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('Started A, D');
  });

  it('AC-2: Group by epic shows the stories per epic with Start epic', async () => {
    const startEpic = vi.fn(async () => ({ started: ['A'], failed: [], skipped: [] }));
    await renderPlan({
      'board.startEpicPreview': async () => ({ start: ['A'], skipped: [{ storyId: 'B', status: 'backlog' as const }] }),
      'board.startEpic': startEpic,
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Group by epic' }));
    const group = screen.getByRole('group', { name: 'EP-001' });
    expect(
      within(group)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['A Story A', 'B Story B', 'C Story C']);
    await userEvent.click(within(group).getByRole('button', { name: 'Start epic EP-001' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Start epic EP-001' })).getByRole('button', { name: 'Start 1 story' }),
    );
    expect(startEpic).toHaveBeenCalledWith({ projectId: 'p1', epicId: 'EP-001' });
  });
});

describe('US-102/US-103 in the Kanban area', () => {
  it('Start epic from the lane header asks for confirmation, starts the stories and reports them', async () => {
    const startEpic = vi.fn(async () => ({ started: ['US-003'], failed: [{ storyId: 'US-009', reason: 'Draft.' }], skipped: [] }));
    const onChanged = vi.fn();
    const session = await fakeCore({
      'board.get': async () => board,
      'board.startEpicPreview': async () => ({ start: ['US-003'], skipped: [] }),
      'board.startEpic': startEpic,
    });
    render(<KanbanArea session={session} projectId="p1" onChanged={onChanged} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start epic EP-001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start epic EP-001' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 1 story' }));
    expect(startEpic).toHaveBeenCalledWith({ projectId: 'p1', epicId: 'EP-001' });
    expect(await screen.findByText('Started US-003 · US-009: Draft.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('the view switch offers the plan and the dependency graph grouped by epic', async () => {
    const session = await fakeCore({
      'board.get': async () => board,
      'plan.get': async () => ({ limit: 3, waves: [], criticalPath: [], epicEdges: [] }),
    });
    render(<KanbanArea session={session} projectId="p1" onChanged={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Plan' }));
    expect(await screen.findByText(/nothing left to plan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Dependency graph' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Group by epic' }));
    expect(screen.getByRole('checkbox', { name: 'Group by epic' })).toBeChecked();
  });
});

describe('Kanban area wiring of the board actions', () => {
  it('moves a card, reorders lanes, opens the drawer and edits dependencies through the core', async () => {
    const move = vi.fn(async () => ({ ok: true as const }));
    const reorder = vi.fn(async () => ({}));
    const remove = vi.fn(async () => ({ ok: true as const }));
    const onChanged = vi.fn();
    const session = await fakeCore({
      'board.get': async () => board,
      'board.move': move,
      'epics.reorder': reorder as never,
      'stories.removeDependency': remove,
      'review.rejectedBranches': async () => [],
      'trace.get': async () => ({
        node: { kind: 'story', id: 'US-012', label: 'US-012', exists: true },
        upstream: [],
        downstream: [],
        issues: [],
      }),
    });
    render(<KanbanArea session={session} projectId="p1" onChanged={onChanged} />);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Move US-003 to' }), 'review');
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', storyId: 'US-003', to: 'review' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Move lane EP-001 down' }));
    expect(reorder).toHaveBeenCalledWith({ projectId: 'p1', epicIds: ['EP-002', 'EP-001'] });
    await userEvent.click(screen.getByRole('button', { name: 'Open US-012' }));
    const drawer = await screen.findByRole('dialog', { name: 'US-012 Story US-012' });
    await userEvent.click(within(drawer).getByRole('button', { name: /Remove .*US-003/ }));
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', from: 'US-012', to: 'US-003', type: 'blocking' }));
  });
});

describe('Kanban area wiring of recheck, recovery and new dependencies', () => {
  it('re-checks a conflict, recovers a failed run and adds a dependency through the core', async () => {
    const conflicted = { ...card('US-031', 'in_progress', null), subState: 'blocked_conflict' as const, waitingFor: ['src/a.ts'] };
    const failed = { ...card('US-030', 'in_progress', null), subState: 'failed' as const };
    const withRuns: Board = {
      ...board,
      columns: board.columns.map((c) => (c.status === 'in_progress' ? { ...c, cards: [failed, conflicted] } : c)),
    };
    const recheck = vi.fn(async () => ({ ok: true as const }));
    const recover = vi.fn(async () => ({ ok: true as const }));
    const add = vi.fn(async () => ({ ok: true as const }));
    const session = await fakeCore({
      'board.get': async () => withRuns,
      'board.recheck': recheck,
      'runs.recovery': async () => ({ lastRunId: 'r1', resumable: false, gitMode: true, hasWorktree: false }),
      'board.runAction': recover as never,
      'stories.addDependency': add,
      'review.rejectedBranches': async () => [],
      'trace.get': async () => ({
        node: { kind: 'story', id: 'US-003', label: 'US-003', exists: true },
        upstream: [],
        downstream: [],
        issues: [],
      }),
    });
    render(<KanbanArea session={session} projectId="p1" onChanged={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Re-check US-031' }));
    expect(recheck).toHaveBeenCalledWith({ projectId: 'p1', storyId: 'US-031' });

    await userEvent.click(screen.getByRole('button', { name: 'Recover US-030' }));
    const recovery = await screen.findByRole('dialog', { name: 'Recover US-030' });
    await userEvent.click(within(within(recovery).getByRole('region', { name: 'Discard' })).getByRole('button'));
    await waitFor(() => expect(recover).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Open US-003' }));
    const drawer = await screen.findByRole('dialog', { name: 'US-003 Story US-003' });
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: 'Story' }), 'US-012');
    await userEvent.type(within(drawer).getByRole('textbox', { name: 'Rationale' }), 'Needs it.');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add dependency' }));
    expect(add).toHaveBeenCalledWith({ projectId: 'p1', from: 'US-003', to: 'US-012', type: 'blocking', rationale: 'Needs it.' });
  });
});
