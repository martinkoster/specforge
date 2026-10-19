// SPDX-License-Identifier: Apache-2.0
// Measures worktree preparation time per variant (evidence for NFR-004: run start < 5 s). Usage: npx tsx scripts/bench.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { prepareStoryWorktree, type IntegrationStrategy } from '../src/worktrees.js';
import { makeBranch, makeRepo, tempRoot } from '../test/helpers.js';

const RUNS = 5;

const none = (): string[] => [];
const one = (repo: string): string[] => {
  makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
  return ['specforge/US-001'];
};
const two = (repo: string): string[] => {
  makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
  makeBranch(repo, 'specforge/US-002', 'main', 'b.txt', 'B\n');
  return ['specforge/US-001', 'specforge/US-002'];
};

const variants: Array<[string, (repo: string) => string[], IntegrationStrategy]> = [
  ['base', none, 'merge-tree'],
  ['single', one, 'merge-tree'],
  ['integration (worktree)', two, 'worktree'],
  ['integration (merge-tree)', two, 'merge-tree'],
];

const out: Record<string, { medianMs: number; samplesMs: number[] }> = {};
for (const [name, setup, strategy] of variants) {
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const repo = makeRepo();
    const predecessors = setup(repo);
    const t0 = performance.now();
    await prepareStoryWorktree({ repo, storyId: 'US-010', baseBranch: 'main', root: tempRoot(), predecessors, strategy });
    samples.push(Math.round(performance.now() - t0));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  out[name] = { medianMs: sorted[Math.floor(RUNS / 2)]!, samplesMs: samples };
}
mkdirSync('results', { recursive: true });
writeFileSync(`results/timings-${process.platform}.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out));
