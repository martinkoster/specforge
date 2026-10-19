// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  BOARD_STATUSES,
  EXEC_SUB_STATES,
  STORY_COMMANDS,
  applyStoryCommand,
  isValidStoryState,
  moveStory,
  type BoardStatus,
  type ExecSubState,
  type Initiator,
  type StoryCommand,
  type StoryState,
} from '../src/index.js';

// The FR-021 specification, written independently of the implementation:
// command -> [initiator, allowed source states ("status/subState"), target state]
const SPEC: Record<StoryCommand, [Initiator, string[], string]> = {
  approveForReady: ['human', ['backlog/none'], 'ready/none'],
  moveToBacklog: ['human', ['ready/none'], 'backlog/none'],
  startImplementation: ['human', ['ready/none'], 'in_progress/queued'],
  removeFromQueue: ['human', ['in_progress/queued', 'in_progress/blocked_conflict'], 'ready/none'],
  detectConflict: ['system', ['in_progress/queued'], 'in_progress/blocked_conflict'],
  recheckConflict: ['human', ['in_progress/blocked_conflict'], 'in_progress/queued'],
  prepareRun: ['system', ['in_progress/queued'], 'in_progress/preparing'],
  startRun: ['system', ['in_progress/preparing'], 'in_progress/running'],
  requestPermission: ['system', ['in_progress/running'], 'in_progress/awaiting_permission'],
  resolvePermission: ['system', ['in_progress/awaiting_permission'], 'in_progress/running'],
  completeRun: ['system', ['in_progress/running', 'in_progress/awaiting_permission'], 'review/none'],
  failRun: ['system', ['in_progress/preparing', 'in_progress/running', 'in_progress/awaiting_permission'], 'in_progress/failed'],
  interruptRun: ['system', ['in_progress/preparing', 'in_progress/running', 'in_progress/awaiting_permission'], 'in_progress/interrupted'],
  cancelRun: ['human', ['in_progress/preparing', 'in_progress/running', 'in_progress/awaiting_permission'], 'ready/none'],
  retryRun: ['human', ['in_progress/failed', 'in_progress/interrupted'], 'in_progress/queued'],
  resumeRun: ['human', ['in_progress/failed', 'in_progress/interrupted'], 'in_progress/queued'],
  discardRun: ['human', ['in_progress/failed', 'in_progress/interrupted'], 'ready/none'],
  approveImplementation: ['human', ['review/none'], 'done/none'],
  requestCorrections: ['human', ['review/none'], 'in_progress/queued'],
  rejectImplementation: ['human', ['review/none'], 'ready/none'],
};

const INITIATORS: Initiator[] = ['human', 'system', 'agent'];

function allStates(): StoryState[] {
  const states: StoryState[] = [];
  for (const status of BOARD_STATUSES)
    for (const subState of EXEC_SUB_STATES)
      for (const approval of ['draft', 'approved'] as const) {
        const s = { status, subState, approval };
        if (isValidStoryState(s)) states.push(s);
      }
  return states;
}

const key = (s: { status: BoardStatus; subState: ExecSubState }) => `${s.status}/${s.subState}`;

describe('US-037 AC-1: FR-021 transition table with initiators and In Progress sub-states', () => {
  it('defines exactly the commands of the specification', () => {
    expect([...STORY_COMMANDS].sort()).toEqual(Object.keys(SPEC).sort());
  });

  it('only allows sub-state "none" outside In Progress and requires a sub-state inside', () => {
    expect(isValidStoryState({ status: 'review', subState: 'running', approval: 'approved' })).toBe(false);
    expect(isValidStoryState({ status: 'in_progress', subState: 'none', approval: 'approved' })).toBe(false);
    expect(allStates()).toHaveLength(2 * (4 + 7));
  });

  for (const [command, [initiator, from, to]] of Object.entries(SPEC) as Array<[StoryCommand, [Initiator, string[], string]]>) {
    it(`${command}: ${from.join(' | ')} → ${to} by ${initiator}`, () => {
      for (const state of allStates()) {
        if (command === 'approveForReady' && state.approval !== 'approved') continue; // covered by AC-2
        const result = applyStoryCommand(state, command, initiator);
        if (from.includes(key(state))) {
          expect(result.ok, `${command} from ${key(state)}`).toBe(true);
          if (result.ok) {
            expect(key(result.state)).toBe(to);
            expect(result.state.approval).toBe(state.approval);
          }
        } else {
          expect(result.ok, `${command} must be rejected from ${key(state)}`).toBe(false);
          if (!result.ok) expect(result.reason).toMatch(/not allowed/);
        }
      }
    });
  }
});

describe('US-037 AC-2: approval gate and explanations for illegal board moves', () => {
  it('refuses Backlog → Ready for a draft story with an explanation', () => {
    const result = moveStory({ status: 'backlog', subState: 'none', approval: 'draft' }, 'ready', 'human');

    expect(result).toEqual({ ok: false, reason: 'Approve this story before moving it to Ready.' });
  });

  it('allows Backlog → Ready for an approved story', () => {
    const result = moveStory({ status: 'backlog', subState: 'none', approval: 'approved' }, 'ready', 'human');

    expect(result).toEqual({ ok: true, state: { status: 'ready', subState: 'none', approval: 'approved' }, command: 'approveForReady' });
  });

  it.each<[string, BoardStatus, ExecSubState, BoardStatus, string]>([
    ['Ready → Backlog', 'ready', 'none', 'backlog', 'moveToBacklog'],
    ['Ready → In Progress (queued)', 'ready', 'none', 'in_progress', 'startImplementation'],
    ['queued In Progress → Ready', 'in_progress', 'queued', 'ready', 'removeFromQueue'],
    ['blocked In Progress → Ready', 'in_progress', 'blocked_conflict', 'ready', 'removeFromQueue'],
    ['running In Progress → Ready (cancel)', 'in_progress', 'running', 'ready', 'cancelRun'],
    ['failed In Progress → Ready (discard)', 'in_progress', 'failed', 'ready', 'discardRun'],
    ['Review → Done', 'review', 'none', 'done', 'approveImplementation'],
    ['Review → In Progress (corrections)', 'review', 'none', 'in_progress', 'requestCorrections'],
    ['Review → Ready (reject)', 'review', 'none', 'ready', 'rejectImplementation'],
  ])('maps the board move %s to its command', (_name, status, subState, to, command) => {
    const result = moveStory({ status, subState, approval: 'approved' }, to, 'human');

    expect(result.ok && result.command).toBe(command);
  });

  it.each<[BoardStatus, BoardStatus]>([
    ['backlog', 'in_progress'],
    ['backlog', 'review'],
    ['backlog', 'done'],
    ['ready', 'review'],
    ['ready', 'done'],
    ['in_progress', 'review'],
    ['in_progress', 'done'],
    ['in_progress', 'backlog'],
    ['review', 'backlog'],
    ['done', 'review'],
    ['done', 'ready'],
    ['done', 'backlog'],
    ['done', 'in_progress'],
  ])('rejects the board move %s → %s with an explanation', (from, to) => {
    const subState: ExecSubState = from === 'in_progress' ? 'running' : 'none';
    const result = moveStory({ status: from, subState, approval: 'approved' }, to, 'human');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(10);
  });

  it('rejects a move to the same column', () => {
    expect(moveStory({ status: 'ready', subState: 'none', approval: 'approved' }, 'ready', 'human').ok).toBe(false);
  });
});

describe('US-037 AC-3: agent-initiated and wrong-initiator transitions are rejected (FR-023)', () => {
  it.each(STORY_COMMANDS)('rejects %s when initiated by an agent', (command) => {
    for (const state of allStates()) {
      const result = applyStoryCommand(state, command, 'agent');
      expect(result).toEqual({ ok: false, reason: 'Agents cannot change story state; they may only recommend transitions.' });
    }
  });

  it.each(Object.entries(SPEC) as Array<[StoryCommand, [Initiator, string[], string]]>)(
    'rejects %s by the wrong initiator',
    (command, [initiator, from]) => {
      const wrong: Initiator = initiator === 'human' ? 'system' : 'human';
      const [status, subState] = from[0]!.split('/') as [BoardStatus, ExecSubState];
      const result = applyStoryCommand({ status, subState, approval: 'approved' }, command, wrong);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(new RegExp(`only by the ${initiator}`));
    },
  );

  it('rejects board moves initiated by the system or an agent', () => {
    for (const initiator of ['system', 'agent'] as Initiator[]) {
      expect(moveStory({ status: 'ready', subState: 'none', approval: 'approved' }, 'in_progress', initiator).ok).toBe(false);
    }
  });

  it('never accepts an invalid state as input', () => {
    const result = applyStoryCommand({ status: 'done', subState: 'running', approval: 'approved' }, 'approveImplementation', 'human');
    expect(result).toEqual({ ok: false, reason: 'Invalid story state done/running.' });
  });

  it('covers all initiators in the test matrix', () => {
    expect(INITIATORS).toHaveLength(3);
  });
});
