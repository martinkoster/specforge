// SPDX-License-Identifier: Apache-2.0
// Traceability (US-034, UC-009, FR-016/FR-055): upstream and downstream links of an element, story, run or changed
// file — intent ↔ requirements ↔ design/ADRs ↔ stories ↔ runs ↔ changed files — and links to unknown IDs as issues.

export type TraceTarget = { kind: 'element'; id: string } | { kind: 'run'; id: string } | { kind: 'file'; id: string };

export interface TraceNode {
  kind: 'element' | 'story' | 'run' | 'file';
  id: string;
  label: string;
  /** Artifact of an element or story. */
  path?: string;
  /** Run of a changed file (to open its diff). */
  runId?: string;
  exists: boolean;
}

export interface Trace {
  node: TraceNode;
  upstream: TraceNode[];
  downstream: TraceNode[];
  issues: string[];
}

export interface TraceDeps {
  element(projectId: string, id: string): { type: string; title: string; artifactPath: string } | undefined;
  /** IDs referenced by `id`. */
  linkTargets(projectId: string, id: string): string[];
  /** IDs that reference `id`. */
  linkSources(projectId: string, id: string): string[];
  storyRuns(projectId: string, storyId: string): { runId: string; status: string; createdAt: string }[];
  runStory(runId: string): string | null;
  runFiles(runId: string): string[];
  fileRuns(projectId: string, path: string): { runId: string; storyId: string }[];
  allLinks(projectId: string): { source: string; target: string; artifactPath: string }[];
}

/** Intent decisions (D12) are referenced in text but are not indexed elements. */
const DECISION = /^D\d+$/;
const byId = (a: TraceNode, b: TraceNode) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class TraceService {
  constructor(private readonly deps: TraceDeps) {}

  trace(projectId: string, target: TraceTarget): Trace {
    switch (target.kind) {
      case 'element':
        return this.element(projectId, target.id);
      case 'run':
        return this.run(projectId, target.id);
      case 'file':
        return this.file(projectId, target.id);
    }
  }

  /** All links to unknown IDs (AC-3). */
  issues(projectId: string): { path: string; message: string }[] {
    return this.deps
      .allLinks(projectId)
      .filter((l) => !DECISION.test(l.target) && !this.deps.element(projectId, l.target))
      .map((l) => ({ path: l.artifactPath, message: `${l.source} references ${l.target}, which does not exist.` }));
  }

  private node(projectId: string, id: string): TraceNode {
    const e = this.deps.element(projectId, id);
    if (!e) return { kind: id.startsWith('US-') ? 'story' : 'element', id, label: id, exists: false };
    return { kind: e.type === 'story' ? 'story' : 'element', id, label: `${id}: ${e.title}`, path: e.artifactPath, exists: true };
  }

  private runNode(runId: string, status: string, createdAt: string): TraceNode {
    return { kind: 'run', id: runId, label: `Run ${createdAt.slice(0, 16).replace('T', ' ')} (${status})`, exists: true };
  }

  private element(projectId: string, id: string): Trace {
    const node = this.node(projectId, id);
    if (!node.exists) return { node, upstream: [], downstream: [], issues: [`${id} does not exist.`] };
    const upstream = this.deps
      .linkTargets(projectId, id)
      .filter((t) => !DECISION.test(t))
      .map((t) => this.node(projectId, t))
      .sort(byId);
    const downstream = this.deps
      .linkSources(projectId, id)
      .map((s) => this.node(projectId, s))
      .sort(byId);
    if (node.kind === 'story') {
      downstream.push(...this.deps.storyRuns(projectId, id).map((r) => this.runNode(r.runId, r.status, r.createdAt)));
    }
    const issues = upstream.filter((n) => !n.exists).map((n) => `${id} references ${n.id}, which does not exist.`);
    return { node, upstream, downstream, issues };
  }

  private run(projectId: string, runId: string): Trace {
    const storyId = this.deps.runStory(runId);
    const story = storyId ? this.deps.storyRuns(projectId, storyId).find((r) => r.runId === runId) : undefined;
    const node = story
      ? this.runNode(runId, story.status, story.createdAt)
      : { kind: 'run' as const, id: runId, label: `Run ${runId}`, exists: true };
    return {
      node,
      upstream: storyId ? [this.node(projectId, storyId)] : [],
      downstream: this.deps.runFiles(runId).map((path) => ({ kind: 'file' as const, id: path, label: path, runId, exists: true })),
      issues: [],
    };
  }

  private file(projectId: string, path: string): Trace {
    const upstream: TraceNode[] = [];
    for (const r of this.deps.fileRuns(projectId, path)) {
      const run = this.deps.storyRuns(projectId, r.storyId).find((x) => x.runId === r.runId);
      upstream.push(
        run ? this.runNode(r.runId, run.status, run.createdAt) : { kind: 'run', id: r.runId, label: `Run ${r.runId}`, exists: true },
      );
      if (!upstream.some((n) => n.id === r.storyId)) upstream.push(this.node(projectId, r.storyId));
    }
    return { node: { kind: 'file', id: path, label: path, exists: true }, upstream, downstream: [], issues: [] };
  }
}
