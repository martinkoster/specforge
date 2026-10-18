// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { deriveEpicStatus, sizeWeight } from '../src/index.js';

const s = (status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done', size: string | null = 'M', merged = false) => ({
  status,
  size,
  merged,
});

describe('US-039 AC-4: derived epic status (FR-095)', () => {
  it('not started while no story is beyond Ready', () => {
    expect(deriveEpicStatus([s('backlog'), s('ready')], null).status).toBe('not_started');
    expect(deriveEpicStatus([], null).status).toBe('not_started');
  });

  it('in progress with 5 of 8 Done and one In Progress (FR-095 acceptance)', () => {
    const stories = [
      ...Array(5)
        .fill(0)
        .map(() => s('done')),
      s('in_progress'),
      s('ready'),
      s('backlog'),
    ];
    expect(deriveEpicStatus(stories, null)).toEqual({
      status: 'in_progress',
      progress: { done: 5, total: 8, doneWeight: 15, totalWeight: 24 },
    });
  });

  it('ready for epic review when all Done; Done once the review is confirmed or skipped; Merged when all branches are merged', () => {
    expect(deriveEpicStatus([s('done'), s('done')], null).status).toBe('ready_for_review');
    expect(deriveEpicStatus([s('done'), s('done')], 'confirmed').status).toBe('done');
    expect(deriveEpicStatus([s('done'), s('done')], 'skipped').status).toBe('done');
    expect(deriveEpicStatus([s('done', 'S', true), s('done', 'L', true)], 'confirmed').status).toBe('merged');
  });

  it('a new story in a Done epic returns it to In progress (the stored outcome no longer applies)', () => {
    expect(deriveEpicStatus([s('done'), s('backlog')], 'confirmed').status).toBe('in_progress');
  });

  it('weights stories by size', () => {
    expect(['XS', 'S', 'M', 'L', 'XL', null, 'odd'].map(sizeWeight)).toEqual([1, 2, 3, 5, 8, 3, 3]);
  });
});
