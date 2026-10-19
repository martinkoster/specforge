// SPDX-License-Identifier: Apache-2.0
// Artifact split view: CodeMirror editor and rendered preview; atomic save with conflict handling (US-025, US-021).
import { useEffect, useState } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import { ConflictDialog } from '../documents/ConflictDialog.js';
import { MarkdownEditor } from './MarkdownEditor.js';
import { MarkdownPreview } from './MarkdownPreview.js';

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
}: ArtifactEditorProps) {
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
        <span className="path">{path}</span>
        {approval && (
          <span className={approval === 'approved' ? 'badge' : 'badge badge-warning'}>
            {approval === 'approved' ? 'Approved' : 'Draft'}
          </span>
        )}
        {approval === 'draft' && onApprove && (
          <button
            type="button"
            disabled={dirty}
            title={dirty ? 'Save your changes before approving.' : undefined}
            onClick={() => void onApprove().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          >
            Approve
          </button>
        )}
        {openFindings > 0 && (
          <span className="badge badge-warning">{openFindings === 1 ? '1 open finding' : `${openFindings} open findings`}</span>
        )}
        <button type="button" disabled={!dirty || status === 'saving'} onClick={() => void save(base.hash)}>
          Save
        </button>
        <span aria-live="polite">{dirty ? 'Unsaved changes' : status === 'saved' ? 'Saved' : ''}</span>
      </div>
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
