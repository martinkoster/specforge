// SPDX-License-Identifier: Apache-2.0
// Dashboard read model (US-061, UC-034, FR-085/FR-087/FR-088/FR-101): story statistics and progress, runs, pending
// decisions, unmerged branches, recent activity, artifacts per phase and epics. The next step and the phase stepper
// come from the domain (ADR-017).
import { BOARD_STATUSES, type BoardStatus, type EpicProgress, type EpicStatus, type SpecPhase } from '@specforge/domain';

export interface DashboardInput {
  stories: ReadonlyArray<{ storyId: string; status: BoardStatus }>;
  runs: ReadonlyArray<{ runId: string; storyId: string | null; kind: string; status: string; createdAt: string; endedAt: string | null }>;
  queued: number;
  pendingDecisions: number;
  unmerged: number;
  artifacts: ReadonlyArray<{ path: string; kind: string; approval: 'draft' | 'approved'; impacted: boolean }>;
  lanes: ReadonlyArray<{ epicId: string | null; title: string; status: EpicStatus; progress: EpicProgress; colour: number | null }>;
}

export interface Dashboard {
  storyCounts: Record<BoardStatus, number>;
  progress: { done: number; total: number };
  runs: { active: number; queued: number };
  pendingDecisions: number;
  unmerged: number;
  activity: { runId: string; storyId: string | null; label: string; at: string }[];
  artifacts: { phase: SpecPhase; items: { path: string; approval: 'draft' | 'approved'; impacted: boolean }[] }[];
  epics: { epicId: string; title: string; status: EpicStatus; progress: EpicProgress }[];
  kanbanEnabled: boolean;
}

const ACTIVE = new Set(['preparing', 'running', 'awaiting_approval']);
const PHASE_FOLDERS: [SpecPhase, string][] = [
  ['intent', 'spec/01_intent/'],
  ['requirements', 'spec/02_requirements/'],
  ['design', 'spec/03_design/'],
  ['stories', 'spec/04_user_stories/'],
];
const KIND_LABEL: Record<string, string> = { implement: 'implementation', correct: 'correction' };

export function buildDashboard(input: DashboardInput): Dashboard {
  const storyCounts = Object.fromEntries(BOARD_STATUSES.map((s) => [s, 0])) as Record<BoardStatus, number>;
  for (const s of input.stories) storyCounts[s.status] += 1;
  const activity = [...input.runs]
    .map((r) => ({ run: r, at: r.endedAt ?? r.createdAt }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 10)
    .map(({ run, at }) => {
      const status = run.status.replaceAll('_', ' ');
      const label = run.storyId
        ? `${run.storyId}: ${KIND_LABEL[run.kind] ?? run.kind} ${status}`
        : `Specification ${run.kind.replaceAll('_', ' ')} ${status}`;
      return { runId: run.runId, storyId: run.storyId, label, at };
    });
  return {
    storyCounts,
    progress: { done: storyCounts.done, total: input.stories.length },
    runs: { active: input.runs.filter((r) => ACTIVE.has(r.status) && r.storyId !== null).length, queued: input.queued },
    pendingDecisions: input.pendingDecisions,
    unmerged: input.unmerged,
    activity,
    artifacts: PHASE_FOLDERS.map(([phase, folder]) => ({
      phase,
      items: input.artifacts
        .filter((a) => a.path.startsWith(folder))
        .map((a) => ({ path: a.path, approval: a.approval, impacted: a.impacted })),
    })),
    epics: input.lanes
      .filter((l) => l.epicId !== null)
      .map((l) => ({ epicId: l.epicId!, title: l.title, status: l.status, progress: l.progress })),
    kanbanEnabled: input.stories.length > 0,
  };
}
