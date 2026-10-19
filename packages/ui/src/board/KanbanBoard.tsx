// SPDX-License-Identifier: Apache-2.0
// Kanban board (US-038, US-041, US-043, UF-03): five columns, drag & drop (mouse + keyboard, dnd-kit) and an accessible
// "Move to" control; dependency badges, highlighting with connector lines, queue reasons, early-queue warning, story
// drawer. Moves are decided by the core — rejected moves snap back with the explanation.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import type { DependencyEditorProps } from '../stories/DependencyEditor.js';
import { earlyQueueWarning, relationsOf } from './dependencies.js';
import { StoryCard, type Highlight } from './StoryCard.js';
import { StoryDrawer } from './StoryDrawer.js';
import { COLUMN_LABELS, type BoardColumn as Column, type BoardData, type BoardStatus as Status } from './types.js';

export { COLUMN_LABELS, type BoardData } from './types.js';
type MoveOutcome = CommandOutput<'board.move'>;
type Dependency = Parameters<DependencyEditorProps['onAdd']>[0];

/** Maps a dnd-kit drop (card id or `column:<status>`) to the target status and position. */
export function resolveDrop(
  board: BoardData,
  activeId: string,
  overId: string | null,
): { to: Status; beforeStoryId: string | null; epicId?: string | null } | undefined {
  if (!overId || overId === activeId) return undefined;
  if (overId.startsWith('column:')) return { to: overId.slice('column:'.length) as Status, beforeStoryId: null };
  if (overId.startsWith('lane:')) {
    // "lane:<epicId|none>:<status>" in the board by epic (US-039).
    const [, lane, status] = overId.split(':') as [string, string, Status];
    return { to: status, beforeStoryId: null, epicId: lane === 'none' ? null : lane };
  }
  const target = board.columns.find((c) => c.cards.some((k) => k.storyId === overId));
  if (!target) return undefined;
  const overCard = target.cards.find((k) => k.storyId === overId)!;
  // Cards of the board by epic carry their epic; the drop then targets that lane.
  const lane = overCard.epicId !== undefined ? { epicId: overCard.epicId } : {};
  const overIndex = target.cards.findIndex((k) => k.storyId === overId);
  const activeIndex = target.cards.findIndex((k) => k.storyId === activeId);
  if (activeIndex >= 0 && activeIndex < overIndex) {
    // Moving down within the column: place after the card it was dropped on.
    return { to: target.status, beforeStoryId: target.cards[overIndex + 1]?.storyId ?? null, ...lane };
  }
  return { to: target.status, beforeStoryId: overId, ...lane };
}

function BoardColumn({
  column,
  children,
  title,
  droppableId,
  label,
}: {
  column: Column;
  children: React.ReactNode;
  title?: string;
  droppableId?: string;
  label?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? `column:${column.status}` });
  return (
    <section
      ref={setNodeRef}
      title={title}
      aria-label={label ?? `${COLUMN_LABELS[column.status]} (${column.cards.length})`}
      className={isOver ? 'column column-over' : 'column'}
    >
      <h2>
        {COLUMN_LABELS[column.status]} <span className="count">{column.cards.length}</span>
      </h2>
      <SortableContext items={column.cards.map((c) => c.storyId)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}

interface Line {
  key: string;
  kind: 'predecessor' | 'successor' | 'related';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface KanbanBoardProps {
  board: BoardData;
  onMove(storyId: string, to: Status, beforeStoryId: string | null): Promise<MoveOutcome>;
  /** Why stories cannot be started (capability gating, US-013), or null. */
  aiDisabledReason?: string | null;
  /** Opens the recovery dialog of a failed or interrupted story (US-055). */
  onRecover?(storyId: string): void;
  /** Review content of a story in Review, shown in its drawer (US-057). */
  renderReview?(storyId: string): ReactNode;
  /** Details of a story in its drawer: trace (US-034), rejected branches (US-058). */
  renderDetails?(storyId: string): ReactNode;
  /** Board by epic (swimlanes, US-039) or flat. */
  layout?: 'flat' | 'epic';
  /** Moves a story to another epic lane (after confirmation). */
  onSetEpic?(storyId: string, epicId: string | null): Promise<unknown>;
  /** New lane order (epic IDs). */
  onReorderLanes?(epicIds: string[]): Promise<unknown>;
  /** Initial epic filter (an epic clicked on the dashboard, US-061 AC-3). */
  initialEpicFilter?: string | null;
  onRecheck?(storyId: string): Promise<MoveOutcome>;
  onAddDependency?(storyId: string, dependency: Dependency & { rationale?: string }): ReturnType<DependencyEditorProps['onAdd']>;
  onRemoveDependency?(storyId: string, dependency: Dependency): ReturnType<DependencyEditorProps['onRemove']>;
}

export function KanbanBoard({
  board,
  onMove,
  onRecheck,
  onAddDependency,
  onRemoveDependency,
  aiDisabledReason = null,
  onRecover,
  renderReview,
  renderDetails,
  layout = 'flat',
  onSetEpic,
  onReorderLanes,
  initialEpicFilter = null,
}: KanbanBoardProps) {
  const [rejection, setRejection] = useState<string | undefined>();
  /** US-039: collapsed lanes, epic filter, lane being dragged, pending lane change of a card. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [epicFilter, setEpicFilter] = useState<string>(initialEpicFilter ?? 'all');
  const [draggedLane, setDraggedLane] = useState<string | null>(null);
  const [laneChange, setLaneChange] = useState<{ storyId: string; epicId: string | null; to: Status; beforeStoryId: string | null } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ storyId: string; warning: string; beforeStoryId: string | null } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const register = useCallback((storyId: string, element: HTMLElement | null) => {
    if (element) elements.current.set(storyId, element);
    else elements.current.delete(storyId);
  }, []);

  const relations = selected ? relationsOf(board, selected) : undefined;
  const highlightOf = (storyId: string): Highlight => {
    if (!selected || !relations) return undefined;
    if (storyId === selected) return 'selected';
    if (relations.predecessors.includes(storyId)) return 'predecessor';
    if (relations.successors.includes(storyId)) return 'successor';
    if (relations.related.includes(storyId)) return 'related';
    return 'dimmed';
  };

  // US-041 AC-2: connector lines from the selected card to its related cards.
  useLayoutEffect(() => {
    if (!selected || !relations || !container.current) return setLines([]);
    const origin = container.current.getBoundingClientRect();
    const centre = (id: string) => {
      const r = elements.current.get(id)?.getBoundingClientRect();
      return r ? { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 } : undefined;
    };
    const from = centre(selected);
    const next: Line[] = [];
    const add = (ids: string[], kind: Line['kind']) => {
      for (const id of ids) {
        const to = centre(id);
        if (from && to) next.push({ key: `${kind}-${id}`, kind, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
    };
    add(relations.predecessors, 'predecessor');
    add(relations.successors, 'successor');
    add(relations.related, 'related');
    setLines(next);
    // Recomputed when the selection or the board changes (relations derive from both).
  }, [selected, board]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const move = async (storyId: string, to: Status, beforeStoryId: string | null): Promise<void> => {
    const outcome = await onMove(storyId, to, beforeStoryId);
    // The board is re-read from the core after a move; a rejected move leaves the card where it was.
    setRejection(outcome.ok ? undefined : `${storyId}: ${outcome.reason}`);
  };

  /** US-043 AC-2: starting a story behind unstarted predecessors needs a confirmation. */
  const requestMove = (storyId: string, to: Status, beforeStoryId: string | null): void => {
    const card = board.columns.flatMap((c) => c.cards).find((c) => c.storyId === storyId);
    if (to === 'in_progress' && card?.status !== 'in_progress' && aiDisabledReason) {
      setRejection(`${storyId}: ${aiDisabledReason}`);
      return;
    }
    const warning = to === 'in_progress' && card?.status === 'ready' ? earlyQueueWarning(board, storyId) : null;
    if (warning) setConfirm({ storyId, warning, beforeStoryId });
    else void move(storyId, to, beforeStoryId);
  };

  const lanes = board.lanes ?? [];
  const byEpic = layout === 'epic' && lanes.length > 0;
  const colourOf = new Map(lanes.map((l) => [l.epicId, l.colour]));

  const dragEnd = (event: DragEndEvent): void => {
    const storyId = String(event.active.id);
    const target = resolveDrop(board, storyId, event.over ? String(event.over.id) : null);
    if (!target) return;
    const card = board.columns.flatMap((c) => c.cards).find((c) => c.storyId === storyId);
    // US-039 AC-3: dropping a card into another lane changes its epic after confirmation.
    if (byEpic && target.epicId !== undefined && (card?.epicId ?? null) !== target.epicId && onSetEpic) {
      setLaneChange({ storyId, epicId: target.epicId, to: target.to, beforeStoryId: target.beforeStoryId });
      return;
    }
    requestMove(storyId, target.to, target.beforeStoryId);
  };

  const renderCard = (card: Column['cards'][number]) => (
    <StoryCard
      key={card.storyId}
      card={card}
      board={board}
      highlight={highlightOf(card.storyId)}
      register={register}
      onMove={(to) => requestMove(card.storyId, to, null)}
      startDisabledReason={aiDisabledReason}
      epicColour={colourOf.get(card.epicId ?? null) ?? null}
      {...(byEpic && onSetEpic
        ? {
            epicOptions: lanes.map((l) => ({ epicId: l.epicId, label: l.epicId ? `${l.epicId} ${l.title}` : l.title })),
            onChangeEpic: (epicId: string | null) => setLaneChange({ storyId: card.storyId, epicId, to: card.status, beforeStoryId: null }),
          }
        : {})}
      {...(onRecover ? { onRecover: () => onRecover(card.storyId) } : {})}
      onOpen={() => setOpen(card.storyId)}
      onToggleDependencies={() => setSelected((s) => (s === card.storyId ? null : card.storyId))}
      {...(onRecheck
        ? {
            onRecheck: () => void onRecheck(card.storyId).then((o) => setRejection(o.ok ? undefined : `${card.storyId}: ${o.reason}`)),
          }
        : {})}
    />
  );

  const moveLane = (from: string, to: string) => {
    const ids = lanes.filter((l) => l.epicId !== null).map((l) => l.epicId!);
    // The moved lane takes the target's place (before it when moving up, after it when moving down).
    const target = ids.indexOf(to);
    ids.splice(ids.indexOf(from), 1);
    ids.splice(target, 0, from);
    void onReorderLanes?.(ids);
  };

  const openCard = open ? board.columns.flatMap((c) => c.cards).find((c) => c.storyId === open) : undefined;

  return (
    <div className="kanban" ref={container}>
      {rejection && (
        <p role="alert" className="banner banner-warning">
          {rejection}
        </p>
      )}
      {byEpic && (
        <label>
          Epic filter{' '}
          <select aria-label="Epic filter" value={epicFilter} onChange={(e) => setEpicFilter(e.target.value)}>
            <option value="all">All epics</option>
            {lanes.map((l) => (
              <option key={l.epicId ?? 'none'} value={l.epicId ?? 'none'}>
                {l.epicId ? `${l.epicId} ${l.title}` : l.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={dragEnd}>
        {!byEpic ? (
          <div className="kanban-columns">
            {board.columns.map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                {...(column.status === 'in_progress' && aiDisabledReason ? { title: aiDisabledReason } : {})}
              >
                {column.cards.map(renderCard)}
              </BoardColumn>
            ))}
          </div>
        ) : (
          lanes
            .filter((l) => epicFilter === 'all' || (l.epicId ?? 'none') === epicFilter)
            .map((lane, index, shown) => {
              const key = lane.epicId ?? 'none';
              const isCollapsed = collapsed.has(key);
              const name = lane.epicId ? `${lane.epicId} ${lane.title}` : lane.title;
              const { done, total, doneWeight, totalWeight } = lane.progress;
              return (
                <section
                  key={key}
                  aria-label={`Lane ${name}`}
                  className={`lane${lane.colour !== null ? ` epic-colour-${lane.colour}` : ''}`}
                >
                  <header
                    className="lane-header"
                    draggable={lane.epicId !== null}
                    onDragStart={() => setDraggedLane(lane.epicId)}
                    onDragOver={(e) => draggedLane && lane.epicId && e.preventDefault()}
                    onDrop={() => {
                      if (draggedLane && lane.epicId && draggedLane !== lane.epicId) moveLane(draggedLane, lane.epicId);
                      setDraggedLane(null);
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${name}`}
                      onClick={() =>
                        setCollapsed((c) => {
                          const next = new Set(c);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>{' '}
                    <strong>{name}</strong> <span className="badge">{lane.status.replaceAll('_', ' ')}</span>{' '}
                    <span>
                      {done}/{total} done · {doneWeight}/{totalWeight} points
                    </span>
                    <progress value={doneWeight} max={Math.max(totalWeight, 1)} aria-label={`Progress of ${name}`} />
                    {lane.epicId && (
                      <>
                        <button
                          type="button"
                          aria-label={`Move lane ${lane.epicId} up`}
                          disabled={index === 0}
                          onClick={() => moveLane(lane.epicId!, shown[index - 1]!.epicId!)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move lane ${lane.epicId} down`}
                          disabled={!shown[index + 1]?.epicId}
                          onClick={() => {
                            const next = shown[index + 1]!.epicId!;
                            moveLane(next, lane.epicId!);
                          }}
                        >
                          ↓
                        </button>
                      </>
                    )}
                  </header>
                  {!isCollapsed && (
                    <div className="kanban-columns">
                      {board.columns.map((column) => {
                        const cards = column.cards.filter((c) => (c.epicId ?? null) === lane.epicId);
                        return (
                          <BoardColumn
                            key={column.status}
                            column={{ ...column, cards }}
                            droppableId={`lane:${key}:${column.status}`}
                            label={`${name} · ${COLUMN_LABELS[column.status]} (${cards.length})`}
                            {...(column.status === 'in_progress' && aiDisabledReason ? { title: aiDisabledReason } : {})}
                          >
                            {cards.map(renderCard)}
                          </BoardColumn>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
        )}
      </DndContext>
      {laneChange && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="lane-change-title" className="dialog">
          <h2 id="lane-change-title">Move {laneChange.storyId} to another epic?</h2>
          <p>
            {laneChange.epicId ? `${laneChange.storyId} will belong to ${laneChange.epicId}.` : `${laneChange.storyId} will have no epic.`}
          </p>
          <button
            type="button"
            onClick={() => {
              const change = laneChange;
              setLaneChange(null);
              const card = board.columns.flatMap((c) => c.cards).find((c) => c.storyId === change.storyId);
              void onSetEpic!(change.storyId, change.epicId).then(() => {
                if (card && card.status !== change.to) requestMove(change.storyId, change.to, change.beforeStoryId);
              });
            }}
          >
            Move
          </button>
          <button type="button" onClick={() => setLaneChange(null)}>
            Cancel
          </button>
        </div>
      )}
      {lines.length > 0 && (
        <svg className="connectors" aria-hidden="true">
          {lines.map((l) => (
            <line key={l.key} data-connector={l.kind} className={`connector connector-${l.kind}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </svg>
      )}
      {confirm && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="early-queue-title" className="dialog">
          <h2 id="early-queue-title">Queue behind unstarted stories?</h2>
          <p>{confirm.warning}</p>
          <button
            type="button"
            onClick={() => {
              const { storyId, beforeStoryId } = confirm;
              setConfirm(null);
              void move(storyId, 'in_progress', beforeStoryId);
            }}
          >
            Queue anyway
          </button>
          <button type="button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
      {openCard && (
        <StoryDrawer
          key={openCard.storyId}
          card={openCard}
          board={board}
          onRemoveFromQueue={() => void move(openCard.storyId, 'ready', null)}
          {...(onAddDependency ? { onAddDependency: (d) => onAddDependency(openCard.storyId, d) } : {})}
          {...(onRemoveDependency ? { onRemoveDependency: (d) => onRemoveDependency(openCard.storyId, d) } : {})}
          onClose={() => setOpen(null)}
          {...(renderReview ? { review: renderReview(openCard.storyId) } : {})}
          {...(renderDetails ? { details: renderDetails(openCard.storyId) } : {})}
        />
      )}
    </div>
  );
}
