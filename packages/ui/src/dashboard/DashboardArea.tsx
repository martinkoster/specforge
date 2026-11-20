// SPDX-License-Identifier: Apache-2.0
// Project dashboard (US-061, UC-034, UF-12): phase stepper, next step with action, story statistics and progress,
// runs, pending decisions, recent activity, artifacts per phase, epics and the Kanban link; ＋ Add feature and the
// feature wizard drafts (US-082, UF-12).
import { ArrowRightCircle } from 'lucide-react';
import { IdeaInbox } from '../features/IdeaInbox.js';
import { SpecHistory } from '../features/SpecHistory.js';
import { Icon } from '../components/icons.js';
import { EmptyState, Menu, PageHeader, Skeleton, StatusBadge } from '../components/index.js';
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { COLUMN_LABELS } from '../board/types.js';
import { PhaseStepper, type GuidedPhase, type PhaseStatus } from '../shell/PhaseStepper.js';
import { useSpecLayout } from '../specs/spec-layout-context.js';
import { ChatPanel } from './ChatPanel.js';

type Dashboard = QueryOutput<'dashboard.get'>;
type NextStep = NonNullable<QueryOutput<'shell.state'>['nextStep']>;
type Feature = QueryOutput<'features.list'>[number];

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
  /** US-082 AC-1: features are added once the main intent is approved. */
  intentApproved?: boolean;
  /** Opens the feature wizard: a new feature (null) or a stored draft. */
  onAddFeature?(resumeId: string | null): void;
  /** *Capture idea* from the Add feature menu (US-095 AC-1). */
  onCaptureIdea?(): void;
  /** *Create baseline* from the spec history (US-096 AC-1/AC-3). */
  onCreateBaseline?(): void;
  /** *Turn into feature* from the idea inbox (US-095 AC-3). */
  onTurnIdeaIntoFeature?(idea: QueryOutput<'ideas.list'>['ideas'][number]): void;
  /** *Edit specs directly* (Specifications area). */
  onEditSpecs?(): void;
  /** Opens a feature page (US-084). */
  onOpenFeature?(featureId: string): void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const FEATURE_STATUS: Record<Feature['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  in_delivery: 'In delivery',
  done: 'Done',
  withdrawn: 'Withdrawn',
};
const FEATURE_PHASE: Record<Feature['current'], string> = {
  intent: 'Feature intent',
  impact: 'Impact',
  requirements: 'Requirements (delta)',
  design: 'Design (delta)',
  stories: 'Epic & stories',
  kanban: 'Kanban',
  epic_review: 'Epic review',
};

/** Active features widget (US-085, UF-12 1b): mini stepper, story progress and next step per feature. */
function ActiveFeatures({ features, onOpen }: { features: readonly Feature[]; onOpen(featureId: string): void }) {
  const active = features.filter((f) => f.status !== 'done' && f.status !== 'withdrawn');
  const done = features.filter((f) => f.status === 'done');
  return (
    <section aria-label="Active features" className="card active-features">
      <h2>Active features</h2>
      {active.length > 0 && (
        <ul className="feature-list">
          {active.map((f) => (
            <li key={f.id} aria-label={`${f.id} ${f.title}`} className="feature-card">
              <button className="link" type="button" aria-label={`Open ${f.id} ${f.title}`} onClick={() => onOpen(f.id)}>
                {f.id} {f.title}
              </button>{' '}
              <StatusBadge status={f.status} label={FEATURE_STATUS[f.status]} />
              <ol aria-label={`${f.id} phases`} className="mini-stepper">
                {f.phases.map((p) => (
                  <li
                    key={p.phase}
                    aria-current={p.phase === f.current ? 'step' : undefined}
                    className={p.state === 'approved' ? 'mini-step mini-step-done' : 'mini-step'}
                    title={`${FEATURE_PHASE[p.phase]} · ${p.state.replace(/_/g, ' ')}`}
                  >
                    {FEATURE_PHASE[p.phase]}
                  </li>
                ))}
              </ol>
              <p className="feature-card-meta">
                {f.progress.total > 0 ? `${f.progress.done} of ${plural(f.progress.total, 'story', 'stories')} done` : 'No stories yet'}
                {f.nextStep ? ` · Next: ${f.nextStep}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details>
          <summary>Done features ({done.length})</summary>
          <ul className="feature-list">
            {done.map((f) => (
              <li key={f.id}>
                <button className="link" type="button" onClick={() => onOpen(f.id)}>
                  {f.id} {f.title}
                  {f.baseline ? ` · ${f.baseline}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

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
  intentApproved = false,
  onAddFeature,
  onEditSpecs,
  onOpenFeature,
  onCaptureIdea,
  onTurnIdeaIntoFeature,
  onCreateBaseline,
}: DashboardAreaProps) {
  const layout = useSpecLayout();
  const [data, setData] = useState<Dashboard | null>(null);
  const [drafts, setDrafts] = useState<QueryOutput<'features.wizard.drafts'>>([]);
  const [features, setFeatures] = useState<QueryOutput<'features.list'>>([]);

  useEffect(() => {
    if (!onOpenFeature) return;
    void session
      .client()
      .query('features.list', { projectId })
      .then(setFeatures, () => setFeatures([]));
  }, [session, projectId, refreshKey, onOpenFeature]);

  useEffect(() => {
    if (!onAddFeature) return;
    void session
      .client()
      .query('features.wizard.drafts', { projectId })
      .then(setDrafts, () => setDrafts([]));
  }, [session, projectId, refreshKey, onAddFeature]);
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
      <PageHeader
        title="Dashboard"
        {...(onAddFeature
          ? {
              actions: intentApproved ? (
                <span className="add-feature">
                  <button className="btn btn-primary" type="button" onClick={() => onAddFeature(null)}>
                    ＋ Add feature
                  </button>
                  <Menu
                    label="More ways to add a feature"
                    trigger="▾"
                    items={[
                      { label: 'Add feature', onSelect: () => onAddFeature(null) },
                      ...(onCaptureIdea ? [{ label: 'Capture idea', onSelect: onCaptureIdea }] : []),
                      ...(onEditSpecs ? [{ label: 'Edit specs directly', onSelect: onEditSpecs }] : []),
                    ]}
                  />
                </span>
              ) : (
                <button className="btn btn-secondary" type="button" onClick={() => onOpenPhase('intent')}>
                  Approve the main intent to add features
                </button>
              ),
            }
          : {})}
      />
      {features.some((f) => f.status !== 'withdrawn') && onOpenFeature && <ActiveFeatures features={features} onOpen={onOpenFeature} />}
      {onTurnIdeaIntoFeature && intentApproved && (
        <IdeaInbox
          session={session}
          projectId={projectId}
          features={features.filter((f) => f.status !== 'done' && f.status !== 'withdrawn').map((f) => ({ id: f.id, title: f.title }))}
          onTurnIntoFeature={onTurnIdeaIntoFeature}
          refreshKey={refreshKey}
        />
      )}
      {onCreateBaseline && intentApproved && (
        <SpecHistory session={session} projectId={projectId} onCreate={onCreateBaseline} refreshKey={refreshKey} />
      )}
      {drafts.length > 0 && onAddFeature && (
        <ul aria-label="Draft features" className="feature-drafts">
          {drafts.map((d) => (
            <li key={d.id}>
              Draft feature: {d.title} —{' '}
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                aria-label={`Resume ${d.title}`}
                onClick={() => onAddFeature(d.id)}
              >
                resume
              </button>
            </li>
          ))}
        </ul>
      )}
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
                    <li key={a.runId ?? `${a.featureId}:${a.at}`}>
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
                            {layout.display(a.path)} — {a.approval === 'approved' ? 'Approved' : 'Draft'}
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
