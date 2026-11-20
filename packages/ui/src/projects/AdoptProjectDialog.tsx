// SPDX-License-Identifier: Apache-2.0
// Adopt-existing-code dialog (US-079, US-080, UC-030, UF-01b): folder, project name, specification folder (validated),
// "Initialise Git" and "Analyse the codebase now".
import { DEFAULT_SPEC_ROOT, specRootError } from '@specforge/domain';
import { useEffect, useState, type FormEvent } from 'react';
import type { CommandInput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import { folderBaseName } from './CreateProjectDialog.js';

export type AdoptProjectInput = CommandInput<'projects.adopt'>;

/** A picked folder with existing code, as inspected by the core. */
export interface AdoptFolder {
  path: string;
  git: 'none' | 'root' | 'subfolder';
  suggestedSpecRoot: string;
}

export interface AdoptProjectDialogProps {
  folder: AdoptFolder;
  gitAvailable: boolean;
  /** Why AI runs are disabled (limited mode, US-013), or null: the analysis option is then off and disabled. */
  aiDisabledReason?: string | null;
  /** Why the specification folder cannot be used (e.g. an existing non-empty folder), or null. */
  checkSpecRoot(path: string, specRoot: string): Promise<string | null>;
  /** Picks another folder; resolves null when cancelled. */
  onChangeFolder(): Promise<AdoptFolder | null>;
  /** Rejects with a user-facing message. */
  onAdopt(input: AdoptProjectInput, options: { analyze: boolean }): Promise<void>;
  onCancel(): void;
}

export const REPOSITORY_ROOT_HINT =
  'This folder lies inside a Git repository. Choose the repository root (or a folder without version control).';

export function AdoptProjectDialog({
  folder: initial,
  gitAvailable,
  aiDisabledReason = null,
  checkSpecRoot,
  onChangeFolder,
  onAdopt,
  onCancel,
}: AdoptProjectDialogProps) {
  const [folder, setFolder] = useState(initial);
  const [name, setName] = useState(folderBaseName(initial.path));
  const [nameEdited, setNameEdited] = useState(false);
  const [specRoot, setSpecRoot] = useState(initial.suggestedSpecRoot);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [initGit, setInitGit] = useState(true);
  const [analyze, setAnalyze] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const local = specRootError(specRoot);
    if (local) {
      setProblem(local);
      setChecking(false);
      return;
    }
    let current = true;
    setChecking(true);
    void checkSpecRoot(folder.path, specRoot)
      .then((p) => current && setProblem(p))
      .catch((e: unknown) => current && setProblem(e instanceof Error ? e.message : String(e)))
      .finally(() => current && setChecking(false));
    return () => {
      current = false;
    };
  }, [specRoot, folder.path, checkSpecRoot]);

  const showGit = folder.git === 'none' && gitAvailable;
  const ready = name.trim() !== '' && problem === null && !checking && folder.git !== 'subfolder' && !busy;

  const changeFolder = async (): Promise<void> => {
    try {
      const next = await onChangeFolder();
      if (!next) return;
      setFolder(next);
      if (!nameEdited) setName(folderBaseName(next.path));
      setSpecRoot(next.suggestedSpecRoot);
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
      await onAdopt(
        { name: name.trim(), path: folder.path, specRoot, initGit: showGit && initGit },
        { analyze: aiDisabledReason === null && analyze },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Adopt existing code" onClose={onCancel} busy={busy}>
      <form onSubmit={(e) => void submit(e)}>
        <div>
          <span>Folder</span> <span className="path">{folder.path}</span>{' '}
          <button className="btn btn-secondary" type="button" onClick={() => void changeFolder()}>
            Change…
          </button>
        </div>
        {folder.git === 'subfolder' && <p role="alert">{REPOSITORY_ROOT_HINT}</p>}
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
          Specification folder
          <input
            className="input"
            value={specRoot}
            aria-invalid={problem !== null}
            aria-describedby={problem !== null ? 'adopt-spec-root-problem' : 'adopt-spec-root-hint'}
            onChange={(e) => setSpecRoot(e.target.value)}
          />
        </label>
        {problem !== null ? (
          <p id="adopt-spec-root-problem" className="field-error">
            {problem}
          </p>
        ) : (
          <p id="adopt-spec-root-hint" className="field-hint">
            {folder.suggestedSpecRoot !== DEFAULT_SPEC_ROOT && specRoot === folder.suggestedSpecRoot
              ? `${DEFAULT_SPEC_ROOT}/ already exists and is left untouched. `
              : ''}
            Specifications are written below this folder; existing files are not modified.
          </p>
        )}
        {showGit && (
          <label>
            <input className="checkbox" type="checkbox" checked={initGit} onChange={(e) => setInitGit(e.target.checked)} />
            Initialise Git repository (commits only the SpecForge files)
          </label>
        )}
        <label>
          <input
            className="checkbox"
            type="checkbox"
            checked={aiDisabledReason === null && analyze}
            disabled={aiDisabledReason !== null}
            onChange={(e) => setAnalyze(e.target.checked)}
          />
          Analyse the codebase now to draft the intent and current-state specifications
        </label>
        {aiDisabledReason !== null && <p className="field-hint">{aiDisabledReason}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={!ready}>
            Adopt
          </button>
        </div>
      </form>
    </Dialog>
  );
}
