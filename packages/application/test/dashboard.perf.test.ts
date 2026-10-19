// SPDX-License-Identifier: Apache-2.0
// US-061 AC-5 (NFR-030): the dashboard read model for 1,000 stories and runs is built well within the 1 s budget.
import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../src/index.js';

describe('US-061 AC-5: dashboard with 1,000 stories and runs', () => {
  it('builds the read model in under 100 ms', () => {
    const statuses = ['backlog', 'ready', 'in_progress', 'review', 'done'] as const;
    const stories = Array.from({ length: 1000 }, (_, i) => ({ storyId: `US-${i}`, status: statuses[i % 5]! }));
    const runs = Array.from({ length: 1000 }, (_, i) => ({
      runId: `r${i}`,
      storyId: `US-${i}`,
      kind: 'implement',
      status: i % 3 === 0 ? 'running' : 'completed',
      createdAt: new Date(Date.UTC(2026, 9, 16, 0, 0, i)).toISOString(),
      endedAt: null,
    }));
    const artifacts = stories.map((s) => ({
      path: `spec/04_user_stories/${s.storyId}.md`,
      kind: 'story',
      approval: 'approved' as const,
      impacted: false,
    }));
    const started = performance.now();
    const dashboard = buildDashboard({ stories, runs, queued: 10, pendingDecisions: 5, unmerged: 3, artifacts, lanes: [] });
    expect(performance.now() - started).toBeLessThan(100);
    expect(dashboard.progress).toEqual({ done: 200, total: 1000 });
    expect(dashboard.activity).toHaveLength(10);
  });
});
