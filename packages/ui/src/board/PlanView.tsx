// SPDX-License-Identifier: Apache-2.0
// Implementation plan (US-103, UF-14, FR-084): waves as columns with size totals, the critical path highlighted, cards
// coloured by board state, the derived epic graph (US-101) above; *Start wave* and, grouped by epic, *Start epic* (US-102).
import { useCallback, useEffect, useState } from 'react';
import type { CommandOutput, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { StartStoriesDialog, type StartPreview } from './StartStoriesDialog.js';
import { COLUMN_LABELS } from './types.js';

type Plan = QueryOutput<'plan.get'>;
type PlanStory = Plan['waves'][number]['stories'][number];
type Pending = { title: string; preview: StartPreview; run(): Promise<CommandOutput<'plan.startWave'>> };

export interface PlanViewProps {
  session: CoreSession;
  projectId: string;
  /** Stories were started (board and shell re-read). */
  onChanged(): void;
  refreshKey?: unknown;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PlanView({ session, projectId, onChanged, refreshKey }: PlanViewProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [byEpic, setByEpic] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setPlan(await session.client().query('plan.get', { projectId })), [session, projectId]);
  useEffect(() => {
    void load().catch((e: unknown) => setError(message(e)));
  }, [load, refreshKey]);

  const ask = (title: string, preview: Promise<StartPreview>, run: Pending['run']) => {
    setError(null);
    void preview.then(
      (p) => setPending({ title, preview: p, run }),
      (e: unknown) => setError(message(e)),
    );
  };
  const confirm = async () => {
    const current = pending!;
    setPending(null);
    try {
      const result = await current.run();
      const parts = [
        result.started.length ? `Started ${result.started.join(', ')}` : '',
        ...result.failed.map((f) => `${f.storyId}: ${f.reason}`),
      ].filter(Boolean);
      setNotice(parts.join(' · ') || 'Nothing was started.');
      await load();
      onChanged();
    } catch (e) {
      setError(message(e));
    }
  };

  if (error && !plan) return <p role="alert">{error}</p>;
  if (!plan) return <p role="status">Computing the plan…</p>;
  const critical = new Set(plan.criticalPath);
  const storyCard = (s: PlanStory) => (
    <li
      key={s.id}
      aria-label={`${s.id} ${s.title}`}
      title={COLUMN_LABELS[s.status]}
      className={`plan-card plan-card-${s.status}${critical.has(s.id) ? ' plan-card-critical' : ''}`}
    >
      <span className="mono">{s.id}</span> {s.title}
      {s.size && <span className="badge badge-neutral">{s.size}</span>}
    </li>
  );
  const all = plan.waves.flatMap((w) => w.stories);
  const epics = [...new Set(all.map((s) => s.epicId ?? 'none'))].sort((a, b) =>
    a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b),
  );

  return (
    <div className="plan-view">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {plan.epicEdges.length > 0 && (
        <ul aria-label="Epic dependencies" className="plan-epics">
          {plan.epicEdges.map((e) => (
            <li key={`${e.from}>${e.to}`}>
              {e.from} depends on {e.to}
            </li>
          ))}
        </ul>
      )}
      {plan.criticalPath.length > 0 && <p className="hint">Critical path: {plan.criticalPath.join(' → ')}</p>}
      <label className="checkbox-label">
        <input className="checkbox" type="checkbox" checked={byEpic} onChange={(e) => setByEpic(e.target.checked)} />
        Group by epic
      </label>
      {plan.waves.length === 0 && <p className="hint">Every story is Done — there is nothing left to plan.</p>}
      {byEpic ? (
        <div className="plan-groups">
          {epics.map((epic) => (
            <div key={epic} role="group" aria-label={epic === 'none' ? 'No epic' : epic} className="plan-group">
              <h3>{epic === 'none' ? 'No epic' : epic}</h3>
              <ul>{all.filter((s) => (s.epicId ?? 'none') === epic).map(storyCard)}</ul>
              {epic !== 'none' && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  aria-label={`Start epic ${epic}`}
                  onClick={() =>
                    ask(`Start epic ${epic}`, session.client().query('board.startEpicPreview', { projectId, epicId: epic }), () =>
                      session.client().command('board.startEpic', { projectId, epicId: epic }),
                    )
                  }
                >
                  Start epic
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="plan-waves">
          {plan.waves.map((w) => (
            <section key={w.index} aria-label={`Wave ${w.index + 1}`} className="plan-wave">
              <header className="widget-header">
                <h3>Wave {w.index + 1}</h3>
                <span className="hint">{w.size} points</span>
              </header>
              <ul>{w.stories.map(storyCard)}</ul>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                aria-label={`Start wave ${w.index + 1}`}
                onClick={() =>
                  ask(`Start wave ${w.index + 1}`, session.client().query('plan.wavePreview', { projectId, wave: w.index }), () =>
                    session.client().command('plan.startWave', { projectId, wave: w.index }),
                  )
                }
              >
                Start wave
              </button>
            </section>
          ))}
        </div>
      )}
      {pending && (
        <StartStoriesDialog
          title={pending.title}
          preview={pending.preview}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </div>
  );
}
