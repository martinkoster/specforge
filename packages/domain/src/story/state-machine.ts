// SPDX-License-Identifier: Apache-2.0
// Story board state machine (FR-021, FR-023, FR-025): pure, framework-free domain logic.

export const BOARD_STATUSES = ['backlog', 'ready', 'in_progress', 'review', 'done'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const EXEC_SUB_STATES = [
  'none',
  'queued',
  'blocked_conflict',
  'preparing',
  'running',
  'awaiting_permission',
  'failed',
  'interrupted',
] as const;
export type ExecSubState = (typeof EXEC_SUB_STATES)[number];

export type Approval = 'draft' | 'approved';
export type Initiator = 'human' | 'system' | 'agent';

export interface StoryState {
  status: BoardStatus;
  subState: ExecSubState;
  approval: Approval;
}

type Position = `${BoardStatus}/${ExecSubState}`;

interface Rule {
  initiator: Exclude<Initiator, 'agent'>;
  from: readonly Position[];
  to: Position;
}

const ACTIVE_RUN: readonly Position[] = ['in_progress/preparing', 'in_progress/running', 'in_progress/awaiting_permission'];
const STOPPED_RUN: readonly Position[] = ['in_progress/failed', 'in_progress/interrupted'];

const RULES = {
  approveForReady: { initiator: 'human', from: ['backlog/none'], to: 'ready/none' },
  moveToBacklog: { initiator: 'human', from: ['ready/none'], to: 'backlog/none' },
  startImplementation: { initiator: 'human', from: ['ready/none'], to: 'in_progress/queued' },
  removeFromQueue: { initiator: 'human', from: ['in_progress/queued', 'in_progress/blocked_conflict'], to: 'ready/none' },
  detectConflict: { initiator: 'system', from: ['in_progress/queued'], to: 'in_progress/blocked_conflict' },
  recheckConflict: { initiator: 'human', from: ['in_progress/blocked_conflict'], to: 'in_progress/queued' },
  prepareRun: { initiator: 'system', from: ['in_progress/queued'], to: 'in_progress/preparing' },
  startRun: { initiator: 'system', from: ['in_progress/preparing'], to: 'in_progress/running' },
  requestPermission: { initiator: 'system', from: ['in_progress/running'], to: 'in_progress/awaiting_permission' },
  resolvePermission: { initiator: 'system', from: ['in_progress/awaiting_permission'], to: 'in_progress/running' },
  completeRun: { initiator: 'system', from: ['in_progress/running', 'in_progress/awaiting_permission'], to: 'review/none' },
  failRun: { initiator: 'system', from: ACTIVE_RUN, to: 'in_progress/failed' },
  interruptRun: { initiator: 'system', from: ACTIVE_RUN, to: 'in_progress/interrupted' },
  cancelRun: { initiator: 'human', from: ACTIVE_RUN, to: 'ready/none' },
  retryRun: { initiator: 'human', from: STOPPED_RUN, to: 'in_progress/queued' },
  /** Session resume of the stopped run (UC-023, FR-026); like a retry, started via the Scheduler. */
  resumeRun: { initiator: 'human', from: STOPPED_RUN, to: 'in_progress/queued' },
  discardRun: { initiator: 'human', from: STOPPED_RUN, to: 'ready/none' },
  approveImplementation: { initiator: 'human', from: ['review/none'], to: 'done/none' },
  requestCorrections: { initiator: 'human', from: ['review/none'], to: 'in_progress/queued' },
  rejectImplementation: { initiator: 'human', from: ['review/none'], to: 'ready/none' },
} as const satisfies Record<string, Rule>;

export type StoryCommand = keyof typeof RULES;
export const STORY_COMMANDS = Object.keys(RULES) as StoryCommand[];

export type TransitionResult = { ok: true; state: StoryState } | { ok: false; reason: string };
export type MoveResult = { ok: true; state: StoryState; command: StoryCommand } | { ok: false; reason: string };

const position = (s: Pick<StoryState, 'status' | 'subState'>): Position => `${s.status}/${s.subState}`;

/** Sub-state "none" exactly outside In Progress; any other sub-state only inside In Progress. */
export function isValidStoryState(state: StoryState): boolean {
  return (state.status === 'in_progress') === (state.subState !== 'none');
}

export function applyStoryCommand(state: StoryState, command: StoryCommand, initiator: Initiator): TransitionResult {
  if (!isValidStoryState(state)) return { ok: false, reason: `Invalid story state ${position(state)}.` };
  if (initiator === 'agent') return { ok: false, reason: 'Agents cannot change story state; they may only recommend transitions.' };
  const rule: Rule = RULES[command];
  if (rule.initiator !== initiator) return { ok: false, reason: `${command} can be performed only by the ${rule.initiator}.` };
  if (!rule.from.includes(position(state))) return { ok: false, reason: `${command} is not allowed from ${position(state)}.` };
  if (command === 'approveForReady' && state.approval !== 'approved') {
    return { ok: false, reason: 'Approve this story before moving it to Ready.' };
  }
  const [status, subState] = rule.to.split('/') as [BoardStatus, ExecSubState];
  return { ok: true, state: { ...state, status, subState } };
}

/** Board drag & drop: maps a human column move to the command it represents (FR-021). */
function commandForMove(from: StoryState, to: BoardStatus): StoryCommand | undefined {
  switch (`${from.status}->${to}`) {
    case 'backlog->ready':
      return 'approveForReady';
    case 'ready->backlog':
      return 'moveToBacklog';
    case 'ready->in_progress':
      return 'startImplementation';
    case 'in_progress->ready':
      if (from.subState === 'queued' || from.subState === 'blocked_conflict') return 'removeFromQueue';
      if (from.subState === 'failed' || from.subState === 'interrupted') return 'discardRun';
      return 'cancelRun';
    case 'review->done':
      return 'approveImplementation';
    case 'review->in_progress':
      return 'requestCorrections';
    case 'review->ready':
      return 'rejectImplementation';
    default:
      return undefined;
  }
}

const MOVE_HINTS: Partial<Record<BoardStatus, string>> = {
  review: 'Stories enter Review automatically when their run completes.',
  done: 'Only stories in Review can be approved as Done.',
  in_progress: 'Only Ready stories can be started, and only Review stories can go back for corrections.',
  backlog: 'Only Ready stories can be moved back to the Backlog.',
};

export function moveStory(state: StoryState, to: BoardStatus, initiator: Initiator): MoveResult {
  const command = commandForMove(state, to);
  if (!command) {
    const hint = MOVE_HINTS[to] ?? 'This move is not part of the workflow.';
    return { ok: false, reason: `Moving a story from ${state.status} to ${to} is not allowed. ${hint}` };
  }
  const result = applyStoryCommand(state, command, initiator);
  return result.ok ? { ok: true, state: result.state, command } : result;
}
