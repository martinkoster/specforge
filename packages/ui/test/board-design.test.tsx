// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-074 (UF-03, UF-12, NFR-033, ui_design_concept.md §4.2): dashboard cards, Kanban columns and cards, toggles, graph.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../src/board/KanbanBoard.js';
import { DashboardArea } from '../src/dashboard/DashboardArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

const css = (file: string) => readFileSync(join(__dirname, '..', 'src', 'styles', file), 'utf8');

const card = (storyId: string, status: string, extra: Record<string, unknown> = {}) => ({
  storyId,
  title: `Story ${storyId}`,
  status,
  subState: 'none',
  approval: 'approved',
  size: 'S',
  dependsOn: [],
  related: [],
  epicId: 'EP-001',
  waitingFor: [],
  queueReason: null,
  statusNotice: null,
  ...extra,
});

const board = {
  columns: [
    { status: 'backlog', cards: [card('US-001', 'backlog'), card('US-002', 'backlog', { dependsOn: ['US-001'], approval: 'draft' })] },
    { status: 'ready', cards: [] },
    { status: 'in_progress', cards: [card('US-003', 'in_progress', { subState: 'running' })] },
    { status: 'review', cards: [] },
    { status: 'done', cards: [] },
  ],
  queue: [],
  epics: [],
};

describe('US-074 AC-2: Kanban columns and cards', () => {
  it('columns show a count pill; cards show mono ID, title, epic chip, dependency badge and a status icon', () => {
    render(<KanbanBoard board={board as never} onMove={vi.fn(async () => ({ ok: true }))} />);

    const backlog = screen.getByRole('region', { name: 'Backlog (2)' });
    expect(within(backlog).getByText('2')).toHaveClass('pill');

    const us2 = screen.getByRole('article', { name: 'US-002 Story US-002' });
    expect(within(us2).getByRole('button', { name: 'Open US-002' })).toHaveClass('mono');
    expect(within(us2).getByText('Story US-002')).toHaveClass('card-title');
    expect(within(us2).getByText('EP-001')).toHaveClass('tag');
    expect(within(us2).getByText('Blocked by 1').closest('.badge')).toHaveClass('badge-warning');
    expect(within(us2).getByText('Draft').closest('.badge')).not.toBeNull();
    expect(within(us2).getByRole('button', { name: 'Drag US-002' }).querySelector('svg')).not.toBeNull();

    const running = screen.getByRole('article', { name: 'US-003 Story US-003' });
    expect(running.querySelector('.card-status svg.icon-spin')).not.toBeNull();
  });

  it('dragging lifts the card, drop targets are highlighted and swimlane headers stick', () => {
    const kanban = css('areas/kanban.css');
    expect(kanban).toMatch(/\.card-dragging \{[^}]*box-shadow: var\(--shadow-md\)[^}]*scale: 1\.02/);
    expect(kanban).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.card-dragging \{\s*scale: none;/);
    expect(kanban).toMatch(/\.column-over \{[^}]*background: var\(--accent-subtle\)/);
    expect(kanban).toMatch(/\.lane-header \{[^}]*position: sticky/);
  });
});

describe('US-074 AC-3: toggles and graph', () => {
  it('React Flow takes nodes, edges, controls, minimap and background from the tokens', () => {
    const graph = css('areas/graph.css');
    for (const variable of [
      '--xy-background-color: var(--bg)',
      '--xy-node-background-color: var(--surface)',
      '--xy-node-color: var(--text)',
      '--xy-edge-stroke: var(--text-subtle)',
      '--xy-controls-button-background-color: var(--surface)',
      '--xy-minimap-background-color: var(--bg-subtle)',
      '--xy-background-pattern-color: var(--border)',
    ]) {
      expect(graph, variable).toContain(variable);
    }
  });
});

describe('US-074 AC-1: dashboard cards', () => {
  it('widgets are cards with a header; counters use tabular numbers; the next step is a prominent callout', async () => {
    const data = {
      storyCounts: { backlog: 2, ready: 1, in_progress: 1, review: 1, done: 3 },
      progress: { done: 3, total: 8 },
      kanbanEnabled: true,
      runs: { active: 1, queued: 2 },
      unmerged: 0,
      pendingDecisions: 4,
      activity: [],
      artifacts: [],
      epics: [],
    };
    const session = await fakeCore({ 'dashboard.get': async () => data as never });
    render(
      <DashboardArea
        session={session}
        projectId="p1"
        nextStep={
          { label: 'Review US-003', reason: 'Completed implementations are waiting for your review.', target: { kind: 'kanban' } } as never
        }
        phases={null}
        onNextStep={() => undefined}
        onOpenKanban={() => undefined}
        onOpenPhase={() => undefined}
        onOpenPending={() => undefined}
        onOpenArtifact={() => undefined}
        onOpenEpic={() => undefined}
        aiDisabledReason={null}
      />,
    );

    const stories = await screen.findByRole('region', { name: 'Stories' });
    expect(stories).toHaveClass('dashboard-widget');
    expect(stories.querySelector('.widget-header h2')).toHaveTextContent('Stories');
    expect(within(stories).getByText('Backlog').closest('.badge')).toHaveClass('badge-neutral');
    expect(within(stories).getByText('3', { selector: '.stat-value' })).toBeInTheDocument();
    expect(css('areas/dashboard.css')).toMatch(/\.stat-value \{[^}]*font-variant-numeric: tabular-nums/);

    const next = screen.getByRole('region', { name: 'Next step' });
    expect(next).toHaveClass('callout');
    expect(within(next).getByRole('button', { name: 'Review US-003' })).toHaveClass('btn-primary');
  });
});

describe('US-073 AC-3: no stories yet', () => {
  it('the stories widget shows an empty state while the project has no stories', async () => {
    const data = {
      storyCounts: { backlog: 0, ready: 0, in_progress: 0, review: 0, done: 0 },
      progress: { done: 0, total: 0 },
      kanbanEnabled: false,
      runs: { active: 0, queued: 0 },
      unmerged: 0,
      pendingDecisions: 0,
      activity: [],
      artifacts: [],
      epics: [],
    };
    const session = await fakeCore({ 'dashboard.get': async () => data as never });
    render(
      <DashboardArea
        session={session}
        projectId="p1"
        nextStep={null}
        phases={null}
        onNextStep={() => undefined}
        onOpenKanban={() => undefined}
        onOpenPhase={() => undefined}
        onOpenPending={() => undefined}
        onOpenArtifact={() => undefined}
        onOpenEpic={() => undefined}
      />,
    );
    const stories = await screen.findByRole('region', { name: 'Stories' });
    expect(within(stories).getByText('No stories yet').closest('.empty-state')).not.toBeNull();
    expect(within(stories).getByRole('button', { name: 'Go to User stories' })).toBeInTheDocument();
  });
});

describe('US-086 AC-4: potentially impacted cards', () => {
  it('shows the flag with its source and reason on the card', () => {
    const flagged = {
      ...board,
      columns: board.columns.map((c) =>
        c.status === 'backlog'
          ? {
              ...c,
              cards: [card('US-001', 'backlog', { impact: { sourceRef: 'FR-003', reason: 'FR-003 changed after it was approved.' } })],
            }
          : c,
      ),
    };
    render(<KanbanBoard board={flagged as never} onMove={vi.fn(async () => ({ ok: true }))} />);
    const us1 = screen.getByRole('article', { name: 'US-001 Story US-001' });
    expect(within(us1).getByText('Potentially impacted')).toBeInTheDocument();
    expect(within(us1).getByText('FR-003 changed after it was approved.')).toBeInTheDocument();
  });
});

describe('US-091 AC-5: in-flight decisions on cards', () => {
  it('shows the latest in-flight decision with its feature', () => {
    const flagged = {
      ...board,
      columns: board.columns.map((c) =>
        c.status === 'review'
          ? { ...c, cards: [card('US-012', 'review', { inFlight: { decision: 'apply_in_corrections', featureId: 'FI-001' } })] }
          : c,
      ),
    };
    render(<KanbanBoard board={flagged as never} onMove={vi.fn(async () => ({ ok: true }))} />);
    const us12 = screen.getByRole('article', { name: 'US-012 Story US-012' });
    expect(us12).toHaveTextContent('FI-001: Apply in corrections');
  });
});

describe('US-092 AC-2: rework stories on cards and in the drawer', () => {
  const reworked = {
    ...board,
    columns: board.columns.map((c) =>
      c.status === 'done'
        ? { ...c, cards: [card('US-008', 'done', { reworkedBy: ['US-023'] })] }
        : c.status === 'backlog'
          ? { ...c, cards: [card('US-023', 'backlog', { reworks: ['US-008'] })] }
          : c,
    ),
  };

  it('the Done original shows "Reworked by US-xxx"; the rework story shows what it reworks', async () => {
    render(<KanbanBoard board={reworked as never} onMove={vi.fn(async () => ({ ok: true }))} />);
    expect(screen.getByRole('article', { name: 'US-008 Story US-008' })).toHaveTextContent('Reworked by US-023');
    expect(screen.getByRole('article', { name: 'US-023 Story US-023' })).toHaveTextContent('Reworks US-008');

    await userEvent.click(screen.getByRole('button', { name: 'Open US-008' }));
    expect(screen.getByRole('dialog', { name: 'US-008 Story US-008' })).toHaveTextContent('Reworked by US-023');
  });
});
