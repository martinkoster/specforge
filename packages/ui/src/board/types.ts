// SPDX-License-Identifier: Apache-2.0
// Board data types and column labels shared by the board components (no component imports, so no cycles).
import type { QueryOutput } from '@specforge/ipc-contract';

export type BoardData = QueryOutput<'board.get'>;
export type BoardColumn = BoardData['columns'][number];
export type BoardCard = BoardColumn['cards'][number];
export type BoardStatus = BoardColumn['status'];

export const COLUMN_LABELS: Record<BoardStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};
