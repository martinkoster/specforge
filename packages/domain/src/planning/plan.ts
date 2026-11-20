// SPDX-License-Identifier: Apache-2.0
// Planning over the blocking story graph: derived epic dependencies (US-101, FR-097) and implementation waves with the
// critical path (US-103, FR-084, UC-036). Pure functions; Done stories are not planned.
import type { StoryDependency } from '../dependencies/graph.js';
import type { BoardStatus } from '../story/state-machine.js';
import { sizeWeight } from '../story/epic-status.js';

export interface EpicDependency {
  /** The dependent epic. */
  from: string;
  /** The epic it depends on. */
  to: string;
}

/** EP-B depends on EP-A if any story of EP-B has a blocking dependency on a story of EP-A; sorted, without duplicates. */
export function epicDependencies(
  stories: ReadonlyArray<{ id: string; epicId: string | null }>,
  dependencies: readonly StoryDependency[],
): EpicDependency[] {
  const epicOf = new Map(stories.map((s) => [s.id, s.epicId]));
  const edges = new Set<string>();
  for (const d of dependencies) {
    if (d.type !== 'blocking') continue;
    const from = epicOf.get(d.from);
    const to = epicOf.get(d.to);
    if (from && to && from !== to) edges.add(`${from}\u0000${to}`);
  }
  return [...edges].sort().map((key) => {
    const [from, to] = key.split('\u0000') as [string, string];
    return { from, to };
  });
}

export interface PlanStory {
  id: string;
  size: string | null;
  status: BoardStatus;
}

export interface PlanWave {
  stories: string[];
  /** Sum of the size weights (XS 1, S 2, M 3, L 5, XL 8; unknown = M). */
  size: number;
}

export interface ImplementationPlan {
  waves: PlanWave[];
  /** Longest blocking chain by size weight, predecessor first. */
  criticalPath: string[];
}

/**
 * Waves = topological levels of the blocking graph of the stories that are not Done (dependencies on Done or unknown
 * stories are satisfied), each level split into chunks of at most `limit` stories (ID order).
 */
export function implementationPlan(
  stories: readonly PlanStory[],
  dependencies: readonly StoryDependency[],
  limit: number,
): ImplementationPlan {
  const open = new Map(stories.filter((s) => s.status !== 'done').map((s) => [s.id, s]));
  const blockers = new Map<string, string[]>([...open.keys()].map((id) => [id, []]));
  for (const d of dependencies) {
    if (d.type === 'blocking' && open.has(d.from) && open.has(d.to)) blockers.get(d.from)!.push(d.to);
  }
  const ids = [...open.keys()].sort();
  const level = new Map<string, number>();
  const weight = new Map<string, { total: number; previous: string | null }>();
  const visit = (id: string, seen: Set<string>): void => {
    if (level.has(id)) return;
    if (seen.has(id)) throw new Error(`Dependency cycle at ${id}.`);
    seen.add(id);
    let lvl = 0;
    let best: { total: number; previous: string | null } = { total: 0, previous: null };
    for (const b of [...blockers.get(id)!].sort()) {
      visit(b, seen);
      lvl = Math.max(lvl, level.get(b)! + 1);
      const w = weight.get(b)!;
      if (w.total > best.total) best = { total: w.total, previous: b };
    }
    level.set(id, lvl);
    weight.set(id, { total: best.total + sizeWeight(open.get(id)!.size), previous: best.previous });
  };
  for (const id of ids) visit(id, new Set());

  const chunk = Math.max(1, limit);
  const waves: PlanWave[] = [];
  const levels = Math.max(-1, ...level.values()) + 1;
  for (let l = 0; l < levels; l++) {
    const members = ids.filter((id) => level.get(id) === l);
    for (let i = 0; i < members.length; i += chunk) {
      const part = members.slice(i, i + chunk);
      waves.push({ stories: part, size: part.reduce((sum, id) => sum + sizeWeight(open.get(id)!.size), 0) });
    }
  }

  let end: string | null = null;
  for (const id of ids) if (end === null || weight.get(id)!.total > weight.get(end)!.total) end = id;
  const criticalPath: string[] = [];
  for (let at = end; at !== null; at = weight.get(at)!.previous) criticalPath.unshift(at);
  return { waves, criticalPath };
}
