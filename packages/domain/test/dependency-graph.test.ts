// SPDX-License-Identifier: Apache-2.0
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DependencyGraph, type StoryDependency } from '../src/index.js';

const blocking = (from: string, to: string): StoryDependency => ({ from, to, type: 'blocking' });

describe('US-040 AC-2: DependencyGraph validates new dependencies', () => {
  const graph = () =>
    new DependencyGraph(
      ['US-1', 'US-2', 'US-3', 'US-4'],
      [blocking('US-2', 'US-1'), blocking('US-3', 'US-2'), { from: 'US-4', to: 'US-1', type: 'related' }],
    );

  it('accepts a valid blocking dependency', () => {
    expect(graph().validate(blocking('US-4', 'US-3'))).toEqual({ ok: true });
  });

  it('rejects self-references', () => {
    expect(graph().validate(blocking('US-2', 'US-2'))).toEqual({ ok: false, reason: 'US-2 cannot depend on itself.' });
  });

  it('rejects unknown story ids on either side', () => {
    expect(graph().validate(blocking('US-2', 'US-9'))).toEqual({ ok: false, reason: 'Unknown story US-9.' });
    expect(graph().validate(blocking('US-8', 'US-1'))).toEqual({ ok: false, reason: 'Unknown story US-8.' });
  });

  it('rejects a blocking dependency that would close a cycle and names the cycle path', () => {
    expect(graph().validate(blocking('US-1', 'US-3'))).toEqual({
      ok: false,
      reason: 'Dependency cycle: US-1 → US-3 → US-2 → US-1.',
      cycle: ['US-1', 'US-3', 'US-2', 'US-1'],
    });
  });

  it('allows related dependencies against the blocking direction (they never block or form cycles)', () => {
    expect(graph().validate({ from: 'US-1', to: 'US-3', type: 'related' })).toEqual({ ok: true });
  });

  it('treats related dependencies as symmetric when checking for duplicates', () => {
    expect(graph().validate({ from: 'US-1', to: 'US-4', type: 'related' })).toEqual({ ok: false, reason: 'US-1 already depends on US-4.' });
  });

  it('rejects duplicate dependencies', () => {
    expect(graph().validate(blocking('US-2', 'US-1'))).toEqual({ ok: false, reason: 'US-2 already depends on US-1.' });
  });

  it('answers blocking predecessors and dependents', () => {
    const g = graph();
    expect(g.predecessors('US-3')).toEqual(['US-2']);
    expect(g.dependents('US-1')).toEqual(['US-2']);
    expect(g.related('US-1')).toEqual(['US-4']);
  });

  it('finds an existing cycle in imported data', () => {
    const g = new DependencyGraph(['A-1', 'A-2', 'A-3'], [blocking('A-1', 'A-2'), blocking('A-2', 'A-3'), blocking('A-3', 'A-1')]);
    const cycle = g.findCycle();
    expect(cycle).toHaveLength(4);
    expect(cycle![0]).toBe(cycle![3]);
  });
});

/** Random DAG: edges only from a higher to a lower index. */
const dagArb = fc.integer({ min: 2, max: 40 }).chain((n) =>
  fc.array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })), { maxLength: n * 3 }).map((pairs) => ({
    ids: Array.from({ length: n }, (_, i) => `US-${i}`),
    deps: [...new Map(pairs.filter(([a, b]) => a > b).map(([a, b]) => [`${a}>${b}`, blocking(`US-${a}`, `US-${b}`)])).values()],
  })),
);

describe('US-040 AC-3: cycle detection properties', () => {
  it('never reports a cycle for a DAG', () => {
    fc.assert(fc.property(dagArb, ({ ids, deps }) => new DependencyGraph(ids, deps).findCycle() === undefined));
  });

  it('detects every back edge that closes a path and returns a valid cycle', () => {
    fc.assert(
      fc.property(dagArb, ({ ids, deps }) => {
        const g = new DependencyGraph(ids, deps);
        for (const d of deps) {
          // reversing an existing edge always closes a cycle
          const result = g.validate(blocking(d.to, d.from));
          if (result.ok || !result.cycle) return false;
          const c = result.cycle;
          if (c[0] !== c.at(-1) || c[0] !== d.to) return false;
          const edges = new Set([...deps, blocking(d.to, d.from)].map((e) => `${e.from}>${e.to}`));
          for (let i = 0; i + 1 < c.length; i++) if (!edges.has(`${c[i]}>${c[i + 1]}`)) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
