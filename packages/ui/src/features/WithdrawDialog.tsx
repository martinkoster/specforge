// SPDX-License-Identifier: Apache-2.0
// *Withdraw* a feature (US-094 AC-2, FR-104): confirmation that lists the open change sets (discarded), the applied
// changes (kept, can be deprecated) and a keep/delete decision per not-started story. Withdrawn is terminal.
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type Preview = QueryOutput<'features.withdrawPreview'>;

export interface WithdrawDialogProps {
  session: CoreSession;
  projectId: string;
  featureId: string;
  onWithdrawn(): void;
  onClose(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function WithdrawDialog({ session, projectId, featureId, onWithdrawn, onClose }: WithdrawDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [remove, setRemove] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void session
      .client()
      .query('features.withdrawPreview', { projectId, featureId })
      .then(setPreview, (e: unknown) => setError(message(e)));
  }, [session, projectId, featureId]);

  const choose = (id: string, del: boolean) =>
    setRemove((current) => {
      const next = new Set(current);
      if (del) next.add(id);
      else next.delete(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.client().command('features.withdraw', { projectId, featureId, deleteStories: [...remove].sort() });
      onWithdrawn();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Withdraw ${featureId}?`} onClose={onClose}>
      <p>Withdrawing ends the feature for good — a withdrawn feature cannot be resumed.</p>
      {error && <p role="alert">{error}</p>}
      {preview === null && !error && <p role="status">Checking the feature…</p>}
      {preview && (
        <>
          {preview.blockedBy && <p role="alert">{preview.blockedBy}</p>}
          {preview.openChangeSets.length > 0 && <p>Open change sets are discarded: {preview.openChangeSets.join(', ')}.</p>}
          {preview.appliedChanges.length > 0 && (
            <p>
              Applied changes stay: {preview.appliedChanges.join(', ')}. You can deprecate them in the specifications if they are no longer
              wanted.
            </p>
          )}
          {preview.notStartedStories.length > 0 && <p>Not-started stories of the feature — keep or delete each one:</p>}
          {preview.notStartedStories.map((id) => (
            <fieldset key={id} role="radiogroup" aria-label={id} className="in-flight-row">
              <legend>{id}</legend>
              <label>
                <input
                  className="radio"
                  type="radio"
                  name={`withdraw-${id}`}
                  checked={!remove.has(id)}
                  onChange={() => choose(id, false)}
                />
                Keep
              </label>
              <label>
                <input className="radio" type="radio" name={`withdraw-${id}`} checked={remove.has(id)} onChange={() => choose(id, true)} />
                Delete
              </label>
            </fieldset>
          ))}
        </>
      )}
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          type="button"
          disabled={!preview || preview.blockedBy !== null || busy}
          onClick={() => void confirm()}
        >
          Withdraw feature
        </button>
      </div>
    </Dialog>
  );
}
