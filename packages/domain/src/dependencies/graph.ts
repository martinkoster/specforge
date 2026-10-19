// SPDX-License-Identifier: Apache-2.0
// Story dependency graph (FR-062, FR-063): blocking edges must stay acyclic; related edges never block.

export interface StoryDependency {
  /** The dependent story. */
  from: string;
  /** The predecessor (blocking) or the related story. */
  to: string;
  type: 'blocking' | 'related';
}

export type DependencyValidation = { ok: true } | { ok: false; reason: string; cycle?: string[] };

export class DependencyGraph {
  private readonly ids: Set<string>;
  /** dependent -> blocking predecessors */
  private readonly blockers = new Map<string, Set<string>>();
  private readonly blocked = new Map<string, Set<string>>();
  private readonly relatedTo = new Map<string, Set<string>>();

  constructor(storyIds: Iterable<string>, dependencies: Iterable<StoryDependency>) {
    this.ids = new Set(storyIds);
    for (const d of dependencies) this.add(d);
  }

  validate(dependency: StoryDependency): DependencyValidation {
    const { from, to, type } = dependency;
    if (from === to) return { ok: false, reason: `${from} cannot depend on itself.` };
    for (const id of [from, to]) if (!this.ids.has(id)) return { ok: false, reason: `Unknown story ${id}.` };
    const existing = type === 'blocking' ? this.blockers.get(from) : this.relatedTo.get(from);
    if (existing?.has(to)) return { ok: false, reason: `${from} already depends on ${to}.` };
    if (type === 'related') return { ok: true };
    const path = this.pathBetween(to, from);
    if (path) {
      const cycle = [from, ...path];
      return { ok: false, reason: `Dependency cycle: ${cycle.join(' → ')}.`, cycle };
    }
    return { ok: true };
  }

  /** Any cycle among blocking dependencies (e.g. in hand-edited files), as a closed path, or undefined. */
  findCycle(): string[] | undefined {
    const state = new Map<string, 'visiting' | 'done'>();
    for (const start of this.blockers.keys()) {
      if (state.has(start)) continue;
      const stack: Array<{ id: string; next: Iterator<string> }> = [{ id: start, next: this.successors(start) }];
      state.set(start, 'visiting');
      while (stack.length > 0) {
        const top = stack.at(-1)!;
        const step = top.next.next();
        if (step.done) {
          state.set(top.id, 'done');
          stack.pop();
          continue;
        }
        const id = step.value;
        if (state.get(id) === 'visiting') {
          const from = stack.findIndex((frame) => frame.id === id);
          return [...stack.slice(from).map((frame) => frame.id), id];
        }
        if (!state.has(id)) {
          state.set(id, 'visiting');
          stack.push({ id, next: this.successors(id) });
        }
      }
    }
    return undefined;
  }

  predecessors(id: string): string[] {
    return [...(this.blockers.get(id) ?? [])].sort();
  }

  dependents(id: string): string[] {
    return [...(this.blocked.get(id) ?? [])].sort();
  }

  related(id: string): string[] {
    return [...(this.relatedTo.get(id) ?? [])].sort();
  }

  private add({ from, to, type }: StoryDependency): void {
    if (type === 'related') {
      setOf(this.relatedTo, from).add(to);
      setOf(this.relatedTo, to).add(from);
      return;
    }
    setOf(this.blockers, from).add(to);
    setOf(this.blocked, to).add(from);
  }

  private successors(id: string): Iterator<string> {
    return (this.blockers.get(id) ?? new Set<string>()).values();
  }

  /** Shortest path start → … → goal following blocking edges (BFS), or undefined. */
  private pathBetween(start: string, goal: string): string[] | undefined {
    const previous = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      if (id === goal) {
        const path: string[] = [];
        for (let at: string | null | undefined = id; at; at = previous.get(at)) path.unshift(at);
        return path;
      }
      for (const next of this.blockers.get(id) ?? []) {
        if (!previous.has(next)) {
          previous.set(next, id);
          queue.push(next);
        }
      }
    }
    return undefined;
  }
}

function setOf(map: Map<string, Set<string>>, key: string): Set<string> {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  return set;
}
