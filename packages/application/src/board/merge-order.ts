// SPDX-License-Identifier: Apache-2.0
// Merge instructions after approval (US-058, FR-044/FR-046): SpecForge never merges; it shows the order in which the
// user merges the story branch and its still unmerged (stacked) predecessors.

export interface MergeOrderInput {
  dependencies: ReadonlyArray<{ from: string; to: string; type: 'blocking' | 'related' }>;
  /** Recorded branch per story. */
  branches: Readonly<Record<string, string>>;
  /** Stories already merged by the user. */
  merged: ReadonlySet<string>;
}

export function mergeOrder(storyId: string, input: MergeOrderInput): { storyId: string; branch: string }[] {
  const order: { storyId: string; branch: string }[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const predecessors = input.dependencies
      .filter((d) => d.from === id && d.type === 'blocking')
      .map((d) => d.to)
      .sort();
    for (const p of predecessors) if (!input.merged.has(p)) visit(p);
    const branch = input.branches[id];
    if (branch && !input.merged.has(id)) order.push({ storyId: id, branch });
  };
  visit(storyId);
  return order;
}
