// SPDX-License-Identifier: Apache-2.0
// Story card (US-038, US-041, US-043): ID, title, size, approval, execution/queue indicator, dependency badges,
// conflict files with Re-check, drag handle and the accessible "Move to" control.
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { COLUMN_LABELS, type BoardCard as Card, type BoardData, type BoardStatus as Status } from './types.js';
import { badgesFor, queueLabel } from './dependencies.js';

const SUB_STATE_LABELS: Record<Card['subState'], string | null> = {
  none: null,
  queued: null,
  blocked_conflict: null,
  preparing: 'Preparing',
  running: 'Running',
  awaiting_permission: 'Awaiting permission',
  failed: 'Failed',
  interrupted: 'Interrupted',
};

export type Highlight = 'selected' | 'predecessor' | 'successor' | 'related' | 'dimmed' | undefined;

export interface StoryCardProps {
  card: Card;
  board: BoardData;
  highlight: Highlight;
  register(storyId: string, element: HTMLElement | null): void;
  onMove(to: Status): void;
  /** Retry / resume / discard of a failed or interrupted run (US-055). */
  onRecover?(): void;
  /** Colour index of the card's epic (US-039); null = no tag colour. */
  epicColour?: number | null;
  /** Epic lanes the card can move to (keyboard alternative to dragging between lanes, US-039 AC-3). */
  epicOptions?: { epicId: string | null; label: string }[];
  onChangeEpic?(epicId: string | null): void;
  /** Starting (→ In Progress) is disabled with this reason (US-013). */
  startDisabledReason?: string | null;
  onOpen(): void;
  onToggleDependencies(): void;
  onRecheck?(): void;
}

export function StoryCard({
  card,
  board,
  highlight,
  register,
  onMove,
  onOpen,
  onToggleDependencies,
  onRecheck,
  startDisabledReason = null,
  onRecover,
  epicColour = null,
  epicOptions,
  onChangeEpic,
}: StoryCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.storyId });
  const badges = badgesFor(board, card.storyId);
  const queued = card.subState === 'queued' || card.subState === 'blocked_conflict';
  const execution = queued ? queueLabel(board, card) : SUB_STATE_LABELS[card.subState];
  const conflict = card.subState === 'blocked_conflict' || card.queueReason === 'conflict';
  const classes = ['card', isDragging && 'card-dragging', highlight && `card-${highlight}`].filter(Boolean).join(' ');

  return (
    <article
      ref={(el) => {
        setNodeRef(el);
        register(card.storyId, el);
      }}
      aria-label={`${card.storyId} ${card.title}`}
      className={classes}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <header>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${card.storyId}`}
        >
          ⠿
        </button>
        <button type="button" className="card-id link" aria-label={`Open ${card.storyId}`} onClick={onOpen}>
          {card.storyId}
        </button>
        {card.size && <span className="badge">{card.size}</span>}
        <span className={card.approval === 'approved' ? 'badge' : 'badge badge-warning'}>
          {card.approval === 'approved' ? 'Approved' : 'Draft'}
        </span>
      </header>
      <p className="card-title">{card.title}</p>
      <div className="card-badges">
        {badges.blockedBy > 0 && <span className="badge badge-warning">Blocked by {badges.blockedBy}</span>}
        {badges.blocks > 0 && <span className="badge">Blocks {badges.blocks}</span>}
        {badges.related > 0 && (
          <span className="badge" title={`Related to ${card.related.join(', ')}`}>
            Related
          </span>
        )}
        {(card.dependsOn.length > 0 || badges.blocks > 0 || badges.related > 0) && (
          <button
            type="button"
            className="link"
            aria-label={`Show dependencies of ${card.storyId}`}
            aria-pressed={highlight === 'selected'}
            onClick={onToggleDependencies}
          >
            ⛓
          </button>
        )}
      </div>
      {execution && <p className="card-execution">{execution}</p>}
      {conflict && (
        <>
          <p className="card-notice">Conflicting files: {card.waitingFor.join(', ')}</p>
          {onRecheck && (
            <button type="button" aria-label={`Re-check ${card.storyId}`} onClick={onRecheck}>
              Re-check
            </button>
          )}
        </>
      )}
      {card.epicId && <span className={`epic-tag${epicColour !== null ? ` epic-colour-${epicColour}` : ''}`}>{card.epicId}</span>}
      {card.statusNotice && !conflict && <p className="card-notice">{card.statusNotice}</p>}
      {onRecover && (card.subState === 'failed' || card.subState === 'interrupted') && (
        <button type="button" aria-label={`Recover ${card.storyId}`} onClick={onRecover}>
          Retry / resume…
        </button>
      )}
      {epicOptions && onChangeEpic && (
        <select
          aria-label={`Move ${card.storyId} to epic`}
          value=""
          onChange={(e) => e.target.value && onChangeEpic(e.target.value === 'none' ? null : e.target.value)}
        >
          <option value="">Epic…</option>
          {epicOptions
            .filter((o) => o.epicId !== (card.epicId ?? null))
            .map((o) => (
              <option key={o.epicId ?? 'none'} value={o.epicId ?? 'none'}>
                {o.label}
              </option>
            ))}
        </select>
      )}
      <label>
        <span className="visually-hidden">Move {card.storyId} to</span>
        <select aria-label={`Move ${card.storyId} to`} value="" onChange={(e) => e.target.value && onMove(e.target.value as Status)}>
          <option value="">Move to…</option>
          {(Object.keys(COLUMN_LABELS) as Status[])
            .filter((s) => s !== card.status)
            .map((s) => (
              <option
                key={s}
                value={s}
                disabled={s === 'in_progress' && startDisabledReason !== null}
                title={s === 'in_progress' && startDisabledReason !== null ? startDisabledReason : undefined}
              >
                {COLUMN_LABELS[s]}
              </option>
            ))}
        </select>
      </label>
    </article>
  );
}
