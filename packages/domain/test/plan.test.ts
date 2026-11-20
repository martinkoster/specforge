// SPDX-License-Identifier: Apache-2.0
// US-101 (FR-097) derived epic dependencies; US-103 (FR-084) implementation waves and critical path.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { epicDependencies, implementationPlan, type PlanStory, type StoryDependency } from '../src/index.js';

describe('US-101 AC-1: derived epic dependencies', () => {
  it('EP-B depends on EP-A when a story of EP-B blocks on a story of EP-A (FR-097 acceptance)', () => {
    const stories = [
      { id: 'US-003', epicId: 'EP-001' },
      { id: 'US-004', epicId: 'EP-001' },
      { id: 'US-012', epicId: 'EP-002' },
      { id: 'US-020', epicId: null },
    ];
    const deps: StoryDependency[] = [
      { from: 'US-012', to: 'US-003', type: 'blocking' },
      { from: 'US-004', to: 'US-003', type: 'blocking' },
      { from: 'US-020', to: 'US-003', type: 'blocking' },
      { from: 'US-003', to: 'US-012', type: 'related' },
    ];
    expect(epicDependencies(stories, deps)).toEqual([{ from: 'EP-002', to: 'EP-001' }]);
  });

  it('property: matches the definition for arbitrary stories and dependencies', () => {
    const story = fc.record({
      id: fc.integer({ min: 1, max: 12 }).map((n) => `US-${n}`),
      epicId: fc.constantFrom('EP-1', 'EP-2', 'EP-3', null),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(story, { selector: (s) => s.id, maxLength: 12 }),
        fc.array(
          fc.record({
            from: fc.integer({ min: 1, max: 12 }).map((n) => `US-${n}`),
            to: fc.integer({ min: 1, max: 12 }).map((n) => `US-${n}`),
            type: fc.constantFrom('blocking' as const, 'related' as const),
          }),
          { maxLength: 20 },
        ),
        (stories, deps) => {
          const epicOf = new Map(stories.map((s) => [s.id, s.epicId]));
          const expected = new Set<string>();
          for (const d of deps) {
            const a = epicOf.get(d.from);
            const b = epicOf.get(d.to);
            if (d.type === 'blocking' && a && b && a !== b) expected.add(`${a}>${b}`);
          }
          const actual = epicDependencies(stories, deps).map((e) => `${e.from}>${e.to}`);
          expect(new Set(actual)).toEqual(expected);
          expect(actual).toEqual([...actual].sort());
        },
      ),
    );
  });
});

const s = (id: string, size: string | null = 'S', status: PlanStory['status'] = 'ready'): PlanStory => ({ id, size, status });
const blocks = (from: string, to: string): StoryDependency => ({ from, to, type: 'blocking' });

describe('US-103 AC-1/AC-4: waves and critical path', () => {
  it('FR-084 acceptance: A→B→C and independent D, E give waves {A,D,E}, {B}, {C} and critical path A→B→C', () => {
    const plan = implementationPlan([s('A'), s('B'), s('C'), s('D'), s('E')], [blocks('B', 'A'), blocks('C', 'B')], 3);
    expect(plan.waves.map((w) => w.stories)).toEqual([['A', 'D', 'E'], ['B'], ['C']]);
    expect(plan.criticalPath).toEqual(['A', 'B', 'C']);
    expect(plan.waves.map((w) => w.size)).toEqual([6, 2, 2]);
  });

  it('splits a level by the concurrency limit; Done stories and their edges are left out; the critical path weighs sizes', () => {
    const plan = implementationPlan(
      [s('A', 'S', 'done'), s('B'), s('C'), s('D'), s('E', 'XL'), s('F')],
      [blocks('B', 'A'), blocks('F', 'E')],
      2,
    );
    expect(plan.waves.map((w) => w.stories)).toEqual([['B', 'C'], ['D', 'E'], ['F']]);
    expect(plan.criticalPath).toEqual(['E', 'F']);
  });

  it('property: every story is planned once and comes after all its blocking predecessors; waves respect the limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.tuple(fc.nat(9), fc.nat(9))),
        (n, limit, pairs) => {
          const ids = Array.from({ length: n }, (_, i) => `US-${String(i).padStart(2, '0')}`);
          // Only edges to lower IDs: acyclic by construction.
          const deps = pairs.filter(([a, b]) => a < n && b < n && b < a).map(([a, b]) => blocks(ids[a]!, ids[b]!));
          const plan = implementationPlan(
            ids.map((id) => s(id)),
            deps,
            limit,
          );
          const waveOf = new Map(plan.waves.flatMap((w, i) => w.stories.map((id) => [id, i] as const)));
          expect([...waveOf.keys()].sort()).toEqual(ids);
          for (const d of deps) expect(waveOf.get(d.from)!).toBeGreaterThan(waveOf.get(d.to)!);
          for (const w of plan.waves) expect(w.stories.length).toBeLessThanOrEqual(limit);
          for (let i = 1; i < plan.criticalPath.length; i++) {
            expect(deps).toContainEqual(blocks(plan.criticalPath[i]!, plan.criticalPath[i - 1]!));
          }
        },
      ),
    );
  });
});
