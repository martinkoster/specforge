// SPDX-License-Identifier: Apache-2.0
// Commit spec changes (US-023, UC-039, FR-072): uncommitted spec files with diffs, an editable generated message.
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';

type SpecStatus = QueryOutput<'specCommit.status'>;

const CHANGE_LABEL = { A: 'Added', M: 'Modified', D: 'Deleted' } as const;

export interface CommitSpecDialogProps {
  session: CoreSession;
  projectId: string;
  onDone(): void;
  onCancel(): void;
}

function Diff({ patch }: { patch: string }) {
  if (patch === '') return <p>No text diff available.</p>;
  return (
    <pre className="diff">
      {patch.split('\n').map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'diff-add'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'diff-del'
                : undefined
          }
        >
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

export function CommitSpecDialog({ session, projectId, onDone, onCancel }: CommitSpecDialogProps) {
  const [status, setStatus] = useState<SpecStatus | null>(null);
  const [patches, setPatches] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const loaded = await session.client().query('specCommit.status', { projectId });
      if (!current) return;
      setStatus(loaded);
      setMessage(loaded.message);
      const diffs = await Promise.all(
        loaded.files.map(
          async (f) => [f.path, (await session.client().query('specCommit.diff', { projectId, path: f.path })).patch] as const,
        ),
      );
      if (current) setPatches(Object.fromEntries(diffs));
    })().catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [session, projectId]);

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await session.client().command('specCommit.commit', { projectId, paths: status!.files.map((f) => f.path), message });
      if (result.ok) onDone();
      else setError(result.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const count = status?.files.length ?? 0;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="commit-spec-title" className="dialog commit-spec">
      <h2 id="commit-spec-title">Commit spec changes</h2>
      {error && (
        <pre role="alert" className="banner banner-warning">
          {error}
        </pre>
      )}
      {!status ? (
        <p>Loading…</p>
      ) : count === 0 ? (
        <p>No uncommitted specification files.</p>
      ) : (
        <>
          <p>Only these files are committed, on the current branch of the main workspace.</p>
          {status.files.map((file) => (
            <details key={file.path} open={count <= 3}>
              <summary>
                {CHANGE_LABEL[file.change]} <code>{file.path}</code>
              </summary>
              {patches[file.path] === undefined ? <p>Loading diff…</p> : <Diff patch={patches[file.path]!} />}
            </details>
          ))}
          <label>
            Commit message
            <textarea aria-label="Commit message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        </>
      )}
      <footer>
        {count > 0 && (
          <button type="button" disabled={busy || message.trim() === ''} onClick={() => void commit()}>
            Commit {count} {count === 1 ? 'file' : 'files'}
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </div>
  );
}
