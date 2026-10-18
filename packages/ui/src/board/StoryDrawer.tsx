// SPDX-License-Identifier: Apache-2.0
// Story drawer (US-043 AC-3, US-040 AC-1): status, queue position, Remove from queue, dependency editor; the review of
// stories in Review (US-057); its trace and rejected branches (US-034, US-058).
import { useEffect, useState, type ReactNode } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import { DependencyEditor, type DependencyEditorProps } from '../stories/DependencyEditor.js';
import { COLUMN_LABELS, type BoardCard as Card, type BoardData } from './types.js';
import { queueLabel } from './dependencies.js';

export interface StoryDrawerProps {
  card: Card;
  board: BoardData;
  onRemoveFromQueue(): void;
  onAddDependency?: DependencyEditorProps['onAdd'];
  onRemoveDependency?: DependencyEditorProps['onRemove'];
  onClose(): void;
  /** Review content for stories in Review (US-057). */
  review?: ReactNode;
  /** Trace (US-034) and rejected branches (US-058) of the story. */
  details?: ReactNode;
}

const noChange = async (): Promise<CommandOutput<'stories.addDependency'>> => ({
  ok: false,
  reason: 'Dependencies cannot be edited here.',
});

export function StoryDrawer({
  card,
  board,
  onRemoveFromQueue,
  onAddDependency,
  onRemoveDependency,
  onClose,
  review,
  details,
}: StoryDrawerProps) {
  const position = board.queue.indexOf(card.storyId);
  const queued = card.subState === 'queued' || card.subState === 'blocked_conflict';
  // The review stays after the decision (merge instructions, US-058) until the drawer is closed.
  const [reviewed, setReviewed] = useState(card.status === 'review');
  useEffect(() => {
    if (card.status === 'review') setReviewed(true);
  }, [card.status]);
  return (
    <div role="dialog" aria-label={`${card.storyId} ${card.title}`} className="drawer">
      <header className="drawer-header">
        <h2>
          {card.storyId} {card.title}
        </h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <p>
        {COLUMN_LABELS[card.status]}
        {queued && ` · ${queueLabel(board, card)}`}
      </p>
      {queued && position >= 0 && (
        <p>
          Position {position + 1} of {board.queue.length} in the queue
        </p>
      )}
      {queued && (
        <button type="button" onClick={onRemoveFromQueue}>
          Remove from queue
        </button>
      )}
      {(card.status === 'review' || (reviewed && card.status === 'done')) && review}
      <DependencyEditor
        storyId={card.storyId}
        dependencies={[
          ...card.dependsOn.map((to) => ({ to, type: 'blocking' as const })),
          ...card.related.map((to) => ({ to, type: 'related' as const })),
        ]}
        storyIds={board.columns.flatMap((c) => c.cards.map((k) => k.storyId)).sort()}
        onAdd={onAddDependency ?? noChange}
        onRemove={onRemoveDependency ?? noChange}
      />
      {details}
    </div>
  );
}
