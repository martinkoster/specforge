// SPDX-License-Identifier: Apache-2.0
// Impact tab of the feature page (US-087, UF-18, FR-106): three columns Specs · Work · Code areas with reason,
// confidence and source; unticking removes an item, items can be added by ID or path; *Approve impact* confirms the list.
// US-088: an approved feature starts the AI analysis in the background; its items stream in; *Cancel* / *Re-run*.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { StatusBadge } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type Feature = NonNullable<QueryOutput<'features.get'>>;
type View = NonNullable<Feature['impact']>;
type Item = View['items'][number];

const COLUMNS: readonly [keyof View['columns'], string][] = [
  ['specs', 'Specs'],
  ['work', 'Work'],
  ['code', 'Code areas'],
];
const CATEGORY: Record<Item['category'], string> = {
  requirement: 'Requirement',
  design: 'Design',
  adr: 'ADR',
  epic: 'Epic',
  story_not_started: 'Story (not started)',
  story_in_flight: 'Story in flight',
  story_done: 'Done story (rework)',
  run: 'Run',
  code_area: 'Code area',
};

export interface ImpactPanelProps {
  session: CoreSession;
  projectId: string;
  featureId: string;
  initial: View | null;
  /** The feature intent is approved: the AI analysis starts when the tab opens (US-088). */
  approved?: boolean;
  /** Limited mode: only the trace part (US-088 AC-3). */
  aiDisabledReason?: string | null;
  /** The list was approved (→ the feature stepper advances). */
  onApproved(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ImpactPanel({
  session,
  projectId,
  featureId,
  initial,
  approved = false,
  aiDisabledReason = null,
  onApproved,
}: ImpactPanelProps) {
  const [view, setView] = useState<View | null>(initial && initial.state !== 'not_started' ? initial : null);
  const started = useRef(false);
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The trace-based list is proposed as soon as the tab opens (AC-1).
  useEffect(() => {
    if (view) return;
    void session
      .client()
      .command('impact.propose', { projectId, featureId })
      .then(setView, (e: unknown) => setError(message(e)));
  }, [session, projectId, featureId, view]);

  // US-088 AC-1: the AI analysis starts once in the background when the tab of an approved feature opens.
  useEffect(() => {
    if (!view || started.current || !approved || aiDisabledReason !== null || view.state === 'confirmed' || view.analysing) return;
    if (view.items.some((i) => i.origin === 'agent')) return;
    started.current = true;
    void analyse();
  });

  // Agent items stream in (US-088 AC-2).
  useEffect(
    () =>
      session.client().subscribe('features.impactUpdated', (e) => {
        if (e.projectId !== projectId || e.featureId !== featureId) return;
        void session
          .client()
          .query('impact.view', { projectId, featureId })
          .then(setView)
          .catch(() => undefined);
      }),
    [session, projectId, featureId],
  );

  async function analyse(): Promise<void> {
    const result = await session
      .client()
      .command('impact.analyse', { projectId, featureId })
      .catch((e: unknown) => ({ ok: false as const, reason: message(e) }));
    if (!result.ok) return setError(result.reason);
    setView(await session.client().query('impact.view', { projectId, featureId }));
  }

  const call = (fn: () => Promise<View>) => {
    setError(null);
    void fn().then(setView, (e: unknown) => setError(message(e)));
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (ref.trim() === '') return;
    call(async () => {
      const next = await session.client().command('impact.add', { projectId, featureId, ref });
      setRef('');
      return next;
    });
  };

  if (!view) return error ? <p role="alert">{error}</p> : <p role="status">Tracing the impact…</p>;
  const confirmed = view.state === 'confirmed';
  return (
    <div className="impact-panel">
      {error && <p role="alert">{error}</p>}
      {confirmed && <StatusBadge status="approved" label="Impact approved" />}
      {view.analysing ? (
        <p role="status" className="impact-analysing">
          Analysing code…{' '}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() =>
              void session
                .client()
                .command('impact.cancel', { projectId, featureId })
                .catch((e: unknown) => setError(message(e)))
            }
          >
            Cancel analysis
          </button>
        </p>
      ) : (
        !confirmed &&
        (aiDisabledReason !== null ? (
          <p className="field-hint">AI analysis is unavailable: {aiDisabledReason} The trace-based impact is shown.</p>
        ) : (
          approved && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void analyse()}>
              Re-run analysis
            </button>
          )
        ))
      )}
      <div className="impact-columns">
        {COLUMNS.map(([key, label]) => (
          <section key={key} aria-label={label} className="impact-column">
            <h3>{label}</h3>
            {view.columns[key].length === 0 ? (
              <p className="field-hint">Nothing found.</p>
            ) : (
              <ul>
                {view.columns[key].map((item) => (
                  <li key={item.id} aria-label={item.targetRef} className="impact-item">
                    <label>
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked
                        disabled={confirmed}
                        aria-label={`Keep ${item.targetRef}`}
                        onChange={() => call(() => session.client().command('impact.remove', { projectId, featureId, itemId: item.id }))}
                      />
                      <span className="mono">{item.targetRef}</span>
                    </label>{' '}
                    <span className="badge badge-neutral">{CATEGORY[item.category]}</span>{' '}
                    <span className="badge badge-info">{item.confidence}</span>{' '}
                    <span className="badge badge-neutral">{item.origin === 'agent' ? 'AI' : item.origin}</span>
                    <p className="field-hint">{item.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {!confirmed && (
        <>
          <form className="impact-add" onSubmit={add}>
            <label>
              Add item
              <input className="input" value={ref} placeholder="FR-012, US-008 or src/path.ts" onChange={(e) => setRef(e.target.value)} />
            </label>
            <button className="btn btn-secondary" type="submit">
              Add
            </button>
          </form>
          <div className="dialog-footer">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() =>
                call(async () => {
                  const approved = await session.client().command('impact.approve', { projectId, featureId });
                  onApproved();
                  return approved;
                })
              }
            >
              Approve impact
            </button>
          </div>
        </>
      )}
    </div>
  );
}
