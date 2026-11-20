// SPDX-License-Identifier: Apache-2.0
// Idea inbox widget (US-095 AC-3, UF-19): untriaged counter, a capture line and the list of ideas with *Turn into
// feature* (wizard pre-filled), *Merge into…* (feature picker) and *Dismiss* (reason); expandable to all ideas.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { EmptyState } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type Idea = QueryOutput<'ideas.list'>['ideas'][number];

export interface IdeaInboxProps {
  session: CoreSession;
  projectId: string;
  /** Features an idea can be merged into. */
  features: readonly { id: string; title: string }[];
  onTurnIntoFeature(idea: Idea): void;
  /** Re-read when the project changes. */
  refreshKey?: unknown;
}

const COLLAPSED = 3;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function outcome(idea: Idea): string | null {
  if (idea.state === 'turned_into_feature') return `→ ${idea.featureId}`;
  if (idea.state === 'merged') return `Merged into ${idea.featureId}`;
  if (idea.state === 'dismissed') return `Dismissed${idea.dismissReason ? `: ${idea.dismissReason}` : ''}`;
  return null;
}

function IdeaRow({
  idea,
  features,
  onTurn,
  onMerge,
  onDismiss,
}: {
  idea: Idea;
  features: IdeaInboxProps['features'];
  onTurn(): void;
  onMerge(featureId: string): void;
  onDismiss(reason: string): void;
}) {
  const [mode, setMode] = useState<'merge' | 'dismiss' | null>(null);
  const [featureId, setFeatureId] = useState('');
  const [reason, setReason] = useState('');
  const result = outcome(idea);
  return (
    <li aria-label={`${idea.id} ${idea.text}`} className="idea-row">
      <p>
        <span className="mono">{idea.id}</span> {idea.text}
      </p>
      <p className="field-hint">
        {idea.createdAt} · {idea.source}
        {idea.note ? ` · ${idea.note}` : ''}
      </p>
      {result ? (
        <span className="badge badge-neutral">{result}</span>
      ) : (
        <div className="idea-actions">
          <button className="btn btn-secondary btn-sm" type="button" onClick={onTurn}>
            Turn into feature
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            aria-pressed={mode === 'merge'}
            onClick={() => setMode(mode === 'merge' ? null : 'merge')}
          >
            Merge into…
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            aria-pressed={mode === 'dismiss'}
            onClick={() => setMode(mode === 'dismiss' ? null : 'dismiss')}
          >
            Dismiss…
          </button>
        </div>
      )}
      {!result && mode === 'merge' && (
        <div className="idea-actions">
          <select className="select" aria-label={`Feature for ${idea.id}`} value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
            <option value="">Feature…</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} {f.title}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" type="button" disabled={featureId === ''} onClick={() => onMerge(featureId)}>
            Merge
          </button>
        </div>
      )}
      {!result && mode === 'dismiss' && (
        <div className="idea-actions">
          <input className="input" aria-label={`Reason for ${idea.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-danger btn-sm" type="button" disabled={reason.trim() === ''} onClick={() => onDismiss(reason.trim())}>
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

export function IdeaInbox({ session, projectId, features, onTurnIntoFeature, refreshKey }: IdeaInboxProps) {
  const [data, setData] = useState<QueryOutput<'ideas.list'> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setData(await session.client().query('ideas.list', { projectId })), [session, projectId]);
  useEffect(() => {
    void load().catch((e: unknown) => setError(message(e)));
  }, [load, refreshKey]);

  const run = (work: () => Promise<unknown>) => {
    setError(null);
    void work()
      .then(load)
      .catch((e: unknown) => setError(message(e)));
  };

  const capture = (e: FormEvent) => {
    e.preventDefault();
    const line = text.trim();
    if (line === '') return;
    run(async () => {
      await session.client().command('ideas.capture', { projectId, text: line, source: 'dashboard' });
      setText('');
    });
  };

  const ideas = data?.ideas ?? [];
  const open = ideas.filter((i) => i.state === 'new');
  const shown = expanded ? ideas : open.slice(0, COLLAPSED);
  return (
    <section aria-label="Idea inbox" className="dashboard-widget idea-inbox">
      <header className="widget-header">
        <h2>Idea inbox</h2>
        {data && <span className="badge badge-info">{data.untriaged} untriaged</span>}
      </header>
      <form onSubmit={capture}>
        <input
          className="input"
          aria-label="Capture an idea"
          placeholder="Capture an idea and press Enter"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
      {error && <p role="alert">{error}</p>}
      {data && ideas.length === 0 && <EmptyState compact title="No ideas yet." />}
      {shown.length > 0 && (
        <ul className="idea-list">
          {shown.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              features={features}
              onTurn={() => onTurnIntoFeature(idea)}
              onMerge={(featureId) => run(() => session.client().command('ideas.merge', { projectId, ideaId: idea.id, featureId }))}
              onDismiss={(reason) => run(() => session.client().command('ideas.dismiss', { projectId, ideaId: idea.id, reason }))}
            />
          ))}
        </ul>
      )}
      {ideas.length > shown.length && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpanded(true)}>
          Show all ({ideas.length})
        </button>
      )}
    </section>
  );
}
