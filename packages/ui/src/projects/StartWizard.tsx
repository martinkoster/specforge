// SPDX-License-Identifier: Apache-2.0
// Start wizard: open, create or adopt a project, reopen recent projects, rename/remove/locate (US-017, US-079, UC-029, UF-01b).
import { FolderCode, FolderOpen, FolderPlus, History, type LucideIcon } from 'lucide-react';
import { Dialog, EmptyState, Menu, StatusBadge } from '../components/index.js';
import { Icon } from '../components/icons.js';
import { useState, type FormEvent } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';

export type RecentProject = QueryOutput<'projects.recent'>[number];

export interface StartWizardProps {
  recent: readonly RecentProject[];
  /** Open/create/locate need the native folder picker; without a handler the action is shown disabled. */
  onOpenExisting?(): void;
  onCreateNew?(): void;
  /** US-079: bring a folder with existing code under SpecForge. */
  onAdoptExisting?(): void;
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
        <form className="recent-rename" onSubmit={submit}>
          <input className="input" aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" type="submit">
            Save
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : project.missing ? (
        <span className="recent-name">{project.name}</span>
      ) : (
        <button
          type="button"
          className="link recent-name"
          aria-label={`Open ${project.name}`}
          disabled={!props.onOpenRecent}
          title={props.onOpenRecent ? undefined : UNAVAILABLE}
          onClick={() => props.onOpenRecent?.(project.id)}
        >
          {project.name}
        </button>
      )}
      <span className="recent-path path">{project.path}</span>
      {project.missing ? (
        <StatusBadge status="missing" tone="warning" label="Folder not found" />
      ) : (
        project.phaseLabel && <StatusBadge status={project.phase?.state ?? 'not_started'} label={project.phaseLabel} />
      )}
      <span className="recent-opened">{lastOpened(project.lastOpenedAt)}</span>
      <span className="recent-actions">
        {project.missing && (
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            aria-label={`Locate ${project.name}`}
            disabled={!props.onLocate}
            title={props.onLocate ? undefined : UNAVAILABLE}
            onClick={() => props.onLocate?.(project.id)}
          >
            Locate
          </button>
        )}
        <Menu
          label={`Actions for ${project.name}`}
          items={[
            ...(project.missing ? [] : [{ label: 'Rename', onSelect: () => setEditing(true) }]),
            { label: 'Remove from list', onSelect: onAskRemove, danger: true },
          ]}
        />
      </span>
    </li>
  );
}

/** Large interactive card: the title is the accessible name, the explanation its description. */
function StartCard({
  id,
  icon,
  title,
  text,
  onClick,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="start-card"
      aria-labelledby={`start-${id}-title`}
      aria-describedby={`start-${id}-text`}
      disabled={!onClick}
      title={onClick ? undefined : UNAVAILABLE}
      onClick={() => onClick?.()}
    >
      <Icon icon={icon} size={24} className="start-card-icon" />
      <span id={`start-${id}-title`} className="start-card-title">
        {title}
      </span>
      <span id={`start-${id}-text`} className="start-card-text">
        {text}
      </span>
    </button>
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
      <header className="start-header">
        <h1>Welcome to SpecForge</h1>
        <p className="page-description">Turn an idea into specifications and let AI agents build it — you decide what and when.</p>
      </header>
      <div className="start-cards">
        <StartCard
          id="open"
          icon={FolderOpen}
          title="Open existing project"
          text="Continue a SpecForge project from a folder or a cloned repository."
          {...(props.onOpenExisting ? { onClick: props.onOpenExisting } : {})}
        />
        <StartCard
          id="create"
          icon={FolderPlus}
          title="Create new project"
          text="Pick or create an empty folder and start with the intent."
          {...(props.onCreateNew ? { onClick: props.onCreateNew } : {})}
        />
        <StartCard
          id="adopt"
          icon={FolderCode}
          title="Adopt existing code"
          text="Bring a folder that already contains code under SpecForge; existing files stay untouched."
          {...(props.onAdoptExisting ? { onClick: props.onAdoptExisting } : {})}
        />
      </div>
      <section aria-label="Recent projects" className="recent-projects">
        <h2>
          <Icon icon={History} /> Recent projects
        </h2>
        {error && <p role="alert">{error}</p>}
        {props.recent.length === 0 ? (
          <EmptyState compact icon={History} title="No recent projects" description="Projects you open or create appear here." />
        ) : (
          <ul className="recent-list">
            {props.recent.map((p) => (
              <RecentItem key={p.id} project={p} props={props} onAskRemove={() => setRemoving(p)} />
            ))}
          </ul>
        )}
      </section>
      {removing && (
        <Dialog role="alertdialog" tone="danger" title={<>Remove {removing.name}?</>} onClose={() => setRemoving(undefined)}>
          <p>The project is removed from SpecForge; files in {removing.path} are not deleted.</p>
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setRemoving(undefined)}>
              Cancel
            </button>
            <button className="btn btn-danger" type="button" onClick={() => void confirmRemove()}>
              Remove from list
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
