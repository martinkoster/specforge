// SPDX-License-Identifier: Apache-2.0
// Confirmation of *Start epic* / *Start wave* (US-102 AC-1, US-103 AC-3): the Ready stories that move to In Progress —
// each a human authorisation — and the stories that are skipped because they are not Ready.
import type { QueryOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import { COLUMN_LABELS } from './types.js';

export type StartPreview = QueryOutput<'board.startEpicPreview'>;

export interface StartStoriesDialogProps {
  title: string;
  preview: StartPreview;
  onConfirm(): void;
  onCancel(): void;
}

export function StartStoriesDialog({ title, preview, onConfirm, onCancel }: StartStoriesDialogProps) {
  const n = preview.start.length;
  return (
    <Dialog title={title} onClose={onCancel}>
      {n > 0 ? (
        <>
          <p>These Ready stories move to In Progress; stories waiting for predecessors or a free slot are queued.</p>
          <ul aria-label="Stories to start">
            {preview.start.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>No story is Ready to start.</p>
      )}
      {preview.skipped.length > 0 && (
        <>
          <p>Skipped (not Ready):</p>
          <ul aria-label="Skipped">
            {preview.skipped.map((s) => (
              <li key={s.storyId}>
                {s.storyId} ({COLUMN_LABELS[s.status]})
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" disabled={n === 0} onClick={onConfirm}>
          Start {n} {n === 1 ? 'story' : 'stories'}
        </button>
      </div>
    </Dialog>
  );
}
