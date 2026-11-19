// SPDX-License-Identifier: Apache-2.0
// Epics of the user-stories phase (US-035, UC-040, UF-15, FR-093/FR-094): coverage strip, create, merge, split,
// reorder, delete (stories move to "No epic" after confirmation) and *Approve epic structure*.
import { Callout, Dialog } from '../components/index.js';
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';

type EpicList = QueryOutput<'epics.list'>;
type Epic = EpicList['epics'][number];

export interface EpicsPanelProps {
  session: CoreSession;
  projectId: string;
  /** Open an epic file in the editor. */
  onOpen(path: string): void;
  /** Files changed (reload the artifact list). */
  onChanged(): void;
  /** Reloads the epics when it changes (e.g. after generated epics were kept). */
  refreshKey?: unknown;
}

function EpicRow({
  epic,
  others,
  first,
  last,
  onOpen,
  onMove,
  onMerge,
  onSplit,
  onDelete,
}: {
  epic: Epic;
  others: Epic[];
  first: boolean;
  last: boolean;
  onOpen(): void;
  onMove(delta: -1 | 1): void;
  onMerge(targetId: string): void;
  onSplit(storyIds: string[], title: string): void;
  onDelete(): void;
}) {
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [splitting, setSplitting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const count = epic.stories.length;
  return (
    <li className="epic-row">
      <strong>
        {epic.id} {epic.title}
      </strong>{' '}
      <span className={epic.approval === 'approved' ? 'badge' : 'badge badge-warning'}>
        {epic.approval === 'approved' ? 'Approved' : 'Draft'} · {count === 1 ? '1 story' : `${count} stories`}
      </span>{' '}
      <button className="btn btn-secondary" type="button" aria-label={`Open ${epic.id}`} onClick={onOpen}>
        Open
      </button>
      <button className="btn btn-secondary" type="button" aria-label={`Move ${epic.id} up`} disabled={first} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button className="btn btn-secondary" type="button" aria-label={`Move ${epic.id} down`} disabled={last} onClick={() => onMove(1)}>
        ↓
      </button>
      {others.length > 0 && (
        <span>
          <select className="select" aria-label={`Merge ${epic.id} into`} value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" type="button" disabled={!target} onClick={() => onMerge(target)}>
            Merge
          </button>
        </span>
      )}
      {count > 1 && !splitting && (
        <button className="btn btn-secondary" type="button" aria-label={`Split ${epic.id}…`} onClick={() => setSplitting(true)}>
          Split…
        </button>
      )}
      <button className="btn btn-secondary" type="button" aria-label={`Delete ${epic.id}`} onClick={onDelete}>
        Delete
      </button>
      {splitting && (
        <fieldset>
          <legend>Stories for the new epic</legend>
          {epic.stories.map((s) => (
            <label key={s}>
              <input
                className="checkbox"
                type="checkbox"
                checked={chosen.includes(s)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))}
              />
              {s}
            </label>
          ))}
          <input className="input" aria-label="Title of the new epic" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={chosen.length === 0 || !title.trim()}
            onClick={() => onSplit(chosen, title)}
          >
            Split
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setSplitting(false)}>
            Cancel
          </button>
        </fieldset>
      )}
    </li>
  );
}

export function EpicsPanel({ session, projectId, onOpen, onChanged, refreshKey }: EpicsPanelProps) {
  const [list, setList] = useState<EpicList | null>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<Epic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList(await session.client().query('epics.list', { projectId }));
  }, [session, projectId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load, refreshKey]);

  /** Runs an epic operation, then reloads the epics and the artifacts. */
  const change = (operation: () => Promise<unknown>) =>
    void operation()
      .then(async () => {
        setError(null);
        await load();
        onChanged();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  const client = session.client();
  const epics = list?.epics ?? [];
  return (
    <section aria-label="Epics" className="epics-panel">
      <h2>Epics</h2>
      {error && <p role="alert">{error}</p>}
      {list && list.uncovered.length > 0 && (
        <Callout tone="warning" role="status">
          Must-have requirements without an epic: {list.uncovered.join(', ')}
        </Callout>
      )}
      <ul aria-label="Epic list">
        {epics.map((epic, i) => (
          <EpicRow
            key={epic.id}
            epic={epic}
            others={epics.filter((e) => e.id !== epic.id)}
            first={i === 0}
            last={i === epics.length - 1}
            onOpen={() => onOpen(epic.path)}
            onMove={(delta) => {
              const ids = epics.map((e) => e.id);
              [ids[i], ids[i + delta]] = [ids[i + delta]!, ids[i]!];
              change(() => client.command('epics.reorder', { projectId, epicIds: ids }));
            }}
            onMerge={(targetId) => change(() => client.command('epics.merge', { projectId, sourceId: epic.id, targetId }))}
            onSplit={(storyIds, newTitle) =>
              change(() => client.command('epics.split', { projectId, epicId: epic.id, storyIds, title: newTitle }))
            }
            onDelete={() => setDeleting(epic)}
          />
        ))}
      </ul>
      <label>
        <span className="visually-hidden">New epic title</span>
        <input
          className="input"
          aria-label="New epic title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New epic title"
        />
      </label>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!title.trim()}
        onClick={() =>
          change(async () => {
            await client.command('epics.create', { projectId, title });
            setTitle('');
          })
        }
      >
        Create epic
      </button>
      {epics.some((e) => e.approval === 'draft') && (
        <button className="btn btn-secondary" type="button" onClick={() => change(() => client.command('epics.approveAll', { projectId }))}>
          Approve epic structure
        </button>
      )}
      {deleting && (
        <Dialog role="alertdialog" tone="danger" title={<>Delete {deleting.id}?</>} onClose={() => setDeleting(null)}>
          <p>{deleting.stories.length > 0 ? `${deleting.stories.join(', ')} move to No epic.` : 'The epic has no stories.'}</p>
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                const epicId = deleting.id;
                setDeleting(null);
                change(() => client.command('epics.delete', { projectId, epicId }));
              }}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
