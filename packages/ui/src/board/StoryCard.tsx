// SPDX-License-Identifier: Apache-2.0
// Story card (US-038, US-041, US-043): ID, title, size, approval, execution/queue indicator, dependency badges,
// conflict files with Re-check, rework links (US-092), drag handle and the accessible "Move to" control.
import { GripVertical, Link2, LoaderCircle } from 'lucide-react';
import { StatusBadge, Tag, statusLabel, statusTone } from '../components/index.js';
import { Icon, STATUS_ICONS } from '../components/icons.js';
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

/** US-091: the latest in-flight decision of the story. */
const IN_FLIGHT_LABEL = {
  continue: 'Continue unchanged',
  cancel: 'Cancel / dequeue',
  apply_in_corrections: 'Apply in corrections',
} as const;

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
          <Icon icon={GripVertical} />
        </button>
        <button type="button" className="card-id link mono" aria-label={`Open ${card.storyId}`} onClick={onOpen}>
          {card.storyId}
        </button>
        <span className="card-status" title={statusLabel(card.subState !== 'none' ? card.subState : card.status)}>
          {card.subState === 'running' || card.subState === 'preparing' ? (
            <Icon icon={LoaderCircle} className="icon-spin" />
          ) : (
            <Icon icon={STATUS_ICONS[statusTone(card.subState !== 'none' ? card.subState : card.status)]} />
          )}
        </span>
      </header>
      <p className="card-title">{card.title}</p>
      <div className="card-badges">
        {card.epicId && <Tag {...(epicColour !== null ? { colour: epicColour } : {})}>{card.epicId}</Tag>}
        {card.size && <Tag>{card.size}</Tag>}
        {card.approval === 'approved' ? (
          <StatusBadge status="approved" label="Approved" />
        ) : (
          <StatusBadge status="draft" tone="warning" label="Draft" />
        )}
        {badges.blockedBy > 0 && <StatusBadge status="blocked" tone="warning" label={`Blocked by ${badges.blockedBy}`} />}
        {badges.blocks > 0 && <StatusBadge status="blocks" label={`Blocks ${badges.blocks}`} />}
        {badges.related > 0 && <StatusBadge status="related" label="Related" title={`Related to ${card.related.join(', ')}`} />}
        {(card.dependsOn.length > 0 || badges.blocks > 0 || badges.related > 0) && (
          <button
            type="button"
            className="link"
            aria-label={`Show dependencies of ${card.storyId}`}
            aria-pressed={highlight === 'selected'}
            onClick={onToggleDependencies}
          >
            <Icon icon={Link2} />
          </button>
        )}
      </div>
      {execution && <p className="card-execution">{execution}</p>}
      {conflict && (
        <>
          <p className="card-notice">Conflicting files: {card.waitingFor.join(', ')}</p>
          {onRecheck && (
            <button className="btn btn-secondary" type="button" aria-label={`Re-check ${card.storyId}`} onClick={onRecheck}>
              Re-check
            </button>
          )}
        </>
      )}
      {card.statusNotice && !conflict && <p className="card-notice">{card.statusNotice}</p>}
      {card.inFlight && (
        <p className="card-notice card-in-flight">
          {card.inFlight.featureId}: {IN_FLIGHT_LABEL[card.inFlight.decision]}
        </p>
      )}
      {(card.reworkedBy?.length ?? 0) > 0 && <p className="card-notice card-rework">Reworked by {card.reworkedBy!.join(', ')}</p>}
      {(card.reworks?.length ?? 0) > 0 && <p className="card-notice card-rework">Reworks {card.reworks!.join(', ')}</p>}
      {card.impact && (
        <p className="card-notice card-impact" title={`Changed: ${card.impact.sourceRef}`}>
          <StatusBadge status="impacted" label="Potentially impacted" /> <span>{card.impact.reason}</span>
        </p>
      )}
      {onRecover && (card.subState === 'failed' || card.subState === 'interrupted') && (
        <button className="btn btn-secondary" type="button" aria-label={`Recover ${card.storyId}`} onClick={onRecover}>
          Retry / resume…
        </button>
      )}
      {epicOptions && onChangeEpic && (
        <select
          className="select"
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
        <select
          className="select"
          aria-label={`Move ${card.storyId} to`}
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value as Status)}
        >
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
