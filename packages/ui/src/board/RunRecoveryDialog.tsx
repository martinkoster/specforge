// SPDX-License-Identifier: Apache-2.0
// Recovery of a failed or interrupted run (US-055, UC-023, FR-026/FR-035): retry, resume or discard.
import { useEffect, useState } from 'react';
import type { CommandInput, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';

type Recovery = QueryOutput<'runs.recovery'>;
type Action = CommandInput<'board.runAction'>;

export interface RunRecoveryDialogProps {
  session: CoreSession;
  projectId: string;
  storyId: string;
  onDone(): void;
  onCancel(): void;
}

export function RunRecoveryDialog({ session, projectId, storyId, onDone, onCancel }: RunRecoveryDialogProps) {
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [reuseBranch, setReuseBranch] = useState(false);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void session
      .client()
      .query('runs.recovery', { projectId, storyId })
      .then(setRecovery, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [session, projectId, storyId]);

  const run = async (input: Omit<Action, 'projectId' | 'storyId'>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await session.client().command('board.runAction', { projectId, storyId, ...input });
      if (result.ok) onDone();
      else setError(result.reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="recover-title" className="dialog">
      <h2 id="recover-title">Recover {storyId}</h2>
      {error && <p role="alert">{error}</p>}
      {!recovery ? (
        <p>Loading…</p>
      ) : (
        <>
          <section aria-label="Retry">
            <h3>Retry</h3>
            <p>Starts a new run with a fresh agent session when a run slot is free; earlier runs stay in the history.</p>
            {recovery.gitMode && (
              <fieldset>
                <legend>Branch</legend>
                <label>
                  <input type="radio" name="retry-branch" checked={!reuseBranch} onChange={() => setReuseBranch(false)} />
                  Fresh branch from the base branch
                </label>
                <label>
                  <input type="radio" name="retry-branch" checked={reuseBranch} onChange={() => setReuseBranch(true)} />
                  Reuse the existing branch
                </label>
              </fieldset>
            )}
            <button type="button" disabled={busy} onClick={() => void run({ action: 'retry', reuseBranch })}>
              Retry
            </button>
          </section>
          <section aria-label="Resume">
            <h3>Resume</h3>
            <p>Continues the agent session of the last run where it stopped.</p>
            <button
              type="button"
              disabled={busy || !recovery.resumable}
              title={recovery.resumable ? undefined : 'The agent session of the last run cannot be resumed.'}
              onClick={() => void run({ action: 'resume' })}
            >
              Resume
            </button>
          </section>
          <section aria-label="Discard">
            <h3>Discard</h3>
            <p>Returns the story to Ready.</p>
            {recovery.hasWorktree && (
              <label>
                <input type="checkbox" checked={removeWorktree} onChange={(e) => setRemoveWorktree(e.target.checked)} />
                Also remove the worktree
              </label>
            )}
            <button type="button" disabled={busy} onClick={() => void run({ action: 'discard', removeWorktree })}>
              Discard
            </button>
          </section>
        </>
      )}
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </div>
  );
}
