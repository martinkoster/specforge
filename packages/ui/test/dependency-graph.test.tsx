// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DependencyGraph, graphLayout } from '../src/board/DependencyGraph.js';
import type { BoardData } from '../src/board/KanbanBoard.js';

beforeAll(() => {
  // React Flow measures its container.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

type Card = BoardData['columns'][number]['cards'][number];
const card = (storyId: string, status: Card['status'], dependsOn: string[] = [], related: string[] = []): Card => ({
  storyId,
  title: `Story ${storyId}`,
  size: null,
  approval: 'approved',
  status,
  subState: 'none',
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  dependsOn,
  related,
});

const board: BoardData = {
  columns: [
    { status: 'backlog', cards: [card('US-003', 'backlog', ['US-002'], ['US-001'])] },
    { status: 'ready', cards: [card('US-002', 'ready', ['US-001'])] },
    { status: 'in_progress', cards: [] },
    { status: 'review', cards: [] },
    { status: 'done', cards: [card('US-001', 'done', [], ['US-003'])] },
  ],
  queue: [],
  slots: { active: 0, limit: 3 },
};

describe('US-041 AC-3: dependency graph view', () => {
  it('lays out all stories as nodes coloured by column with blocking and related edges (layered layout)', () => {
    const { nodes, edges } = graphLayout(board);

    expect(nodes.map((n) => [n.id, n.data.status])).toEqual([
      ['US-003', 'backlog'],
      ['US-002', 'ready'],
      ['US-001', 'done'],
    ]);
    expect(nodes.map((n) => n.className)).toEqual([
      'graph-node graph-node-backlog',
      'graph-node graph-node-ready',
      'graph-node graph-node-done',
    ]);
    // Predecessors are placed before their dependents (left to right).
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.position.x]));
    expect(x['US-001']).toBeLessThan(x['US-002']!);
    expect(x['US-002']).toBeLessThan(x['US-003']!);
    expect(edges.map((e) => [e.source, e.target, e.data?.type])).toEqual([
      ['US-002', 'US-003', 'blocking'],
      ['US-001', 'US-002', 'blocking'],
      ['US-001', 'US-003', 'related'],
    ]);
  });

  it('renders the graph with a legend', () => {
    render(<DependencyGraph board={board} />);
    expect(screen.getByRole('region', { name: 'Dependency graph' })).toBeInTheDocument();
    expect(screen.getByText('Story US-002')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Backlog');
  });
});
