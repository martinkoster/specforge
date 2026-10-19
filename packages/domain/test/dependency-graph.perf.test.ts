// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { DependencyGraph, type StoryDependency } from '../src/index.js';

describe('US-040 AC-3 (performance): 1,000 stories / 3,000 dependencies', () => {
  it('validates the whole graph and a new dependency in under 100 ms', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `US-${i}`);
    const deps: StoryDependency[] = [];
    let seed = 42;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const seen = new Set<string>();
    while (deps.length < 3000) {
      const a = Math.floor(random() * 1000);
      const b = Math.floor(random() * 1000);
      if (a > b && !seen.has(`${a}>${b}`)) {
        seen.add(`${a}>${b}`);
        deps.push({ from: `US-${a}`, to: `US-${b}`, type: 'blocking' });
      }
    }

    const t0 = performance.now();
    const graph = new DependencyGraph(ids, deps);
    const cycle = graph.findCycle();
    const result = graph.validate({ from: 'US-0', to: 'US-999', type: 'blocking' });
    const ms = performance.now() - t0;

    expect(cycle).toBeUndefined();
    expect(typeof result.ok).toBe('boolean');
    expect(ms).toBeLessThan(100);
  });
});
