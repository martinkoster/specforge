// SPDX-License-Identifier: Apache-2.0
// *Capture idea* popover (US-095 AC-1, UF-19, NFR-032): one text line and an optional note; Enter saves — at most two
// interactions from any screen (shortcut or menu, then type + Enter).
import { useState, type FormEvent } from 'react';
import type { CommandInput, CommandOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

export type IdeaSource = CommandInput<'ideas.capture'>['source'];
type Idea = CommandOutput<'ideas.capture'>;

export interface CaptureIdeaDialogProps {
  session: CoreSession;
  projectId: string;
  source: IdeaSource;
  /** Pre-filled text, e.g. a chat message (US-100 AC-2); editable. */
  initialText?: string;
  /** Closed: with the saved idea, or without one (cancelled). */
  onClose(saved?: Idea): void;
}

export function CaptureIdeaDialog({ session, projectId, source, initialText = '', onClose }: CaptureIdeaDialogProps) {
  const [text, setText] = useState(initialText.replace(/\s+/g, ' ').trim().slice(0, 500));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (text.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await session.client().command('ideas.capture', {
        projectId,
        text: text.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        source,
      });
      onClose(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Capture idea" onClose={() => onClose()}>
      <form className="capture-idea" onSubmit={(e) => void save(e)}>
        <label className="field">
          <span>Idea</span>
          <input
            className="input"
            aria-label="Idea"
            autoFocus
            maxLength={500}
            value={text}
            placeholder="One line — triage it later"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Note (optional)</span>
          <input className="input" aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={() => onClose()}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={text.trim() === '' || busy}>
            Save idea
          </button>
        </div>
      </form>
    </Dialog>
  );
}
