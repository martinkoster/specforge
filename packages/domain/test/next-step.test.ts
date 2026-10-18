// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { nextStep, type NextStepInput, type PhaseInputs } from '../src/index.js';

const approved = { approvals: ['approved' as const], impacted: false };
const allApproved: PhaseInputs = { intent: approved, requirements: approved, design: approved, stories: approved };

/** A project with nothing to do: everything approved, all stories Done and merged. */
const idle: NextStepInput = {
  setupComplete: true,
  pendingPermissions: 0,
  failedRuns: [],
  reviewStories: [],
  conflictStories: [],
  epicsAwaitingReview: [],
  decisionsInFlight: 0,
  phases: allApproved,
  generating: [],
  openDecisions: 0,
  readyStories: 0,
  freeSlots: 3,
  approvedUnmerged: 0,
  storyCount: 4,
  doneStories: 4,
};

describe('US-060 AC-1/AC-4: next step by fixed priority (ADR-017)', () => {
  it('(1) setup incomplete beats everything', () => {
    expect(nextStep({ ...idle, setupComplete: false, pendingPermissions: 2 })).toMatchObject({
      code: 'complete_setup',
      target: { area: 'setup' },
    });
  });

  it('(2) pending permission requests', () => {
    expect(nextStep({ ...idle, pendingPermissions: 2, failedRuns: ['US-001'] })).toMatchObject({
      code: 'answer_permissions',
      label: 'Answer 2 permission requests',
      target: { area: 'pending' },
    });
    expect(nextStep({ ...idle, pendingPermissions: 1 }).label).toBe('Answer 1 permission request');
  });

  it('(3) failed or interrupted runs', () => {
    expect(nextStep({ ...idle, failedRuns: ['US-004', 'US-002'], reviewStories: ['US-003'] })).toMatchObject({
      code: 'handle_failed_runs',
      label: 'Handle 2 failed or interrupted runs',
      target: { area: 'kanban', storyId: 'US-002' },
    });
  });

  it('(4) stories in Review', () => {
    expect(nextStep({ ...idle, reviewStories: ['US-003'], conflictStories: ['US-005'] })).toMatchObject({
      code: 'review_stories',
      label: 'Review US-003',
      target: { area: 'kanban', storyId: 'US-003' },
    });
    expect(nextStep({ ...idle, reviewStories: ['US-007', 'US-003'] }).label).toBe('Review 2 stories');
  });

  it('(5) blocked queue (conflict)', () => {
    expect(nextStep({ ...idle, conflictStories: ['US-005'], epicsAwaitingReview: ['EP-001'] })).toMatchObject({
      code: 'resolve_conflicts',
      target: { area: 'kanban', storyId: 'US-005' },
    });
  });

  it('(5b) epics ready for epic review and (5c) decisions in flight', () => {
    expect(nextStep({ ...idle, epicsAwaitingReview: ['EP-002', 'EP-001'], decisionsInFlight: 1 })).toMatchObject({
      code: 'review_epic',
      label: 'Review epic EP-001',
    });
    expect(
      nextStep({ ...idle, decisionsInFlight: 1, phases: { ...allApproved, design: { approvals: [], impacted: false } } }),
    ).toMatchObject({
      code: 'finish_decisions',
    });
  });

  it('(6) current phase action: write, generate, approve, impacted, generation running', () => {
    const empty = { approvals: [], impacted: false };
    const draft = { approvals: ['draft' as const], impacted: false };
    expect(nextStep({ ...idle, phases: { intent: empty, requirements: empty, design: empty, stories: empty } })).toMatchObject({
      code: 'write_intent',
      target: { area: 'intent' },
    });
    expect(nextStep({ ...idle, phases: { intent: draft, requirements: empty, design: empty, stories: empty } })).toMatchObject({
      code: 'approve_phase',
      label: 'Review and approve the intent',
    });
    expect(nextStep({ ...idle, phases: { ...allApproved, requirements: empty, design: empty, stories: empty } })).toMatchObject({
      code: 'generate_phase',
      label: 'Generate the requirements',
      target: { area: 'specifications', generate: 'requirements' },
    });
    expect(nextStep({ ...idle, phases: { ...allApproved, stories: empty } })).toMatchObject({ label: 'Generate epics and user stories' });
    expect(nextStep({ ...idle, phases: { ...allApproved, design: { approvals: ['approved'], impacted: true } } })).toMatchObject({
      code: 'review_impacted',
      label: 'Review the potentially impacted design',
    });
    expect(nextStep({ ...idle, phases: { ...allApproved, design: empty }, generating: ['design'] })).toMatchObject({
      code: 'wait_generation',
      label: 'Design generation is running',
    });
  });

  it('(7) open decision items', () => {
    expect(nextStep({ ...idle, openDecisions: 2, readyStories: 1 })).toMatchObject({ code: 'decide_items', label: 'Decide 2 open items' });
  });

  it('(8) Ready stories with free slots; no free slot falls through', () => {
    expect(nextStep({ ...idle, readyStories: 3, freeSlots: 2, approvedUnmerged: 1, doneStories: 1 })).toMatchObject({
      code: 'start_stories',
      label: 'Start stories (3 ready, 2 free slots)',
      target: { area: 'kanban' },
    });
    expect(nextStep({ ...idle, readyStories: 3, freeSlots: 0, approvedUnmerged: 1, doneStories: 1 }).code).toBe('merge_branches');
  });

  it('(9) approved unmerged branches', () => {
    expect(nextStep({ ...idle, approvedUnmerged: 2 })).toMatchObject({ code: 'merge_branches', label: 'Merge 2 approved branches' });
  });

  it('(10) all Done → plan next increment; otherwise move stories forward', () => {
    expect(nextStep(idle)).toMatchObject({ code: 'plan_next_increment', label: 'Plan next increment' });
    expect(nextStep({ ...idle, doneStories: 2 })).toMatchObject({ code: 'prepare_stories', target: { area: 'kanban' } });
  });

  it('every step explains why it is recommended', () => {
    expect(nextStep({ ...idle, reviewStories: ['US-003'] }).reason).toMatch(/waiting for your review/);
  });
});
