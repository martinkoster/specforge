// SPDX-License-Identifier: Apache-2.0
// Dependency graph view (US-041 AC-3, UF-03 step 3): all stories as nodes coloured by column, blocking and related
// edges, layered left-to-right layout (dagre; predecessors before their dependents).
import dagre from '@dagrejs/dagre';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { COLUMN_LABELS, type BoardData } from './types.js';

type Status = BoardData['columns'][number]['status'];
type StoryNode = Node<{ label: string; status: Status }>;
type DependencyEdge = Edge<{ type: 'blocking' | 'related' }>;

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

export function graphLayout(board: BoardData): { nodes: StoryNode[]; edges: DependencyEdge[] } {
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
  const { nodes, edges } = graphLayout(board);
  return (
    <section aria-label="Dependency graph" className="dependency-graph">
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
