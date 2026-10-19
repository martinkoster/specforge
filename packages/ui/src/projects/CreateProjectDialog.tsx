// SPDX-License-Identifier: Apache-2.0
// Create-project dialog: name, location, folder name, "Initialise Git" (US-018, UC-029 flow B, UF-01b).
import { useState, type FormEvent } from 'react';
import type { CommandInput } from '@specforge/ipc-contract';

export type CreateProjectInput = CommandInput<'projects.create'>;

export interface CreateProjectDialogProps {
  gitAvailable: boolean;
  onPickFolder(): Promise<string | null>;
  /** Rejects with a user-facing message (e.g. folder not empty). */
  onCreate(input: CreateProjectInput): Promise<void>;
  onCancel(): void;
}

/** Folder name derived from the project name: lower case, ASCII, words joined by "-". */
export function folderNameFor(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreateProjectDialog({ gitAvailable, onPickFolder, onCreate, onCancel }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [folderEdited, setFolderEdited] = useState(false);
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [initGit, setInitGit] = useState(gitAvailable);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const effectiveFolder = folderEdited ? folderName : folderNameFor(name);
  const ready = name.trim() !== '' && effectiveFolder.trim() !== '' && parentDir !== null && !busy;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), parentDir, folderName: effectiveFolder.trim(), initGit: gitAvailable && initGit });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="dialog">
      <h2 id="create-project-title">Create new project</h2>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Project name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div>
          <span>Location</span> <span className="path">{parentDir ?? 'No location chosen'}</span>{' '}
          <button
            type="button"
            onClick={() =>
              void onPickFolder().then((dir) => {
                if (dir) setParentDir(dir);
              })
            }
          >
            Choose location…
          </button>
        </div>
        <label>
          Folder name
          <input
            value={effectiveFolder}
            onChange={(e) => {
              setFolderEdited(true);
              setFolderName(e.target.value);
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={gitAvailable && initGit}
            disabled={!gitAvailable}
            onChange={(e) => setInitGit(e.target.checked)}
          />
          Initialise Git repository (recommended — enables parallel runs)
        </label>
        {!gitAvailable && <p>Git is not installed — the project is created without Git (one run at a time, no isolation).</p>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={!ready}>
          Create
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
  );
}
