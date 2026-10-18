// SPDX-License-Identifier: Apache-2.0
// Kanban area: the open project's board (or dependency graph) from the core; moves, Re-check and dependency edits
// (US-038, US-041, US-043, US-040).
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';
import { DependencyGraph } from './DependencyGraph.js';
import { KanbanBoard, type BoardData } from './KanbanBoard.js';
import { ReviewPanel } from '../review/ReviewPanel.js';
import { RejectedBranches } from '../review/RejectedBranches.js';
import { RunRecoveryDialog } from './RunRecoveryDialog.js';
import { TracePanel, type TraceNode } from '../specs/TracePanel.js';

export interface KanbanAreaProps {
  session: CoreSession;
  projectId: string;
  /** Called after a successful change (shell run indicator, story counts). */
  onChanged(): void;
  /** Why stories cannot be started (US-013), or null. */
  aiDisabledReason?: string | null;
  /** Board filtered to this epic (from the dashboard, US-061). */
  initialEpicFilter?: string | null;
  /** Opens an artifact from the trace of a story (US-034). */
  onOpenArtifact?(path: string): void;
  /** Changes when the shell state is re-read (runs, decisions, transitions): the board is re-read too. */
  refreshKey?: unknown;
}

export function KanbanArea({
  session,
  projectId,
  onChanged,
  aiDisabledReason = null,
  initialEpicFilter = null,
  onOpenArtifact,
  refreshKey,
}: KanbanAreaProps) {
  const [board, setBoard] = useState<BoardData | undefined>();
  const [view, setView] = useState<'board' | 'graph'>('board');
  /** US-039: board by epic (default when epics exist) or flat. */
  const [layout, setLayout] = useState<'epic' | 'flat' | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [recovering, setRecovering] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await session.client().query('board.get', { projectId }));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session, projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /** Runs a change and reloads the board; notifies the shell when it succeeded. */
  const change = async <T extends { ok: boolean }>(run: () => Promise<T>): Promise<T> => {
    const outcome = await run();
    await load();
    if (outcome.ok) onChanged();
    return outcome;
  };

  if (error) return <p role="alert">{error}</p>;
  if (!board) return <p>Loading the board…</p>;
  return (
    <>
      <h1 className="visually-hidden">Kanban</h1>
      <button
        type="button"
        onClick={() =>
          // US-024 AC-1: Refresh re-checks merged branches, then re-reads the board.
          void session
            .client()
            .command('merge.check', { projectId })
            .catch(() => undefined)
            .then(() => load())
        }
      >
        Refresh
      </button>
      {(board.lanes?.length ?? 0) > 0 && view === 'board' && (
        <div role="radiogroup" aria-label="Layout" className="view-toggle">
          <label>
            <input type="radio" name="kanban-layout" checked={(layout ?? 'epic') === 'epic'} onChange={() => setLayout('epic')} />
            By epic
          </label>
          <label>
            <input type="radio" name="kanban-layout" checked={layout === 'flat'} onChange={() => setLayout('flat')} />
            Flat
          </label>
        </div>
      )}
      <div role="radiogroup" aria-label="View" className="view-toggle">
        <label>
          <input type="radio" name="kanban-view" checked={view === 'board'} onChange={() => setView('board')} />
          Board
        </label>
        <label>
          <input type="radio" name="kanban-view" checked={view === 'graph'} onChange={() => setView('graph')} />
          Dependency graph
        </label>
      </div>
      {view === 'graph' ? (
        <DependencyGraph board={board} />
      ) : (
        <KanbanBoard
          board={board}
          layout={layout ?? ((board.lanes?.length ?? 0) > 0 ? 'epic' : 'flat')}
          initialEpicFilter={initialEpicFilter}
          onSetEpic={(storyId, epicId) =>
            change(async () => (await session.client().command('stories.setEpic', { projectId, storyId, epicId }), { ok: true }))
          }
          onReorderLanes={(epicIds) =>
            change(async () => (await session.client().command('epics.reorder', { projectId, epicIds }), { ok: true }))
          }
          aiDisabledReason={aiDisabledReason}
          onRecover={setRecovering}
          renderReview={(storyId) => (
            <ReviewPanel
              key={storyId}
              session={session}
              projectId={projectId}
              storyId={storyId}
              onDecided={() => void load().then(onChanged)}
            />
          )}
          renderDetails={(storyId) => (
            <>
              <RejectedBranches key={`rejected:${storyId}`} session={session} projectId={projectId} storyId={storyId} />
              <TracePanel
                key={`trace:${storyId}`}
                session={session}
                projectId={projectId}
                elements={[]}
                root={{ kind: 'element', id: storyId }}
                onNavigate={(node: TraceNode) => node.path && onOpenArtifact?.(node.path)}
              />
            </>
          )}
          onMove={(storyId, to, beforeStoryId) =>
            change(() => session.client().command('board.move', { projectId, storyId, to, beforeStoryId }))
          }
          onRecheck={(storyId) => change(() => session.client().command('board.recheck', { projectId, storyId }))}
          onAddDependency={(from, d) =>
            change(() =>
              session.client().command('stories.addDependency', {
                projectId,
                from,
                to: d.to,
                type: d.type,
                ...(d.rationale ? { rationale: d.rationale } : {}),
              }),
            )
          }
          onRemoveDependency={(from, d) =>
            change(() => session.client().command('stories.removeDependency', { projectId, from, to: d.to, type: d.type }))
          }
        />
      )}
      {recovering && (
        <RunRecoveryDialog
          session={session}
          projectId={projectId}
          storyId={recovering}
          onDone={() => {
            setRecovering(null);
            void load().then(onChanged);
          }}
          onCancel={() => setRecovering(null)}
        />
      )}
    </>
  );
}
