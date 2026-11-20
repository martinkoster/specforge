// SPDX-License-Identifier: Apache-2.0
// Feature page (US-084, UF-18, FR-105): FI-ID, title, status and the feature-scoped stepper with soft gates (FR-080);
// tabs Intent · Impact (US-087/US-088) · Changes (US-089) · Epic & stories (US-093) · Activity; completion banner and
// *Withdraw* (US-094); the banner offers a spec baseline (US-096).
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { EmptyState, StatusBadge } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';
import { ChangesPanel } from './ChangesPanel.js';
import { ImpactPanel } from './ImpactPanel.js';
import { StoriesPanel } from './StoriesPanel.js';
import { WithdrawDialog } from './WithdrawDialog.js';

type Feature = NonNullable<QueryOutput<'features.get'>>;
type Phase = Feature['phases'][number]['phase'];
type Tab = 'intent' | 'impact' | 'changes' | 'stories' | 'activity';

const PHASE_LABEL: Record<Phase, string> = {
  intent: 'Feature intent',
  impact: 'Impact',
  requirements: 'Requirements (delta)',
  design: 'Design (delta)',
  stories: 'Epic & stories',
  kanban: 'Kanban',
  epic_review: 'Epic review',
};
const STATUS_LABEL: Record<Feature['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  in_delivery: 'In delivery',
  done: 'Done',
  withdrawn: 'Withdrawn',
};
const TABS: readonly [Tab, string][] = [
  ['intent', 'Intent'],
  ['impact', 'Impact'],
  ['changes', 'Changes'],
  ['stories', 'Epic & stories'],
  ['activity', 'Activity'],
];
const DECISION_LABEL = {
  continue: 'Continue unchanged',
  cancel: 'Cancel / dequeue',
  apply_in_corrections: 'Apply in corrections',
} as const;
const TAB_OF: Record<Phase, Tab> = {
  intent: 'intent',
  impact: 'impact',
  requirements: 'changes',
  design: 'changes',
  stories: 'stories',
  kanban: 'stories',
  epic_review: 'stories',
};

export interface FeaturePageProps {
  session: CoreSession;
  projectId: string;
  featureId: string;
  onBack(): void;
  onOpenArtifact(path: string): void;
  /** Re-read when the project changes. */
  refreshKey?: unknown;
  /** Limited mode (US-088 AC-3). */
  aiDisabledReason?: string | null;
  /** *Open on Kanban* after the feature's stories are applied (US-093 AC-4). */
  onOpenKanban?(): void;
  /** *Create baseline* from the completion banner (US-096 AC-1). */
  onCreateBaseline?(): void;
}

export function FeaturePage({
  session,
  projectId,
  featureId,
  onBack,
  onOpenArtifact,
  refreshKey,
  aiDisabledReason = null,
  onOpenKanban,
  onCreateBaseline,
}: FeaturePageProps) {
  const [feature, setFeature] = useState<Feature | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab | null>(null);
  const [gate, setGate] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);
  const [baseline, setBaseline] = useState<QueryOutput<'baselines.offer'> | null>(null);
  const done = feature?.status === 'done';
  useEffect(() => {
    if (!done || !onCreateBaseline) return;
    void session
      .client()
      .query('baselines.offer', { projectId })
      .then(setBaseline, () => setBaseline(null));
  }, [session, projectId, done, onCreateBaseline, refreshKey]);

  useEffect(() => {
    void session
      .client()
      .query('features.get', { projectId, featureId })
      .then(setFeature, () => setFeature(null));
  }, [session, projectId, featureId, refreshKey, reload]);

  const shown: Tab = tab ?? (feature ? TAB_OF[feature.current] : 'intent');
  useEffect(() => {
    if (shown !== 'intent' || !feature) return;
    void session
      .client()
      .query('artifact.read', { projectId, path: feature.path })
      .then(
        (f) => setContent(f.content),
        () => setContent(null),
      );
  }, [session, projectId, feature, shown]);

  if (feature === undefined) return <p role="status">Loading {featureId}…</p>;
  if (feature === null) {
    return (
      <div className="feature-page">
        <p role="alert">{featureId} no longer exists.</p>
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const openPhase = (phase: Feature['phases'][number]) => {
    setGate(
      phase.unapprovedEarlier.length > 0
        ? `${phase.unapprovedEarlier.map((p) => PHASE_LABEL[p]).join(', ')} not approved yet — work in ${PHASE_LABEL[phase.phase]} may need rework.`
        : null,
    );
    setTab(TAB_OF[phase.phase]);
  };
  const stories = feature.links.filter((l) => l.id.startsWith('US-'));

  return (
    <div className="feature-page">
      <header className="page-header">
        <div className="page-heading">
          <h1>
            {feature.id} {feature.title}
          </h1>
          <StatusBadge status={feature.status} label={STATUS_LABEL[feature.status]} />
        </div>
        <div className="page-actions">
          {feature.status !== 'done' && feature.status !== 'withdrawn' && (
            <button className="btn btn-ghost" type="button" onClick={() => setWithdrawing(true)}>
              Withdraw…
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      {feature.status === 'done' && (
        <div role="status" aria-label="Feature complete" className="callout callout-success">
          <p>
            {feature.id} {feature.title} is done 🎯 — all {feature.progress.total} linked stories are Done.
          </p>
          {baseline && !baseline.available && <p className="field-hint">{baseline.reason}</p>}
          {baseline?.available && onCreateBaseline && (
            <button className="btn btn-primary btn-sm" type="button" onClick={onCreateBaseline}>
              Create baseline {baseline.nextTag}
            </button>
          )}
        </div>
      )}
      {withdrawing && (
        <WithdrawDialog
          session={session}
          projectId={projectId}
          featureId={feature.id}
          onClose={() => setWithdrawing(false)}
          onWithdrawn={() => {
            setWithdrawing(false);
            setReload((n) => n + 1);
          }}
        />
      )}
      <nav aria-label="Feature phases" className="feature-stepper">
        {feature.phases.map((p) => (
          <button
            key={p.phase}
            type="button"
            className={`phase-step phase-${p.state === 'approved' ? 'done' : p.phase === feature.current ? 'current' : 'todo'}`}
            aria-current={p.phase === feature.current ? 'step' : undefined}
            onClick={() => openPhase(p)}
          >
            {PHASE_LABEL[p.phase]} · {p.state.replace(/_/g, ' ')}
          </button>
        ))}
      </nav>
      {gate && (
        <p role="status" className="callout callout-warning">
          {gate}
        </p>
      )}
      <div role="tablist" aria-label="Feature" className="feature-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            className="btn btn-ghost btn-sm"
            aria-selected={shown === id}
            onClick={() => {
              setGate(null);
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={TABS.find(([id]) => id === shown)![1]} className="feature-tabpanel">
        {shown === 'intent' ? (
          <>
            <div className="page-actions">
              <button className="btn btn-secondary" type="button" onClick={() => onOpenArtifact(feature.path)}>
                Open in editor
              </button>
            </div>
            {content !== null && <pre className="wizard-preview">{content}</pre>}
          </>
        ) : shown === 'impact' ? (
          <ImpactPanel
            session={session}
            projectId={projectId}
            featureId={feature.id}
            initial={feature.impact}
            approved={feature.approval === 'approved'}
            aiDisabledReason={aiDisabledReason}
            onApproved={() => setReload((n) => n + 1)}
          />
        ) : shown === 'changes' ? (
          <ChangesPanel
            session={session}
            projectId={projectId}
            featureId={feature.id}
            initialPhase={feature.current === 'design' ? 'design' : 'requirements'}
            aiDisabledReason={aiDisabledReason}
            onOpenArtifact={onOpenArtifact}
            onChanged={() => setReload((n) => n + 1)}
          />
        ) : shown === 'stories' ? (
          <StoriesPanel
            session={session}
            projectId={projectId}
            featureId={feature.id}
            stories={stories.map((s) => s.id)}
            aiDisabledReason={aiDisabledReason}
            onOpenArtifact={onOpenArtifact}
            onChanged={() => setReload((n) => n + 1)}
            {...(onOpenKanban ? { onOpenKanban } : {})}
          />
        ) : feature.links.length === 0 && feature.decisions.length === 0 && (feature.events ?? []).length === 0 ? (
          <EmptyState compact title="No activity yet" description="Elements introduced or changed by the feature appear here." />
        ) : (
          <>
            {(feature.events ?? []).length > 0 && (
              <ul aria-label="Status changes">
                {feature.events!.map((e) => (
                  <li key={`${e.status}:${e.at}`}>
                    <time dateTime={e.at}>{e.at.slice(0, 16).replace('T', ' ')}</time> {STATUS_LABEL[e.status]}
                    {e.note ? ` — ${e.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {feature.decisions.length > 0 && (
              <ul aria-label="In-flight decisions">
                {feature.decisions.map((d) => (
                  <li key={`${d.storyId}:${d.decidedAt}`}>
                    {d.storyId}: {DECISION_LABEL[d.decision]}
                  </li>
                ))}
              </ul>
            )}
            <ul>
              {feature.links.map((l) => (
                <li key={l.id}>
                  {l.id} {l.type}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
