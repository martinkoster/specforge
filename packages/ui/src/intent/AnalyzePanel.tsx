// SPDX-License-Identifier: Apache-2.0
// Codebase analysis on the Intent screen (US-080, UC-030): start an `analyze` run (optionally limited to folders),
// follow it and review the current-state drafts with Keep / Discard.
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';
import { ReviewChangesDialog, type SpecReview } from '../specs/ReviewChangesDialog.js';

export interface AnalyzePanelProps {
  session: CoreSession;
  projectId: string;
  aiDisabledReason: string | null;
  /** Drafts were kept or discarded. */
  onChanged(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AnalyzePanel({ session, projectId, aiDisabledReason, onChanged }: AnalyzePanelProps) {
  const [available, setAvailable] = useState(false);
  const [review, setReview] = useState<SpecReview | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [folders, setFolders] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const client = session.client();
    void Promise.all([
      client.query('specs.analysisAvailable', { projectId }).catch(() => ({ available: false })),
      client.query('specs.openAnalysis', { projectId }).catch(() => null),
    ]).then(([a, open]) => {
      if (!current) return;
      setAvailable(a.available);
      setReview(open);
    });
    return () => {
      current = false;
    };
  }, [session, projectId]);

  const load = useCallback(
    async (runId: string) => {
      const r = await session.client().query('specs.review', { runId });
      // A kept, discarded or superseded review is closed: a late event must not reopen it.
      const open = r && ['running', 'open', 'failed', 'cancelled'].includes(r.state) ? r : null;
      setReview(open);
      if (open && open.state !== 'running') setShowReview(true);
    },
    [session],
  );

  const runId = review?.runId ?? null;
  useEffect(
    () =>
      session.client().subscribe('spec.reviewReady', (e) => {
        if (e.projectId === projectId && e.runId === runId) void load(e.runId).catch(() => undefined);
      }),
    [session, projectId, runId, load],
  );

  const start = async (): Promise<void> => {
    setError(null);
    const limitTo = folders
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f !== '');
    const started = await session.client().command('specs.analyze', { projectId, ...(limitTo.length ? { limitTo } : {}) });
    if (!started.ok) return setError(started.reason);
    await load(started.runId);
  };

  const decide = (action: 'specs.keep' | 'specs.discard') => async () => {
    const result = await session.client().command(action, { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    setShowReview(false);
    setReview(null);
    onChanged();
  };

  const fix = async () => {
    const result = await session.client().command('specs.fix', { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    setShowReview(false);
    await load(result.runId);
  };

  if (!available && !review) return null;
  return (
    <section className="analyze-panel" aria-label="Codebase analysis">
      {error && <p role="alert">{error}</p>}
      {review?.state === 'running' ? (
        <p role="status">Analysing the codebase… the drafts are written to {review.target}/.</p>
      ) : review ? (
        <p role="status">
          The analysis drafts are waiting for your review.{' '}
          <button className="btn btn-secondary" type="button" onClick={() => setShowReview(true)}>
            Review the analysis
          </button>
        </p>
      ) : (
        <>
          <p>Draft the intent and the current-state requirements and design from the existing code.</p>
          <label>
            Limit to folders
            <input
              className="input"
              value={folders}
              placeholder="optional, e.g. src, lib/core"
              onChange={(e) => setFolders(e.target.value)}
            />
          </label>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={aiDisabledReason !== null}
            title={aiDisabledReason ?? undefined}
            onClick={() => void start().catch((e: unknown) => setError(message(e)))}
          >
            Analyse codebase
          </button>
          {aiDisabledReason !== null && <p className="field-hint">{aiDisabledReason}</p>}
        </>
      )}
      {review && showReview && (
        <ReviewChangesDialog
          review={review}
          onKeep={decide('specs.keep')}
          onDiscard={decide('specs.discard')}
          onFix={fix}
          onClose={() => setShowReview(false)}
        />
      )}
    </section>
  );
}
