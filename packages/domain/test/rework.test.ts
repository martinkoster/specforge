// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { reworkIssues, reworkedBy } from '../src/story/rework.js';

describe('US-092 rework stories (FR-109)', () => {
  const status = new Map([
    ['US-008', 'done'],
    ['US-009', 'in_progress'],
  ] as const);
  const statusOf = (id: string) => status.get(id as 'US-008');

  it('US-092 AC-1: reworks targets must exist and be Done', () => {
    expect(reworkIssues('US-020', ['US-008'], statusOf)).toEqual([]);
    expect(reworkIssues('US-020', ['US-009', 'US-099', 'US-020'], statusOf)).toEqual([
      'US-020 reworks US-009, which is not Done (In Progress).',
      'US-020 reworks US-099, which does not exist.',
      'US-020 cannot rework itself.',
    ]);
  });

  it('US-092 AC-2: the reworking stories of each original story', () => {
    const by = reworkedBy([
      { storyId: 'US-020', reworks: ['US-008'] },
      { storyId: 'US-021', reworks: ['US-008', 'US-002'] },
      { storyId: 'US-022', reworks: [] },
    ]);
    expect(by.get('US-008')).toEqual(['US-020', 'US-021']);
    expect(by.get('US-002')).toEqual(['US-021']);
    expect(by.has('US-022')).toBe(false);
  });
});
