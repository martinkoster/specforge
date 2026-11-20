// SPDX-License-Identifier: Apache-2.0
// US-081 AC-4: the derived lifecycle of a feature intent (FR-104, ADR-021).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BOARD_STATUSES, FEATURE_STATUSES, featureStatus, nextFeatureId, type FeatureStatusInput } from '../src/index.js';

const input = (over: Partial<FeatureStatusInput> = {}): FeatureStatusInput => ({
  approval: 'draft',
  recorded: 'draft',
  linkedStories: [],
  acceptedDelta: false,
  ...over,
});

describe('US-081 AC-4: feature intent status', () => {
  it('Draft → Approved → In delivery → Done', () => {
    expect(featureStatus(input())).toBe('draft');
    expect(featureStatus(input({ approval: 'approved' }))).toBe('approved');
    expect(featureStatus(input({ approval: 'approved', acceptedDelta: true }))).toBe('in_delivery');
    expect(featureStatus(input({ approval: 'approved', linkedStories: ['backlog'] }))).toBe('in_delivery');
    expect(featureStatus(input({ approval: 'approved', linkedStories: ['done', 'review'] }))).toBe('in_delivery');
    expect(featureStatus(input({ approval: 'approved', linkedStories: ['done', 'done'] }))).toBe('done');
  });

  it('Withdrawn is terminal and set only by the user', () => {
    expect(featureStatus(input({ recorded: 'withdrawn', approval: 'approved', linkedStories: ['done'] }))).toBe('withdrawn');
  });

  it('a Draft feature (e.g. edited after approval) is Draft regardless of links', () => {
    expect(featureStatus(input({ recorded: 'in_delivery', linkedStories: ['done'] }))).toBe('draft');
  });

  it('property: the result is a lifecycle value; withdrawn stays withdrawn; done needs only Done stories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('draft' as const, 'approved' as const),
        fc.constantFrom(...FEATURE_STATUSES),
        fc.array(fc.constantFrom(...BOARD_STATUSES), { maxLength: 6 }),
        fc.boolean(),
        (approval, recorded, linkedStories, acceptedDelta) => {
          const status = featureStatus({ approval, recorded, linkedStories, acceptedDelta });
          expect(FEATURE_STATUSES).toContain(status);
          if (recorded === 'withdrawn') expect(status).toBe('withdrawn');
          if (status === 'done') expect(linkedStories.length > 0 && linkedStories.every((s) => s === 'done')).toBe(true);
          if (status === 'in_delivery') expect(acceptedDelta || linkedStories.length > 0).toBe(true);
          if (recorded !== 'withdrawn' && approval === 'draft') expect(status).toBe('draft');
        },
      ),
    );
  });
});

describe('US-081 AC-2: feature intent IDs', () => {
  it('uses the next free FI number and never reuses an ID', () => {
    expect(nextFeatureId([])).toBe('FI-001');
    expect(nextFeatureId(['FI-001', 'FI-003'])).toBe('FI-004');
    expect(nextFeatureId(['FI-009', 'US-020', 'FI-010'])).toBe('FI-011');
  });
});
