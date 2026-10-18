// SPDX-License-Identifier: Apache-2.0
// Board-side dependency and queue helpers (US-041 badges and highlighting, US-043 queue reasons and warnings).
import { COLUMN_LABELS, type BoardCard as Card, type BoardData } from './types.js';

function cardsOf(board: BoardData): Map<string, Card> {
  return new Map(board.columns.flatMap((c) => c.cards).map((c) => [c.storyId, c]));
}

export function badgesFor(board: BoardData, storyId: string): { blockedBy: number; blocks: number; related: number } {
  const cards = cardsOf(board);
  const card = cards.get(storyId);
  if (!card) return { blockedBy: 0, blocks: 0, related: 0 };
  const open = (id: string) => cards.get(id)?.status !== 'done';
  return {
    blockedBy: card.dependsOn.filter(open).length,
    // A Done story no longer blocks anything.
    blocks: card.status === 'done' ? 0 : [...cards.values()].filter((c) => c.dependsOn.includes(storyId) && c.status !== 'done').length,
    related: card.related.length,
  };
}

export function relationsOf(board: BoardData, storyId: string): { predecessors: string[]; successors: string[]; related: string[] } {
  const cards = cardsOf(board);
  const card = cards.get(storyId);
  return {
    predecessors: card?.dependsOn ?? [],
    successors: [...cards.values()].filter((c) => c.dependsOn.includes(storyId)).map((c) => c.storyId),
    related: card?.related ?? [],
  };
}

export function queueLabel(board: BoardData, card: Card): string {
  if (card.subState === 'blocked_conflict' || card.queueReason === 'conflict') return 'Blocked (conflict)';
  const cards = cardsOf(board);
  switch (card.queueReason) {
    case 'dependency':
      return `Waiting for ${card.waitingFor.map((id) => `${id} (${COLUMN_LABELS[cards.get(id)?.status ?? 'backlog']})`).join(', ')}`;
    case 'slot':
      return `Waiting for run slot (${board.slots.active}/${board.slots.limit})`;
    case 'workspace':
      return 'Waiting for workspace';
    default:
      return 'Queued';
  }
}

/** US-043 AC-2: starting a story whose blocking predecessors have not been started yet. */
export function earlyQueueWarning(board: BoardData, storyId: string): string | null {
  const cards = cardsOf(board);
  const card = cards.get(storyId);
  const unstarted = (card?.dependsOn ?? []).filter((id) => {
    const status = cards.get(id)?.status;
    return status === 'backlog' || status === 'ready';
  });
  if (unstarted.length === 0) return null;
  const list = unstarted.map((id) => `${id} (${COLUMN_LABELS[cards.get(id)!.status]})`).join(', ');
  return `${storyId} depends on ${list}, which has not been started. It will wait in the queue until its predecessors are Done. Queue it anyway?`;
}
