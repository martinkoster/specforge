// SPDX-License-Identifier: Apache-2.0
// Artifact split view: CodeMirror editor and rendered preview; atomic save with conflict handling (US-025, US-021);
// *Compare with baseline…* (US-096 AC-3).
import { StatusBadge } from '../components/index.js';
import { useEffect, useState } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import { ConflictDialog } from '../documents/ConflictDialog.js';
import { DiffView } from '../review/DiffView.js';
import { MarkdownEditor } from './MarkdownEditor.js';
import { MarkdownPreview } from './MarkdownPreview.js';
import { useSpecLayout } from './spec-layout-context.js';

type SaveResult = CommandOutput<'artifact.save'>;
type Conflict = Extract<SaveResult, { ok: false }>['conflict'];

export interface ArtifactEditorProps {
  path: string;
  initial: { content: string; hash: string };
  onSave(content: string, expectedHash: string | null): Promise<SaveResult>;
  /** Approval state of the artifact (US-026); the badge and *Approve* are shown when given. */
  approval?: 'draft' | 'approved';
  onApprove?(): Promise<void>;
  /** Jump target in the editor (US-029 AC-2). */
  focusLine?: { line: number; seq: number } | null;
  /** Open quality findings (US-029 AC-4), shown as a header badge. */
  openFindings?: number;
  /** Notified on every edit (the AI panel works on the current content). */
  onContentChange?(content: string): void;
  /** Spec baselines to compare with (US-096), newest first; none = no comparison. */
  baselines?: readonly string[];
  /** The file at a baseline (null = it did not exist there). */
  onCompare?(tag: string): Promise<{ before: string | null; after: string | null }>;
}

export function ArtifactEditor({
  path,
  initial,
  onSave,
  approval,
  onApprove,
  focusLine = null,
  openFindings = 0,
  onContentChange,
  baselines = [],
  onCompare,
}: ArtifactEditorProps) {
  const [compared, setCompared] = useState<{ tag: string; before: string } | null>(null);
  const layout = useSpecLayout();
  const [content, setContentState] = useState(initial.content);
  const setContent = (next: string) => {
    setContentState(next);
    onContentChange?.(next);
  };
  const [base, setBase] = useState(initial);
  const [conflict, setConflict] = useState<Conflict | undefined>();
  const [status, setStatus] = useState<'clean' | 'dirty' | 'saving' | 'saved'>('clean');
  const [error, setError] = useState<string | undefined>();
  const dirty = content !== base.content;

  const save = async (expectedHash: string | null): Promise<void> => {
    setStatus('saving');
    try {
      const result = await onSave(content, expectedHash);
      if (result.ok) {
        setBase({ content, hash: result.hash });
        setConflict(undefined);
        setStatus('saved');
      } else {
        setConflict(result.conflict);
        setStatus('dirty');
      }
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('dirty');
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && status !== 'saving') void save(base.hash);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="artifact-editor">
      <div className="artifact-toolbar">
        <span className="path" title={path}>
          {layout.display(path)}
        </span>
        {approval && <StatusBadge status={approval} label={approval === 'approved' ? 'Approved' : 'Draft'} />}
        {approval === 'draft' && onApprove && (
          <button
            className="btn btn-primary"
            type="button"
            disabled={dirty}
            title={dirty ? 'Save your changes before approving.' : undefined}
            onClick={() => void onApprove().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          >
            Approve
          </button>
        )}
        {openFindings > 0 && (
          <StatusBadge status="warning" label={openFindings === 1 ? '1 open finding' : `${openFindings} open findings`} />
        )}
        <button className="btn btn-secondary" type="button" disabled={!dirty || status === 'saving'} onClick={() => void save(base.hash)}>
          Save
        </button>
        <span aria-live="polite">{dirty ? 'Unsaved changes' : status === 'saved' ? 'Saved' : ''}</span>
        {onCompare && baselines.length > 0 && (
          <select
            className="select"
            aria-label="Compare with baseline…"
            value=""
            onChange={(e) => {
              const tag = e.target.value;
              if (!tag) return;
              void onCompare(tag).then(
                (r) => setCompared({ tag, before: r.before ?? '' }),
                (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
              );
            }}
          >
            <option value="">Compare with baseline…</option>
            {baselines.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
      </div>
      {compared && (
        <section aria-label={`Compared with ${compared.tag}`} className="baseline-compare">
          <div className="artifact-toolbar">
            <span>
              Changes since {compared.tag} (left: {compared.tag}, right: current content)
            </span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCompared(null)}>
              Close comparison
            </button>
          </div>
          <DiffView before={compared.before} after={content} mode="unified" label={`${path} since ${compared.tag}`} />
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="split">
        <section aria-label="Editor">
          <MarkdownEditor value={content} onChange={setContent} label={`Edit ${path}`} focusLine={focusLine} />
        </section>
        <section aria-label="Preview">
          <MarkdownPreview markdown={content} />
        </section>
      </div>
      {conflict && (
        <ConflictDialog
          path={path}
          diff={conflict.diff}
          onResolve={(resolution) => {
            if (resolution === 'keep-mine') {
              void save(conflict.theirsHash);
              return;
            }
            setBase({ content: conflict.theirs, hash: conflict.theirsHash });
            setContent(conflict.theirs);
            setConflict(undefined);
            setStatus('clean');
          }}
        />
      )}
    </div>
  );
}
