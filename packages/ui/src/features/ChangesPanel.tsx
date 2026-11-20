// SPDX-License-Identifier: Apache-2.0
// Changes tab of the feature page (US-089, UF-18, FR-107): *Generate delta* for the Requirements (delta) and
// Design (delta) phases; the change set grouped by file with badges *New* / *Modified* / *Deprecated*, the diff per
// item and *Accept* / *Discard* / *Accept all*.
import { useCallback, useEffect, useState } from 'react';
import type { CommandOutput, QueryOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type View = NonNullable<QueryOutput<'delta.changeSet'>>;
type Item = View['items'][number];
type Phase = View['phase'];

type Affected = Extract<CommandOutput<'delta.apply'>, { needsDecision: unknown }>['needsDecision'];
type Choice = 'continue' | 'cancel' | 'apply_in_corrections';
const DECISIONS: readonly [Choice, string][] = [
  ['continue', 'Continue unchanged'],
  ['cancel', 'Cancel / dequeue'],
  ['apply_in_corrections', 'Apply in corrections'],
];
const STATUS: Record<string, string> = { in_progress: 'In progress', review: 'In review' };

/** US-091: a decision per affected in-flight story before the change set applies; *Cancel* applies nothing. */
function InFlightDialog({
  stories,
  onApply,
  onCancel,
}: {
  stories: Affected;
  onApply(decisions: Record<string, Choice>): void;
  onCancel(): void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const complete = stories.every((s) => choices[s.storyId] !== undefined);
  return (
    <Dialog title="Stories in flight" onClose={onCancel}>
      <p>These stories are queued, running or in review and are affected by the accepted changes. Decide for each one.</p>
      {stories.map((s) => (
        <fieldset key={s.storyId} className="in-flight-row" aria-label={`${s.storyId} ${s.title}`}>
          <legend>
            {s.storyId} {s.title}
          </legend>
          <p className="field-hint">
            {STATUS[s.status] ?? s.status}
            {s.subState !== 'none' ? ` (${s.subState})` : ''} · {s.changes.join(', ')}
          </p>
          {DECISIONS.map(([value, label]) => (
            <label key={value}>
              <input
                className="radio"
                type="radio"
                name={`in-flight-${s.storyId}`}
                checked={choices[s.storyId] === value}
                onChange={() => setChoices((c) => ({ ...c, [s.storyId]: value }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" disabled={!complete} onClick={() => onApply(choices)}>
          Apply
        </button>
      </div>
    </Dialog>
  );
}

const KIND: Record<Item['kind'], string> = { new: 'New', modified: 'Modified', deprecated: 'Deprecated' };
const STATE: Record<Item['state'], string> = { open: 'Open', accepted: 'Accepted', discarded: 'Discarded', applied: 'Applied' };

export interface ChangesPanelProps {
  session: CoreSession;
  projectId: string;
  featureId: string;
  initialPhase: Phase;
  /** Limited mode: no delta generation. */
  aiDisabledReason?: string | null;
  /** The change set changed (→ the feature stepper). */
  onChanged?(): void;
  /** Opens a changed artifact for review and approval (US-090). */
  onOpenArtifact?(path: string): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Patch({ patch }: { patch: string }) {
  const lines = patch.split('\n').filter((l, i) => !(i < 4 && /^(Index:|=+$|---|\+\+\+)/.test(l)));
  return (
    <pre className="diff">
      {lines.map((line, i) => (
        <span key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : undefined}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

export function ChangesPanel({
  session,
  projectId,
  featureId,
  initialPhase,
  aiDisabledReason = null,
  onChanged,
  onOpenArtifact,
}: ChangesPanelProps) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [view, setView] = useState<View | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<Affected | null>(null);

  const load = useCallback(async () => {
    setView(await session.client().query('delta.changeSet', { projectId, featureId, phase }));
  }, [session, projectId, featureId, phase]);

  useEffect(() => {
    setView(undefined);
    void load().catch((e: unknown) => setError(message(e)));
  }, [load]);

  useEffect(
    () =>
      session.client().subscribe('features.deltaUpdated', (e) => {
        if (e.projectId === projectId && e.featureId === featureId) void load().catch(() => undefined);
      }),
    [session, projectId, featureId, load],
  );

  const call = (fn: () => Promise<View>) => {
    setError(null);
    void fn().then(
      (next) => {
        setView(next);
        onChanged?.();
      },
      (e: unknown) => setError(message(e)),
    );
  };

  const generate = async () => {
    setError(null);
    const started = await session.client().command('delta.generate', { projectId, featureId, phase });
    if (!started.ok) return setError(started.reason);
    await load();
  };

  const files = view?.state === 'open' || view?.state === 'applied' ? [...new Set(view.items.map((i) => i.path))] : [];
  const appliedPaths = [...new Set((view?.items ?? []).filter((i) => i.state === 'applied').map((i) => i.path))];

  /** US-090: applies the accepted items; conflicting files are reported. */
  const apply = async (decisions?: Record<string, Choice>) => {
    setError(null);
    const result = await session.client().command('delta.apply', { changeSetId: view!.id, ...(decisions ? { decisions } : {}) });
    if ('needsDecision' in result) return setInFlight(result.needsDecision);
    setInFlight(null);
    if (result.conflicts.length > 0)
      setError(`Changed since the generation: ${result.conflicts.join(', ')} — nothing of these files was applied.`);
    await load();
    onChanged?.();
  };
  const canGenerate = !view || view.state === 'failed' || view.state === 'discarded';

  return (
    <div className="changes-panel">
      <div className="segmented" role="group" aria-label="Delta phase">
        {(['requirements', 'design'] as const).map((p) => (
          <button key={p} type="button" className="btn btn-ghost btn-sm" aria-pressed={phase === p} onClick={() => setPhase(p)}>
            {p === 'requirements' ? 'Requirements (delta)' : 'Design (delta)'}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {view?.state === 'failed' && view.reason && <p role="alert">The delta generation failed: {view.reason}</p>}
      {view?.state === 'running' && <p role="status">Generating the delta… the agent writes into a snapshot of the target folder.</p>}
      {view !== undefined && canGenerate && (
        <button
          className="btn btn-primary"
          type="button"
          disabled={aiDisabledReason !== null}
          title={aiDisabledReason ?? undefined}
          onClick={() => void generate().catch((e: unknown) => setError(message(e)))}
        >
          Generate delta
        </button>
      )}
      {files.map((path) => (
        <section key={path} aria-label={path} className="change-file">
          <h3 className="mono">{path}</h3>
          <ul>
            {view!.items
              .filter((i) => i.path === path)
              .map((i) => {
                const label = i.elementId ?? 'Other changes';
                return (
                  <li key={i.id} aria-label={label} className={`change-item change-${i.state}`}>
                    <span
                      className={`badge ${i.kind === 'new' ? 'badge-success' : i.kind === 'deprecated' ? 'badge-warning' : 'badge-info'}`}
                    >
                      {i.elementId ? `${KIND[i.kind]} ${i.elementId}` : 'Other changes'}
                    </span>{' '}
                    {i.state === 'open' && view!.state === 'open' ? (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          aria-label={`Accept ${label}`}
                          onClick={() => call(() => session.client().command('delta.decide', { itemId: i.id, decision: 'accept' }))}
                        >
                          Accept
                        </button>{' '}
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          aria-label={`Discard ${label}`}
                          onClick={() => call(() => session.client().command('delta.decide', { itemId: i.id, decision: 'discard' }))}
                        >
                          Discard
                        </button>
                      </>
                    ) : (
                      <span className="badge badge-neutral">{STATE[i.state]}</span>
                    )}
                    <Patch patch={i.patch} />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {view?.state === 'open' && view.items.every((i) => i.state !== 'open') && view.items.some((i) => i.state === 'accepted') && (
        <div className="dialog-footer">
          <button className="btn btn-primary" type="button" onClick={() => void apply().catch((e: unknown) => setError(message(e)))}>
            Apply accepted changes
          </button>
        </div>
      )}
      {view?.state === 'applied' && (
        <div role="status" className="callout callout-success">
          <p>Applied. Review and approve the changed artifacts to finish the phase.</p>
          {onOpenArtifact &&
            appliedPaths.map((path) => (
              <button
                key={path}
                className="btn btn-secondary btn-sm"
                type="button"
                aria-label={`Open ${path}`}
                onClick={() => onOpenArtifact(path)}
              >
                Open {path}
              </button>
            ))}
        </div>
      )}
      {inFlight && (
        <InFlightDialog
          stories={inFlight}
          onCancel={() => setInFlight(null)}
          onApply={(decisions) => void apply(decisions).catch((e: unknown) => setError(message(e)))}
        />
      )}
      {view?.state === 'open' && view.items.some((i) => i.state === 'open') && (
        <div className="dialog-footer">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => call(() => session.client().command('delta.acceptAll', { changeSetId: view.id }))}
          >
            Accept all
          </button>
        </div>
      )}
    </div>
  );
}
