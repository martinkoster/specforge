// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MergeDetector, type MergeDetectorDeps } from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
});

function setup(overrides: Partial<MergeDetectorDeps> = {}) {
  const merged = new Map<string, string>();
  const cleared: string[] = [];
  const notified: string[][] = [];
  let candidates = [
    { storyId: 'US-001', branch: 'specforge/US-001' },
    { storyId: 'US-002', branch: 'specforge/US-002' },
  ];
  const checked: string[][] = [];
  const deps: MergeDetectorDeps = {
    project: () => ({ repo: '/repo', baseBranch: 'main' }),
    candidates: () => candidates,
    mergedInto: async (_repo, base, branches) => {
      checked.push([base, ...branches]);
      return branches.filter((b) => b === 'specforge/US-001');
    },
    markMerged: (_p, storyId, at) => {
      merged.set(storyId, at);
      candidates = candidates.filter((c) => c.storyId !== storyId);
    },
    clearTouches: (_p, storyId) => void cleared.push(storyId),
    onMerged: (_p, ids) => void notified.push(ids),
    now: () => '2026-10-16T12:00:00.000Z',
    ...overrides,
  };
  return { detector: new MergeDetector(deps), merged, cleared, notified, checked };
}

describe('US-024 AC-1/AC-2: merge check', () => {
  it('marks merged story branches with merged_at, removes their overlap records and reports them', async () => {
    const { detector, merged, cleared, notified, checked } = setup();

    await expect(detector.check('p1')).resolves.toEqual(['US-001']);

    expect(checked).toEqual([['main', 'specforge/US-001', 'specforge/US-002']]);
    expect(merged.get('US-001')).toBe('2026-10-16T12:00:00.000Z');
    expect(cleared).toEqual(['US-001']);
    expect(notified).toEqual([['US-001']]);
    await expect(detector.check('p1')).resolves.toEqual([]);
    expect(notified).toHaveLength(1);
  });

  it('does nothing without Git, without candidates, or when Git fails', async () => {
    const mergedInto = vi.fn(async () => []);
    expect(await setup({ project: () => undefined, mergedInto }).detector.check('p1')).toEqual([]);
    expect(await setup({ candidates: () => [], mergedInto }).detector.check('p1')).toEqual([]);
    expect(mergedInto).not.toHaveBeenCalled();
    expect(await setup({ mergedInto: async () => Promise.reject(new Error('git broke')) }).detector.check('p1')).toEqual([]);
  });

  it('coalesces concurrent checks of the same project (focus + timer at once)', async () => {
    const mergedInto = vi.fn(async () => ['specforge/US-001']);
    const { detector } = setup({ mergedInto });
    const [a, b] = await Promise.all([detector.check('p1'), detector.check('p1')]);
    expect(mergedInto).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    await expect(detector.idle()).resolves.toBeUndefined();
  });

  it('runs periodically with the configured interval until stopped', async () => {
    vi.useFakeTimers();
    const mergedInto = vi.fn(async () => []);
    const { detector } = setup({ mergedInto });

    const stop = detector.every('p1', 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mergedInto).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mergedInto).toHaveBeenCalledTimes(2);
  });
});
