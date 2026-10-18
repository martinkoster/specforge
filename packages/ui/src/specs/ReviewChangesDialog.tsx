// SPDX-License-Identifier: Apache-2.0
// Review changes of a specification run (US-027 AC-3/AC-4, ADR-014): diffs, validation issues, Keep / Discard / fix.
import { useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';

export type SpecReview = NonNullable<QueryOutput<'specs.review'>>;

const CHANGE_LABEL = { A: 'Added', M: 'Modified', D: 'Deleted' } as const;

export interface ReviewChangesDialogProps {
  review: SpecReview;
  onKeep(): Promise<void>;
  onDiscard(): Promise<void>;
  onFix(): Promise<void>;
  onClose(): void;
}

function Patch({ patch }: { patch: string }) {
  // Skip the "Index/===/---/+++" header of the unified diff.
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

export function ReviewChangesDialog({ review, onKeep, onDiscard, onFix, onClose }: ReviewChangesDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = (action: () => Promise<void>) => async () => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="review-changes-title" className="dialog review-changes">
      <h2 id="review-changes-title">Review changes in {review.target}</h2>
      {review.state !== 'open' && review.reason && (
        <p role="status">
          The run {review.state === 'failed' ? 'failed' : 'was cancelled'}: {review.reason}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {review.issues.length > 0 && (
        <section aria-label="Validation issues">
          <h3>Validation issues</h3>
          <ul>
            {review.issues.map((issue, i) => (
              <li key={i}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={act(onFix)}>
            Ask agent to fix
          </button>
        </section>
      )}
      <section aria-label="Changed files">
        <h3>
          {review.files.length === 0 ? 'No files changed' : `${review.files.length} file${review.files.length === 1 ? '' : 's'} changed`}
        </h3>
        {review.files.map((file) => (
          <details key={file.path} open={review.files.length <= 3}>
            <summary>
              {CHANGE_LABEL[file.change]} <code>{file.path}</code>
            </summary>
            {file.patch ? <Patch patch={file.patch} /> : <p>No text diff available.</p>}
          </details>
        ))}
      </section>
      <footer>
        <button type="button" disabled={busy} onClick={act(onKeep)}>
          Keep
        </button>
        <button type="button" disabled={busy} onClick={act(onDiscard)}>
          Discard
        </button>
        <button type="button" onClick={onClose}>
          Decide later
        </button>
      </footer>
    </div>
  );
}
