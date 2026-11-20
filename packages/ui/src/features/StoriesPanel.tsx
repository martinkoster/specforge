// SPDX-License-Identifier: Apache-2.0
// Epic & stories tab of the feature page (US-093, UF-18, FR-108): the epic choice (a new epic by default, or extending
// epics of the impact list) is approved first; then the agent proposes the stories — new, adjusted and rework stories —
// as a change set reviewed per file; after applying, *Open on Kanban*.
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { ChangesPanel } from './ChangesPanel.js';

type Proposal = QueryOutput<'delta.epicProposal'>;

export interface StoriesPanelProps {
  session: CoreSession;
  projectId: string;
  featureId: string;
  /** Stories linked to the feature. */
  stories: readonly string[];
  aiDisabledReason?: string | null;
  onOpenKanban?(): void;
  onOpenArtifact?(path: string): void;
  onChanged?(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function StoriesPanel({
  session,
  projectId,
  featureId,
  stories,
  aiDisabledReason = null,
  onOpenKanban,
  onOpenArtifact,
  onChanged,
}: StoriesPanelProps) {
  const [proposal, setProposal] = useState<Proposal | null | undefined>(undefined);
  const [selected, setSelected] = useState<string>('new');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await session.client().query('delta.epicProposal', { projectId, featureId });
    setProposal(next);
    setTitle((t) => t || next.newEpic.title);
  }, [session, projectId, featureId]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setProposal(null);
      setError(message(e));
    });
  }, [load]);

  const approve = async () => {
    setError(null);
    const choice = selected === 'new' ? { mode: 'new' as const, title: title.trim() } : { mode: 'extend' as const, epicIds: [selected] };
    try {
      setProposal(await session.client().command('delta.chooseEpic', { projectId, featureId, choice }));
      setEditing(false);
      onChanged?.();
    } catch (e) {
      setError(message(e));
    }
  };

  const choice = proposal?.choice ?? null;
  return (
    <div className="stories-panel">
      {error && <p role="alert">{error}</p>}
      {proposal === undefined && <p role="status">Loading the epic proposal…</p>}
      {proposal && (!choice || editing) && (
        <>
          <fieldset role="radiogroup" aria-label="Epic" className="epic-choice">
            <legend>Epic for {featureId}</legend>
            <label>
              <input className="radio" type="radio" name="epic-choice" checked={selected === 'new'} onChange={() => setSelected('new')} />
              New epic {proposal.newEpic.id} (recommended)
            </label>
            <label className="field">
              <span>Epic title</span>
              <input
                className="input"
                aria-label="Epic title"
                value={title}
                disabled={selected !== 'new'}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {proposal.extend.map((e) => (
              <label key={e.id}>
                <input className="radio" type="radio" name="epic-choice" checked={selected === e.id} onChange={() => setSelected(e.id)} />
                Extend {e.id} {e.title}
                <span className="field-hint"> — {e.reason}</span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-footer">
            {editing && (
              <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button
              className="btn btn-primary"
              type="button"
              disabled={selected === 'new' && title.trim() === ''}
              onClick={() => void approve()}
            >
              Approve epic choice
            </button>
          </div>
        </>
      )}
      {choice && !editing && (
        <>
          <p className="epic-chosen">
            {choice.mode === 'new' ? `Epic: new ${choice.epicIds[0]} "${choice.title ?? ''}"` : `Epic: extend ${choice.epicIds.join(', ')}`}{' '}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(true)}>
              Change epic
            </button>
          </p>
          <ChangesPanel
            session={session}
            projectId={projectId}
            featureId={featureId}
            initialPhase="stories"
            phases={['stories']}
            aiDisabledReason={aiDisabledReason}
            {...(onOpenKanban ? { onOpenKanban } : {})}
            {...(onOpenArtifact ? { onOpenArtifact } : {})}
            {...(onChanged ? { onChanged } : {})}
          />
        </>
      )}
      {stories.length > 0 && (
        <ul aria-label="Feature stories">
          {stories.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
