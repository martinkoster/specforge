// SPDX-License-Identifier: Apache-2.0
// Review of a completed story (US-057, UC-022, UF-06): outcome, summary, tests, coverage, open issues, overlap
// warnings; the story's own changed files with diffs; Log, Permissions and Context tabs; Open in editor.
import { useEffect, useState } from 'react';
import type { CommandOutput as QueryOutputCommand, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { RunContext } from '../executions/ExecutionsArea.js';
import { RunLog } from '../executions/RunLog.js';
import { DiffView } from './DiffView.js';

type Review = QueryOutput<'review.get'>;
type Result = QueryOutput<'runs.result'>;
type Permissions = QueryOutput<'runs.permissions'>;
type Versions = QueryOutput<'review.fileVersions'>;
type Tab = 'review' | 'log' | 'permissions' | 'context';

const CHANGE_LABEL = { A: 'Added', M: 'Modified', D: 'Deleted' } as const;
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'log', label: 'Log' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'context', label: 'Context' },
];

export interface ReviewPanelProps {
  session: CoreSession;
  projectId: string;
  storyId: string;
  /** The story was approved or rejected (US-058); the board reloads. */
  onDecided?(): void;
}

type Merge = Extract<QueryOutputCommand<'review.approve'>, { ok: true }>['merge'];

/**
 * Request corrections (US-059, FR-045): the feedback goes to the agent, which continues its session on the same branch;
 * if the session cannot be resumed, a fresh run on the same branch gets the feedback and the previous summary.
 */
function Corrections({
  session,
  projectId,
  storyId,
  onDecided,
  onFail,
}: {
  session: CoreSession;
  projectId: string;
  storyId: string;
  onDecided?(): void;
  onFail(e: unknown): void;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [options, setOptions] = useState<QueryOutput<'review.correctionOptions'> | null>(null);

  useEffect(() => {
    if (!open) return;
    void session.client().query('review.correctionOptions', { projectId, storyId }).then(setOptions, onFail);
  }, [open, session, projectId, storyId]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Request corrections…
      </button>
    );
  }
  const fresh = options !== null && !options.resumable;
  return (
    <div>
      <label>
        Feedback for the agent
        <textarea aria-label="Feedback for the agent" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </label>
      {fresh && (
        <p role="note" className="hint">
          The agent session cannot be resumed ({options.reason}). A fresh run on the same branch gets your feedback and the previous
          summary.
        </p>
      )}
      <button
        type="button"
        disabled={options === null || feedback.trim() === ''}
        onClick={() =>
          void session
            .client()
            .command('review.requestCorrections', { projectId, storyId, feedback, ...(fresh ? { fresh: true } : {}) })
            .then((r) => (r.ok ? onDecided?.() : onFail(new Error(r.reason))))
            .catch(onFail)
        }
      >
        {fresh ? 'Start a fresh run on the same branch' : 'Send to the agent'}
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

/** Approve / Reject (US-058, UC-022): SpecForge never merges; approval shows the merge order. */
function Decision({
  session,
  projectId,
  storyId,
  gitMode,
  onDecided,
}: {
  session: CoreSession;
  projectId: string;
  storyId: string;
  gitMode: boolean;
  onDecided?(): void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [restore, setRestore] = useState(false);
  const [merge, setMerge] = useState<Merge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  if (merge) {
    return (
      <section aria-label="Merge instructions" className="banner">
        <h3>Approved</h3>
        {merge.order.length === 0 ? (
          <p>No branch to merge (the run worked in the workspace).</p>
        ) : (
          <ol>
            {merge.order.map((m) => (
              <li key={m.branch}>
                Merge {m.branch} ({m.storyId}) into {merge.baseBranch ?? 'the base branch'}
              </li>
            ))}
          </ol>
        )}
        <p className="hint">SpecForge does not merge; merge the branches yourself in this order (predecessors first).</p>
      </section>
    );
  }
  return (
    <section aria-label="Decision" className="review-decision">
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        onClick={() =>
          void session
            .client()
            .command('review.approve', { projectId, storyId })
            .then((r) => {
              if (!r.ok) return setError(r.reason);
              setMerge(r.merge);
              onDecided?.();
            })
            .catch(fail)
        }
      >
        Approve
      </button>
      <Corrections session={session} projectId={projectId} storyId={storyId} onFail={fail} {...(onDecided ? { onDecided } : {})} />
      {!rejecting ? (
        <button type="button" onClick={() => setRejecting(true)}>
          Reject…
        </button>
      ) : (
        <div>
          <label>
            Reason (optional)
            <textarea aria-label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {!gitMode && (
            <label>
              <input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} />
              Restore the files the run changed
            </label>
          )}
          <button
            type="button"
            onClick={() =>
              void session
                .client()
                .command('review.reject', {
                  projectId,
                  storyId,
                  ...(reason.trim() ? { reason } : {}),
                  ...(restore ? { restoreSnapshot: true } : {}),
                })
                .then((r) => (r.ok ? onDecided?.() : setError(r.reason)))
                .catch(fail)
            }
          >
            Reject
          </button>
          <button type="button" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

export function ReviewPanel({ session, projectId, storyId, onDecided }: ReviewPanelProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<Result | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('review');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const loaded = await session.client().query('review.get', { projectId, storyId });
      setReview(loaded);
      setResult(loaded.runId ? await session.client().query('runs.result', { runId: loaded.runId }) : null);
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [session, projectId, storyId]);

  if (error) return <p role="alert">{error}</p>;
  if (!review || result === undefined) return <p>Loading the review…</p>;
  if (!review.runId) return <p>This story has no run to review yet.</p>;
  const runId = review.runId;

  return (
    <section className="review-panel" aria-label={`Review of ${storyId}`}>
      <div role="tablist" aria-label="Review sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'review' && (
        <>
          <Summary session={session} projectId={projectId} runId={runId} review={review} result={result} />
          <Decision
            session={session}
            projectId={projectId}
            storyId={storyId}
            gitMode={review.gitMode}
            {...(onDecided ? { onDecided } : {})}
          />
        </>
      )}
      {tab === 'log' && <RunLog session={session} runId={runId} live={false} />}
      {tab === 'permissions' && <PermissionLog session={session} runId={runId} />}
      {tab === 'context' && <RunContext session={session} runId={runId} />}
    </section>
  );
}

function Summary({
  session,
  projectId,
  runId,
  review,
  result,
}: {
  session: CoreSession;
  projectId: string;
  runId: string;
  review: Review;
  result: Result;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [mode, setMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [error, setError] = useState<string | null>(null);
  const files = result?.computedFiles ?? [];

  const show = (path: string) => {
    setSelected(path);
    setVersions(null);
    session
      .client()
      .query('review.fileVersions', { projectId, runId, path })
      .then(setVersions, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  const openInEditor = (path: string) =>
    void session
      .client()
      .command('review.openFile', { projectId, runId, path })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  const outcome = result?.result;
  return (
    <div className="review-summary">
      {error && <p role="alert">{error}</p>}
      {outcome ? (
        <dl>
          <dt>Outcome</dt>
          <dd>{outcome.outcome}</dd>
          <dt>Summary</dt>
          <dd>{outcome.summary}</dd>
          <dt>Tests</dt>
          <dd>
            {outcome.tests ? `${outcome.tests.passed} passed, ${outcome.tests.failed} failed (${outcome.tests.run} run)` : 'Not reported'}
          </dd>
          <dt>Coverage</dt>
          <dd>{outcome.coverage !== undefined ? `${outcome.coverage} %` : 'Not reported'}</dd>
        </dl>
      ) : (
        <p role="status">Result unavailable{result?.unavailableReason ? `: ${result.unavailableReason}` : ''}</p>
      )}
      {outcome && outcome.openIssues.length > 0 && (
        <section aria-label="Open issues">
          <h3>Open issues</h3>
          <ul>
            {outcome.openIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
      {review.overlaps.length > 0 && (
        <section aria-label="Warnings" className="banner banner-warning">
          <h3>Warnings</h3>
          <ul>
            {review.overlaps.map((o) => (
              <li key={o.storyId}>
                Overlaps with {o.storyId}: {o.files.join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Changed files">
        <h3>Changed files</h3>
        {files.length === 0 ? (
          <p>No file changes.</p>
        ) : (
          <ul className="review-files">
            {files.map((f) => (
              <li key={f.path} aria-current={selected === f.path ? 'true' : undefined}>
                <button type="button" className="link" onClick={() => show(f.path)}>
                  {CHANGE_LABEL[f.change]} {f.path}
                </button>{' '}
                <span>
                  +{f.additions} −{f.deletions}
                </span>{' '}
                {f.change !== 'D' && (
                  <button type="button" aria-label={`Open ${f.path} in editor`} onClick={() => openInEditor(f.path)}>
                    Open in editor
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <section aria-label={`Diff of ${selected}`}>
          <div role="radiogroup" aria-label="Diff layout">
            <label>
              <input type="radio" name="diff-layout" checked={mode === 'side-by-side'} onChange={() => setMode('side-by-side')} />
              Side by side
            </label>
            <label>
              <input type="radio" name="diff-layout" checked={mode === 'unified'} onChange={() => setMode('unified')} />
              Unified
            </label>
          </div>
          {!versions ? (
            <p>Loading diff…</p>
          ) : versions.binary ? (
            <p>Binary file — no text diff.</p>
          ) : (
            <DiffView before={versions.before ?? ''} after={versions.after ?? ''} mode={mode} label={selected} />
          )}
        </section>
      )}
    </div>
  );
}

function PermissionLog({ session, runId }: { session: CoreSession; runId: string }) {
  const [log, setLog] = useState<Permissions | null>(null);
  useEffect(() => {
    void session
      .client()
      .query('runs.permissions', { runId })
      .then(setLog, () => setLog([]));
  }, [session, runId]);
  if (!log) return <p>Loading…</p>;
  if (log.length === 0) return <p>No permission requests in this run.</p>;
  return (
    <table aria-label="Permission requests">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Tool</th>
          <th scope="col">Arguments</th>
          <th scope="col">Decision</th>
          <th scope="col">By</th>
        </tr>
      </thead>
      <tbody>
        {log.map((p) => (
          <tr key={p.id}>
            <td>{p.requestedAt}</td>
            <td>{p.toolName}</td>
            <td>
              <code>{JSON.stringify(p.input)}</code>
              {p.outsideWorkspace && ' (outside the workspace)'}
            </td>
            <td>{p.decision ?? 'pending'}</td>
            <td>
              {p.decidedBy ?? '—'}
              {p.message ? `: ${p.message}` : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
