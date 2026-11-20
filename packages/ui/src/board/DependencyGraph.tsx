// SPDX-License-Identifier: Apache-2.0
// Dependency graph view (US-041 AC-3, UF-03 step 3): all stories as nodes coloured by column, blocking and related
// edges, layered left-to-right layout (dagre; predecessors before their dependents).
import dagre from '@dagrejs/dagre';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState } from 'react';
import { COLUMN_LABELS, type BoardData } from './types.js';

type Status = BoardData['columns'][number]['status'];
type StoryNode = Node<{ label: string; status: Status }>;
type DependencyEdge = Edge<{ type: 'blocking' | 'related' }>;

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

/** US-101 AC-2: one node per epic and the derived epic dependencies as edges (predecessor → dependent). */
function epicLayout(board: BoardData): { nodes: StoryNode[]; edges: DependencyEdge[] } {
  const lanes = (board.lanes ?? []).filter((l) => l.epicId !== null);
  const edges: DependencyEdge[] = lanes.flatMap((l) =>
    (l.dependsOn ?? []).map((to) => ({
      id: `e:${to}->${l.epicId}`,
      source: to,
      target: l.epicId!,
      data: { type: 'blocking' as const },
      className: 'edge-blocking',
    })),
  );
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const l of lanes) graph.setNode(l.epicId!, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) graph.setEdge(e.source, e.target);
  dagre.layout(graph);
  const nodes: StoryNode[] = lanes.map((l) => {
    const { x, y } = graph.node(l.epicId!);
    const status: Status = l.status === 'done' || l.status === 'merged' ? 'done' : l.status === 'not_started' ? 'backlog' : 'in_progress';
    return {
      id: l.epicId!,
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: { label: `${l.epicId} · ${l.title}`, status },
      className: `graph-node graph-node-${status}`,
    };
  });
  return { nodes, edges };
}

export function graphLayout(board: BoardData, options: { byEpic?: boolean } = {}): { nodes: StoryNode[]; edges: DependencyEdge[] } {
  if (options.byEpic) return epicLayout(board);
  const cards = board.columns.flatMap((c) => c.cards);
  const known = new Set(cards.map((c) => c.storyId));
  const edges: DependencyEdge[] = [];
  for (const card of cards) {
    for (const from of card.dependsOn.filter((id) => known.has(id))) {
      edges.push({
        id: `b:${from}->${card.storyId}`,
        source: from,
        target: card.storyId,
        data: { type: 'blocking' },
        className: 'edge-blocking',
      });
    }
  }
  const pairs = new Set<string>();
  for (const card of cards) {
    for (const other of card.related.filter((id) => known.has(id))) {
      const [a, b] = [card.storyId, other].sort() as [string, string];
      if (pairs.has(`${a}|${b}`)) continue;
      pairs.add(`${a}|${b}`);
      edges.push({ id: `r:${a}-${b}`, source: a, target: b, data: { type: 'related' }, className: 'edge-related', animated: false });
    }
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const card of cards) graph.setNode(card.storyId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // Only blocking edges define the ranks; related edges are drawn but do not order the layout.
  for (const e of edges) if (e.data?.type === 'blocking') graph.setEdge(e.source, e.target);
  dagre.layout(graph);

  const nodes: StoryNode[] = cards.map((card) => {
    const { x, y } = graph.node(card.storyId);
    return {
      id: card.storyId,
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: { label: `${card.storyId} · ${card.title}`, status: card.status },
      className: `graph-node graph-node-${card.status}`,
    };
  });
  return { nodes, edges };
}

export function DependencyGraph({ board }: { board: BoardData }) {
  const [byEpic, setByEpic] = useState(false);
  const { nodes, edges } = graphLayout(board, { byEpic });
  return (
    <section aria-label="Dependency graph" className="dependency-graph">
      {(board.lanes?.length ?? 0) > 0 && (
        <label className="checkbox-label">
          <input className="checkbox" type="checkbox" checked={byEpic} onChange={(e) => setByEpic(e.target.checked)} />
          Group by epic
        </label>
      )}
      <ul aria-label="Legend" className="graph-legend">
        {(Object.keys(COLUMN_LABELS) as Status[]).map((s) => (
          <li key={s} className={`graph-node-${s}`}>
            {COLUMN_LABELS[s]}
          </li>
        ))}
        <li className="edge-legend-blocking">depends on</li>
        <li className="edge-legend-related">related</li>
      </ul>
      <div className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <ul className="visually-hidden" aria-label="Stories">
        {board.columns
          .flatMap((c) => c.cards)
          .map((card) => (
            <li key={card.storyId}>{card.title}</li>
          ))}
      </ul>
    </section>
  );
}
