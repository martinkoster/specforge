// SPDX-License-Identifier: Apache-2.0
// US-084: feature-scoped phase stepper (FR-105, FR-080 soft gates, ADR-017) and feature steps of the next-step engine.
import { describe, expect, it } from 'vitest';
import {
  FEATURE_PHASES,
  featurePhases,
  featureNextStep,
  maintenanceMode,
  nextStep,
  type FeatureProgress,
  type NextStepInput,
} from '../src/index.js';

const progress = (over: Partial<FeatureProgress> = {}): FeatureProgress => ({
  id: 'FI-001',
  title: 'Task comments',
  approval: 'approved',
  status: 'approved',
  impact: 'not_started',
  requirementsDelta: 'none',
  designDelta: 'none',
  stories: [],
  epicReviewed: false,
  ...over,
});

const states = (p: FeatureProgress) => featurePhases(p).phases.map((x) => `${x.phase}:${x.state}`);

describe('US-084 AC-1/AC-2: feature stepper', () => {
  it('has the seven feature phases', () => {
    expect(FEATURE_PHASES).toEqual(['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review']);
  });

  it('derives the phase states from the feature, its impact, delta change sets and stories', () => {
    expect(states(progress({ approval: 'draft', status: 'draft' }))).toEqual([
      'intent:awaiting_approval',
      'impact:not_started',
      'requirements:not_started',
      'design:not_started',
      'stories:not_started',
      'kanban:not_started',
      'epic_review:not_started',
    ]);
    expect(
      states(
        progress({
          impact: 'confirmed',
          requirementsDelta: 'applied',
          designDelta: 'open',
          stories: [
            { status: 'done', approval: 'approved' },
            { status: 'in_progress', approval: 'approved' },
          ],
        }),
      ),
    ).toEqual([
      'intent:approved',
      'impact:approved',
      'requirements:approved',
      'design:awaiting_approval',
      'stories:approved',
      'kanban:in_progress',
      'epic_review:not_started',
    ]);
    expect(states(progress({ impact: 'proposed', stories: [{ status: 'backlog', approval: 'draft' }] }))).toContain(
      'stories:awaiting_approval',
    );
    expect(states(progress({ impact: 'analysing' }))).toContain('impact:in_progress');
    expect(
      states(
        progress({
          impact: 'confirmed',
          requirementsDelta: 'applied',
          designDelta: 'applied',
          stories: [{ status: 'done', approval: 'approved' }],
        }),
      ),
    ).toEqual(expect.arrayContaining(['kanban:approved', 'epic_review:awaiting_approval']));
    expect(states(progress({ stories: [{ status: 'done', approval: 'approved' }], epicReviewed: true }))).toContain('epic_review:approved');
  });

  it('soft gates: a later phase lists unapproved earlier phases but stays enabled; the current phase is the first open one', () => {
    const { phases, current } = featurePhases(progress({ approval: 'draft', status: 'draft', requirementsDelta: 'open' }));
    const requirements = phases.find((p) => p.phase === 'requirements')!;
    expect(requirements).toMatchObject({ enabled: true, unapprovedEarlier: ['intent', 'impact'] });
    expect(phases[0]).toMatchObject({ unapprovedEarlier: [] });
    expect(current).toBe('intent');
    expect(featurePhases(progress({ impact: 'confirmed' })).current).toBe('requirements');
  });
});

describe('US-084 AC-3/AC-5: parallel features in the next-step engine', () => {
  it('names the feature step per phase', () => {
    expect(featureNextStep(progress({ approval: 'draft', status: 'draft' }))?.label).toBe('Approve FI-001 Task comments');
    expect(featureNextStep(progress())?.label).toBe('Analyse the impact of FI-001');
    expect(featureNextStep(progress({ impact: 'proposed' }))?.label).toBe('Review impact of FI-001');
    expect(featureNextStep(progress({ impact: 'confirmed', requirementsDelta: 'open' }))?.label).toBe(
      'Approve delta requirements for FI-001',
    );
    expect(featureNextStep(progress({ impact: 'confirmed' }))?.label).toBe('Generate delta requirements for FI-001');
    expect(featureNextStep(progress({ impact: 'confirmed', requirementsDelta: 'applied', designDelta: 'open' }))?.label).toBe(
      'Approve delta design for FI-001',
    );
    expect(featureNextStep(progress({ impact: 'confirmed', requirementsDelta: 'applied', designDelta: 'applied' }))?.label).toBe(
      'Plan the epic and stories for FI-001',
    );
    expect(
      featureNextStep(
        progress({
          impact: 'confirmed',
          requirementsDelta: 'applied',
          designDelta: 'applied',
          stories: [{ status: 'backlog', approval: 'draft' }],
        }),
      )?.label,
    ).toBe('Approve the stories of FI-001');
    expect(
      featureNextStep(
        progress({
          impact: 'confirmed',
          requirementsDelta: 'applied',
          designDelta: 'applied',
          stories: [{ status: 'done', approval: 'approved' }],
        }),
      )?.label,
    ).toBe('Review the epic of FI-001');
    expect(featureNextStep(progress({ impact: 'analysing' }))?.code).toBe('wait_feature');
    expect(featureNextStep(progress({ status: 'done' }))).toBeUndefined();
    expect(featureNextStep(progress({ status: 'withdrawn' }))).toBeUndefined();
    expect(
      featureNextStep(
        progress({
          impact: 'confirmed',
          requirementsDelta: 'applied',
          designDelta: 'applied',
          stories: [{ status: 'ready', approval: 'approved' }],
        }),
      ),
    ).toBeUndefined();
    expect(featureNextStep(progress())?.target).toEqual({ area: 'feature', featureId: 'FI-001' });
  });

  const base: NextStepInput = {
    setupComplete: true,
    pendingPermissions: 0,
    failedRuns: [],
    reviewStories: [],
    conflictStories: [],
    epicsAwaitingReview: [],
    decisionsInFlight: 0,
    phases: {
      intent: { approvals: ['approved'], impacted: false },
      requirements: { approvals: ['approved'], impacted: false },
      design: { approvals: ['approved'], impacted: false },
      stories: { approvals: ['approved'], impacted: false },
    },
    generating: [],
    openDecisions: 1,
    readyStories: 0,
    freeSlots: 3,
    approvedUnmerged: 0,
    storyCount: 4,
    doneStories: 4,
  };

  it('two parallel features: the oldest feature with an open step comes first, after reviews and before open decisions', () => {
    const features = [
      progress({ id: 'FI-002', title: 'PDF export', impact: 'proposed' }),
      progress({ id: 'FI-001', impact: 'confirmed', requirementsDelta: 'open' }),
    ];
    expect(nextStep({ ...base, features })).toMatchObject({
      label: 'Approve delta requirements for FI-001',
      target: { area: 'feature', featureId: 'FI-001' },
    });
    expect(nextStep({ ...base, features: [features[0]!, progress({ status: 'done' })] }).label).toBe('Review impact of FI-002');
    expect(nextStep({ ...base, reviewStories: ['US-009'], features }).code).toBe('review_stories');
    expect(nextStep({ ...base, features: [] }).code).toBe('decide_items');
    expect(nextStep(base).code).toBe('decide_items');
  });
});

describe('US-084 AC-4: maintenance mode', () => {
  it('is on once all initial epics (without a feature) exist and are Done', () => {
    expect(maintenanceMode([])).toBe(false);
    expect(
      maintenanceMode([
        { featureId: null, done: true },
        { featureId: 'FI-001', done: false },
      ]),
    ).toBe(true);
    expect(
      maintenanceMode([
        { featureId: null, done: true },
        { featureId: null, done: false },
      ]),
    ).toBe(false);
    expect(maintenanceMode([{ featureId: 'FI-001', done: true }])).toBe(false);
  });
});
