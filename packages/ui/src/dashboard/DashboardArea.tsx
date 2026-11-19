// SPDX-License-Identifier: Apache-2.0
// Project dashboard (US-061, UC-034, UF-12): phase stepper, next step with action, story statistics and progress,
// runs, pending decisions, recent activity, artifacts per phase, epics and the Kanban link.
import { ArrowRightCircle } from 'lucide-react';
import { Icon } from '../components/icons.js';
import { EmptyState, PageHeader, Skeleton, StatusBadge } from '../components/index.js';
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { COLUMN_LABELS } from '../board/types.js';
import { PhaseStepper, type GuidedPhase, type PhaseStatus } from '../shell/PhaseStepper.js';
import { ChatPanel } from './ChatPanel.js';

type Dashboard = QueryOutput<'dashboard.get'>;
type NextStep = NonNullable<QueryOutput<'shell.state'>['nextStep']>;

const PHASE_LABEL = { intent: 'Intent', requirements: 'Requirements', design: 'Design', stories: 'User stories' } as const;
const KANBAN_HINT = 'No user stories yet — generate or write stories first';
/** User Timing mark: the project screen shows its data for the first time (NFR-003). */
export const INTERACTIVE_MARK = 'specforge:project-interactive';

export interface DashboardAreaProps {
  session: CoreSession;
  projectId: string;
  nextStep: NextStep | null;
  phases: PhaseStatus | null;
  onNextStep(target: NextStep['target']): void;
  onOpenArtifact(path: string): void;
  onOpenEpic(epicId: string): void;
  onOpenKanban(): void;
  onOpenPending(): void;
  onOpenPhase(phase: GuidedPhase): void;
  /** Re-read when the project state changes (US-060 AC-3). */
  refreshKey?: unknown;
  /** Limited mode disables the chat input (US-062 AC-4). */
  aiDisabledReason?: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DashboardArea({
  session,
  projectId,
  nextStep,
  phases,
  onNextStep,
  onOpenArtifact,
  onOpenEpic,
  onOpenKanban,
  onOpenPending,
  onOpenPhase,
  refreshKey,
  aiDisabledReason = null,
}: DashboardAreaProps) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void session
      .client()
      .query('dashboard.get', { projectId })
      .then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [session, projectId, refreshKey]);

  // NFR-003: startup time to the interactive project screen (User Timing, measured by the e2e suite).
  const shown = data !== null;
  useEffect(() => {
    if (shown && performance.getEntriesByName(INTERACTIVE_MARK).length === 0) performance.mark(INTERACTIVE_MARK);
  }, [shown]);

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" />
      {error && <p role="alert">{error}</p>}
      {phases && <PhaseStepper status={phases} current={null} onOpen={onOpenPhase} />}
      <ChatPanel session={session} projectId={projectId} aiDisabledReason={aiDisabledReason} />
      {nextStep && (
        <section aria-label="Next step" className="callout callout-info next-step">
          <Icon icon={ArrowRightCircle} className="callout-icon" />
          <div className="callout-body">
            <strong className="callout-title">Next step</strong>
            <p className="callout-text">{nextStep.reason}</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => onNextStep(nextStep.target)}>
            {nextStep.label}
          </button>
        </section>
      )}
      <div className="dashboard-grid">
        {!data && !error && <Skeleton label="Loading the dashboard" lines={5} />}
        {data && (
          <>
            <section aria-label="Stories" className="dashboard-widget">
              <header className="widget-header">
                <h2>Stories</h2>
              </header>
              {data.progress.total === 0 ? (
                <EmptyState
                  compact
                  title="No stories yet"
                  description="Stories appear here once the user stories phase has produced them."
                />
              ) : (
                <>
                  <ul className="stat-list">
                    {(Object.keys(COLUMN_LABELS) as (keyof typeof COLUMN_LABELS)[]).map((status) => (
                      <li key={status}>
                        <StatusBadge status={status} label={COLUMN_LABELS[status]} />{' '}
                        <span className="stat-value">{data.storyCounts[status] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                  <progress value={data.progress.done} max={Math.max(data.progress.total, 1)} aria-label="Story progress" />
                  <p className="hint">
                    {data.progress.done} of {data.progress.total} done
                  </p>
                </>
              )}
              <footer className="widget-footer">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!data.kanbanEnabled}
                  title={data.kanbanEnabled ? undefined : KANBAN_HINT}
                  onClick={onOpenKanban}
                >
                  Open Kanban
                </button>
                {!data.kanbanEnabled && (
                  <button className="btn btn-secondary" type="button" onClick={() => onOpenPhase('stories')}>
                    Go to User stories
                  </button>
                )}
              </footer>
            </section>
            <section aria-label="Runs" className="dashboard-widget">
              <header className="widget-header">
                <h2>Runs</h2>
              </header>
              <p className="run-summary">
                {data.runs.active} running · {data.runs.queued} queued
                {data.unmerged > 0 ? ` · ${plural(data.unmerged, 'approved branch', 'approved branches')} to merge` : ''}
              </p>
              <button className="btn btn-secondary" type="button" onClick={onOpenPending}>
                {plural(data.pendingDecisions, 'pending decision')}
              </button>
            </section>
            <section aria-label="Recent activity" className="dashboard-widget">
              <header className="widget-header">
                <h2>Recent activity</h2>
              </header>
              {data.activity.length === 0 ? (
                <EmptyState compact title="No runs yet." />
              ) : (
                <ul>
                  {data.activity.map((a) => (
                    <li key={a.runId}>
                      <time dateTime={a.at}>{a.at.slice(0, 16).replace('T', ' ')}</time> {a.label}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Artifacts" className="dashboard-widget">
              <header className="widget-header">
                <h2>Artifacts</h2>
              </header>
              {data.artifacts.map((group) => (
                <div key={group.phase}>
                  <h3>{PHASE_LABEL[group.phase]}</h3>
                  {group.items.length === 0 ? (
                    <p className="hint">None yet</p>
                  ) : (
                    <ul>
                      {group.items.map((a) => (
                        <li key={a.path}>
                          <button type="button" className="link" onClick={() => onOpenArtifact(a.path)}>
                            {a.path} — {a.approval === 'approved' ? 'Approved' : 'Draft'}
                            {a.impacted ? ' · potentially impacted' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
            {data.epics.length > 0 && (
              <section aria-label="Epics" className="dashboard-widget">
                <header className="widget-header">
                  <h2>Epics</h2>
                </header>
                <ul>
                  {data.epics.map((e) => (
                    <li key={e.epicId}>
                      <button type="button" className="link" onClick={() => onOpenEpic(e.epicId)}>
                        {e.epicId} {e.title} · {e.status.replaceAll('_', ' ')} · {e.progress.done}/{e.progress.total}
                      </button>
                      <progress
                        value={e.progress.doneWeight}
                        max={Math.max(e.progress.totalWeight, 1)}
                        aria-label={`Progress of ${e.epicId}`}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
