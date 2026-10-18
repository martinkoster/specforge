// SPDX-License-Identifier: Apache-2.0
// Detection of story branches the user merged (US-024, UC-049, FR-115): Done stories get `merged_at`, their overlap
// records are removed, and later dependents branch from the base branch again.

export interface MergeDetectorDeps {
  /** Repository and base branch of a git-mode project; undefined in non-git mode. */
  project(projectId: string): { repo: string; baseBranch: string } | undefined | Promise<{ repo: string; baseBranch: string } | undefined>;
  /** Done stories with a recorded branch and no `merged_at` yet. */
  candidates(projectId: string): { storyId: string; branch: string }[];
  mergedInto(repo: string, baseBranch: string, branches: readonly string[]): Promise<string[]>;
  markMerged(projectId: string, storyId: string, at: string): void;
  clearTouches(projectId: string, storyId: string): void;
  onMerged(projectId: string, storyIds: string[]): void;
  now(): string;
}

export class MergeDetector {
  private readonly running = new Map<string, Promise<string[]>>();

  constructor(private readonly deps: MergeDetectorDeps) {}

  /** One merge check; concurrent requests for the same project share it. Resolves the newly merged stories. */
  check(projectId: string): Promise<string[]> {
    const pending = this.running.get(projectId);
    if (pending) return pending;
    const job = this.run(projectId).finally(() => this.running.delete(projectId));
    this.running.set(projectId, job);
    return job;
  }

  /** Waits for running checks (shutdown). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  /** Periodic check (configurable interval, default 60 s); returns a stop function. */
  every(projectId: string, intervalMs: number): () => void {
    const timer = setInterval(() => void this.check(projectId), intervalMs);
    return () => clearInterval(timer);
  }

  private async run(projectId: string): Promise<string[]> {
    const { deps } = this;
    const project = await deps.project(projectId);
    const candidates = project ? deps.candidates(projectId) : [];
    if (!project || candidates.length === 0) return [];
    let merged: Set<string>;
    try {
      merged = new Set(
        await deps.mergedInto(
          project.repo,
          project.baseBranch,
          candidates.map((c) => c.branch),
        ),
      );
    } catch {
      // A failing check (e.g. repository busy) is retried by the next trigger.
      return [];
    }
    const at = deps.now();
    const stories = candidates.filter((c) => merged.has(c.branch)).map((c) => c.storyId);
    for (const storyId of stories) {
      deps.markMerged(projectId, storyId, at);
      deps.clearTouches(projectId, storyId);
    }
    if (stories.length > 0) deps.onMerged(projectId, stories);
    return stories;
  }
}
