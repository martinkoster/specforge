// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { mergeOrder } from '../src/index.js';

describe('US-058 AC-1: merge order of an approved story (predecessors first)', () => {
  it('lists unmerged Done predecessors with branches in dependency order, then the story', () => {
    const order = mergeOrder('US-004', {
      dependencies: [
        { from: 'US-004', to: 'US-002', type: 'blocking' },
        { from: 'US-004', to: 'US-003', type: 'blocking' },
        { from: 'US-003', to: 'US-001', type: 'blocking' },
        { from: 'US-004', to: 'US-009', type: 'related' },
      ],
      branches: {
        'US-001': 'specforge/US-001',
        'US-002': 'specforge/US-002',
        'US-003': 'specforge/US-003',
        'US-004': 'specforge/US-004',
        'US-009': 'specforge/US-009',
      },
      merged: new Set(['US-002']),
    });
    expect(order).toEqual([
      { storyId: 'US-001', branch: 'specforge/US-001' },
      { storyId: 'US-003', branch: 'specforge/US-003' },
      { storyId: 'US-004', branch: 'specforge/US-004' },
    ]);
  });

  it('is empty without a branch (non-git)', () => {
    expect(mergeOrder('US-001', { dependencies: [], branches: {}, merged: new Set() })).toEqual([]);
  });
});
