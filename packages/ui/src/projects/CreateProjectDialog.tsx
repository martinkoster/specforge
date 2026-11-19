// SPDX-License-Identifier: Apache-2.0
// Create-project dialog, folder-first (US-068, D24, UC-029 flow B, UF-01b): picked folder, project name, "Initialise Git".
import { Dialog } from '../components/index.js';
import { useState, type FormEvent } from 'react';
import type { CommandInput } from '@specforge/ipc-contract';

export type CreateProjectInput = CommandInput<'projects.create'>;

export interface CreateProjectDialogProps {
  /** The picked folder (empty or new). */
  folder: string;
  gitAvailable: boolean;
  /** Picks another folder; resolves null when cancelled, rejects with a user-facing message (e.g. folder not empty). */
  onChangeFolder(): Promise<string | null>;
  /** Rejects with a user-facing message. */
  onCreate(input: CreateProjectInput): Promise<void>;
  onCancel(): void;
}

/** Shown for a picked folder with other content: adopting existing code is Release 2 (FR-079). */
export const ADOPT_IN_RELEASE_2 = 'Choose an empty folder — adopting existing code arrives in Release 2.';

/** Last segment of a Windows or POSIX path; empty for a drive or file-system root. */
export function folderBaseName(path: string): string {
  const last =
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? '';
  return last.endsWith(':') ? '' : last;
}

export function CreateProjectDialog({ folder: initialFolder, gitAvailable, onChangeFolder, onCreate, onCancel }: CreateProjectDialogProps) {
  const [folder, setFolder] = useState(initialFolder);
  const [name, setName] = useState(folderBaseName(initialFolder));
  const [nameEdited, setNameEdited] = useState(false);
  const [initGit, setInitGit] = useState(gitAvailable);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const ready = name.trim() !== '' && !busy;

  const changeFolder = async (): Promise<void> => {
    try {
      const next = await onChangeFolder();
      if (!next) return;
      setFolder(next);
      if (!nameEdited) setName(folderBaseName(next));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), path: folder, initGit: gitAvailable && initGit });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Create new project" onClose={onCancel} busy={busy}>
      <form onSubmit={(e) => void submit(e)}>
        <div>
          <span>Folder</span> <span className="path">{folder}</span>{' '}
          <button className="btn btn-secondary" type="button" onClick={() => void changeFolder()}>
            Change…
          </button>
        </div>
        <label>
          Project name
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setNameEdited(true);
              setName(e.target.value);
            }}
            autoFocus
          />
        </label>
        <label>
          <input
            className="checkbox"
            type="checkbox"
            checked={gitAvailable && initGit}
            disabled={!gitAvailable}
            onChange={(e) => setInitGit(e.target.checked)}
          />
          Initialise Git repository (recommended — enables parallel runs)
        </label>
        {!gitAvailable && <p>Git is not installed — the project is created without Git (one run at a time, no isolation).</p>}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={!ready}>
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}
