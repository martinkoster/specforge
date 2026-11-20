// SPDX-License-Identifier: Apache-2.0
// *Create spec baseline* (US-096, UC-048, FR-112): the next `spec-vX.Y` (editable) with the feature intents and epics it
// includes; uncommitted spec changes are committed first (FR-072); without Git there are no baselines.
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type Offer = QueryOutput<'baselines.offer'>;

export interface BaselineDialogProps {
  session: CoreSession;
  projectId: string;
  onClose(): void;
  onCreated(tag: string): void;
  /** Opens *Commit spec changes* (FR-072). */
  onCommitSpecChanges(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function BaselineDialog({ session, projectId, onClose, onCreated, onCommitSpecChanges }: BaselineDialogProps) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void session
      .client()
      .query('baselines.offer', { projectId })
      .then(
        (o) => {
          setOffer(o);
          setTag(o.nextTag);
        },
        (e: unknown) => setError(message(e)),
      );
  }, [session, projectId]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await session.client().command('baselines.create', { projectId, tag: tag.trim() });
      onCreated(created.tag);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Create spec baseline" onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      {offer === null && !error && <p role="status">Checking the specifications…</p>}
      {offer && !offer.available && <p className="callout callout-info">{offer.reason}</p>}
      {offer?.available && (
        <>
          <p>A baseline is an annotated Git tag on the base branch that later changes can be compared against.</p>
          {offer.uncommitted.length > 0 && (
            <div className="callout callout-warning">
              <p>Commit the specification changes first: {offer.uncommitted.join(', ')}</p>
              <button className="btn btn-secondary btn-sm" type="button" onClick={onCommitSpecChanges}>
                Commit spec changes
              </button>
            </div>
          )}
          <label className="field">
            <span>Tag</span>
            <input className="input" aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
          {offer.features.length > 0 ? (
            <>
              <p>Included feature intents:</p>
              <ul>
                {offer.features.map((f) => (
                  <li key={f.id}>
                    {f.id} {f.title}
                  </li>
                ))}
              </ul>
              {offer.epics.length > 0 && (
                <>
                  <p>Epics:</p>
                  <ul>
                    {offer.epics.map((e) => (
                      <li key={e.id}>
                        {e.id} {e.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="field-hint">No feature intents were completed since the previous baseline.</p>
          )}
        </>
      )}
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onClose}>
          {offer?.available === false ? 'Close' : 'Cancel'}
        </button>
        {offer?.available && (
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || offer.uncommitted.length > 0 || tag.trim() === ''}
            onClick={() => void create()}
          >
            Create baseline
          </button>
        )}
      </div>
    </Dialog>
  );
}
