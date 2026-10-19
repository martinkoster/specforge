// SPDX-License-Identifier: Apache-2.0
// Start wizard: open or create a project, reopen recent projects, rename/remove/locate (US-017, UC-029, UF-01b).
import { useState, type FormEvent } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';

export type RecentProject = QueryOutput<'projects.recent'>[number];

export interface StartWizardProps {
  recent: readonly RecentProject[];
  /** Open/create/locate need the native folder picker; without a handler the action is shown disabled. */
  onOpenExisting?(): void;
  onCreateNew?(): void;
  onOpenRecent?(projectId: string): void;
  onRename(projectId: string, name: string): Promise<void>;
  /** Rejects with a user-facing message, e.g. while runs are active. */
  onRemove(projectId: string): Promise<void>;
  onLocate?(projectId: string): void;
}

const UNAVAILABLE = 'Not available yet';

function lastOpened(at: string | null): string {
  if (!at) return 'Never opened';
  return `Last opened ${new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

function RecentItem({ project, props, onAskRemove }: { project: RecentProject; props: StartWizardProps; onAskRemove(): void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setEditing(false);
    if (name.trim() !== '' && name !== project.name) void props.onRename(project.id, name.trim());
  };

  return (
    <li aria-label={project.name} className={project.missing ? 'recent recent-missing' : 'recent'}>
      {editing ? (
        <form onSubmit={submit}>
          <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit">Save</button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : project.missing ? (
        <span className="recent-name">{project.name}</span>
      ) : (
        <button
          type="button"
          className="recent-name"
          aria-label={`Open ${project.name}`}
          disabled={!props.onOpenRecent}
          title={props.onOpenRecent ? undefined : UNAVAILABLE}
          onClick={() => props.onOpenRecent?.(project.id)}
        >
          {project.name}
        </button>
      )}
      <span className="recent-path">{project.path}</span>
      {project.missing ? (
        <span className="badge badge-warning">Folder not found</span>
      ) : (
        <span className="badge">{project.phaseLabel}</span>
      )}
      <span className="recent-opened">{lastOpened(project.lastOpenedAt)}</span>
      <span className="recent-actions">
        {project.missing ? (
          <button
            type="button"
            aria-label={`Locate ${project.name}`}
            disabled={!props.onLocate}
            title={props.onLocate ? undefined : UNAVAILABLE}
            onClick={() => props.onLocate?.(project.id)}
          >
            Locate
          </button>
        ) : (
          <button type="button" aria-label={`Rename ${project.name}`} onClick={() => setEditing(true)}>
            Rename
          </button>
        )}
        <button type="button" aria-label={`Remove ${project.name}`} onClick={onAskRemove}>
          Remove from list
        </button>
      </span>
    </li>
  );
}

export function StartWizard(props: StartWizardProps) {
  const [removing, setRemoving] = useState<RecentProject | undefined>();
  const [error, setError] = useState<string | undefined>();

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return;
    const project = removing;
    setRemoving(undefined);
    try {
      await props.onRemove(project.id);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="start-wizard" aria-label="Start">
      <div className="start-cards">
        <button
          type="button"
          className="start-card"
          disabled={!props.onOpenExisting}
          title={props.onOpenExisting ? undefined : UNAVAILABLE}
          onClick={() => props.onOpenExisting?.()}
        >
          Open existing project
        </button>
        <button
          type="button"
          className="start-card"
          disabled={!props.onCreateNew}
          title={props.onCreateNew ? undefined : UNAVAILABLE}
          onClick={() => props.onCreateNew?.()}
        >
          Create new project
        </button>
      </div>
      <h2>Recent projects</h2>
      {error && <p role="alert">{error}</p>}
      {props.recent.length === 0 ? (
        <p>No recent projects</p>
      ) : (
        <ul className="recent-list">
          {props.recent.map((p) => (
            <RecentItem key={p.id} project={p} props={props} onAskRemove={() => setRemoving(p)} />
          ))}
        </ul>
      )}
      {removing && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="remove-title" aria-describedby="remove-text" className="dialog">
          <h3 id="remove-title">Remove {removing.name}?</h3>
          <p id="remove-text">The project is removed from SpecForge; files in {removing.path} are not deleted.</p>
          <button type="button" onClick={() => void confirmRemove()}>
            Remove from list
          </button>
          <button type="button" onClick={() => setRemoving(undefined)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
