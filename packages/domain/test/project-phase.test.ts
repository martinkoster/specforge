// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { currentPhase, phaseLabel, phaseLoopStep, phaseState, phaseStepper, unapprovedInputs, type PhaseInputs } from '../src/index.js';

const none: PhaseInputs = {
  intent: { approvals: [], impacted: false },
  requirements: { approvals: [], impacted: false },
  design: { approvals: [], impacted: false },
  stories: { approvals: [], impacted: false },
};

describe('US-017 AC-1: project phase shown in the recent-projects list (PhaseStatus, domain_model.md)', () => {
  it('derives the state of one phase from artifact approvals and impact flags', () => {
    expect(phaseState({ approvals: [], impacted: false })).toBe('not_started');
    expect(phaseState({ approvals: ['approved', 'draft'], impacted: false })).toBe('awaiting_approval');
    expect(phaseState({ approvals: ['draft'], impacted: false }, { generating: true })).toBe('in_progress');
    expect(phaseState({ approvals: [], impacted: false }, { generating: true })).toBe('in_progress');
    expect(phaseState({ approvals: ['approved', 'approved'], impacted: false })).toBe('approved');
    expect(phaseState({ approvals: ['approved'], impacted: true })).toBe('impacted');
  });

  it('the current phase is the first phase that is not approved', () => {
    expect(currentPhase(none)).toEqual({ phase: 'intent', state: 'not_started' });
    expect(
      currentPhase({
        ...none,
        intent: { approvals: ['approved'], impacted: false },
        requirements: { approvals: ['approved'], impacted: false },
        design: { approvals: ['draft'], impacted: false },
      }),
    ).toEqual({ phase: 'design', state: 'awaiting_approval' });
    expect(currentPhase({ ...none, intent: { approvals: ['draft'], impacted: false } }, ['intent'])).toEqual({
      phase: 'intent',
      state: 'in_progress',
    });
  });

  it('is on the Kanban board once all specification phases are approved', () => {
    const approved = { approvals: ['approved' as const], impacted: false };
    expect(currentPhase({ intent: approved, requirements: approved, design: approved, stories: approved })).toEqual({
      phase: 'kanban',
      state: 'in_progress',
    });
  });

  it('formats a phase chip label', () => {
    expect(phaseLabel({ phase: 'design', state: 'awaiting_approval' })).toBe('Design · awaiting approval');
    expect(phaseLabel({ phase: 'intent', state: 'not_started' })).toBe('Intent · not started');
    expect(phaseLabel({ phase: 'kanban', state: 'in_progress' })).toBe('Kanban · in progress');
  });
});

describe('US-033: phase stepper (FR-080, FR-081)', () => {
  const approved = { approvals: ['approved' as const], impacted: false };

  it('AC-1/AC-4: five phases with derived status; the recommended phase; Kanban enabled once stories exist', () => {
    const stepper = phaseStepper({ ...none, intent: approved, requirements: { approvals: ['draft'], impacted: false } }, { storyCount: 0 });
    expect(stepper.phases.map((p) => [p.phase, p.state, p.enabled])).toEqual([
      ['intent', 'approved', true],
      ['requirements', 'awaiting_approval', true],
      ['design', 'not_started', true],
      ['stories', 'not_started', true],
      ['kanban', 'not_started', false],
    ]);
    expect(stepper.recommended).toBe('requirements');

    const ready = phaseStepper({ intent: approved, requirements: approved, design: approved, stories: approved }, { storyCount: 3 });
    expect(ready.phases.at(-1)).toMatchObject({ phase: 'kanban', state: 'in_progress', enabled: true });
    expect(ready.recommended).toBe('kanban');
  });

  it('AC-2: the loop step of a phase: write/generate → quality check → review & refine → approve', () => {
    expect(phaseLoopStep('not_started', false)).toBe('write');
    expect(phaseLoopStep('in_progress', false)).toBe('write');
    expect(phaseLoopStep('awaiting_approval', false)).toBe('quality_check');
    expect(phaseLoopStep('awaiting_approval', true)).toBe('review');
    expect(phaseLoopStep('impacted', true)).toBe('review');
    expect(phaseLoopStep('approved', true)).toBe('approve');
    const stepper = phaseStepper(
      { ...none, intent: { approvals: ['draft'], impacted: false } },
      { storyCount: 0, qualityChecked: ['intent'] },
    );
    expect(stepper.phases[0]).toMatchObject({ phase: 'intent', step: 'review' });
  });

  it('AC-3: soft gate — the unapproved input phases of a phase', () => {
    const inputs = { ...none, intent: approved, requirements: { approvals: ['draft' as const], impacted: false } };
    expect(unapprovedInputs('intent', inputs)).toEqual([]);
    expect(unapprovedInputs('requirements', inputs)).toEqual([]);
    expect(unapprovedInputs('design', inputs)).toEqual(['requirements']);
    expect(unapprovedInputs('stories', inputs)).toEqual(['requirements', 'design']);
    expect(unapprovedInputs('kanban', inputs)).toEqual(['requirements', 'design', 'stories']);
  });
});
