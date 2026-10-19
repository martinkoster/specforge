// SPDX-License-Identifier: Apache-2.0
// Application shell: primary navigation, top bar with project/VCS/run status, keyboard access (US-022, UC-049).
import { useEffect, type ReactNode } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreStatus } from '../core/core-session.js';

export type ShellState = QueryOutput<'shell.state'>;

export type Area = 'dashboard' | 'projects' | 'intent' | 'specifications' | 'kanban' | 'executions' | 'settings';

export const AREAS: readonly { id: Area; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'intent', label: 'Intent' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'executions', label: 'Executions' },
  { id: 'settings', label: 'Settings' },
];

const KANBAN_DISABLED_REASON = 'No user stories yet — generate or write stories first';

export interface AppShellProps {
  state: ShellState;
  coreStatus: CoreStatus;
  active: Area;
  onNavigate(area: Area): void;
  onSwitchProject(projectId: string): void;
  onOpenPendingDecisions(): void;
  /** Shown while a project is open. */
  onCloseProject?(): void;
  /** Uncommitted spec files (git mode, US-023); the indicator opens the commit dialog. */
  specChanges?: number;
  onOpenSpecCommit?(): void;
  children?: ReactNode;
}

function disabledReason(area: Area, state: ShellState): string | undefined {
  return area === 'kanban' && state.storyCount === 0 ? KANBAN_DISABLED_REASON : undefined;
}

function vcsLabel(vcs: ShellState['vcs']): string | undefined {
  if (!vcs) return undefined;
  if (vcs.mode === 'none') return 'No Git — runs are not isolated';
  return vcs.branch ? `Git · ${vcs.branch}` : 'Git · detached';
}

function runLabel(runs: ShellState['runs']): string {
  if (runs.running === 0 && runs.queued === 0) return 'No active runs';
  return `${runs.running} running · ${runs.queued} queued`;
}

function pendingLabel(count: number): string {
  if (count === 0) return 'No pending decisions';
  return count === 1 ? '1 pending decision' : `${count} pending decisions`;
}

export function AppShell({
  state,
  coreStatus,
  active,
  onNavigate,
  onSwitchProject,
  onOpenPendingDecisions,
  onCloseProject,
  specChanges = 0,
  onOpenSpecCommit,
  children,
}: AppShellProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const area = AREAS[Number(event.key) - 1];
      if (!area || !/^[1-7]$/.test(event.key)) return;
      event.preventDefault();
      if (!disabledReason(area.id, state)) onNavigate(area.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onNavigate]);

  const vcs = vcsLabel(state.vcs);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <label>
          <span className="visually-hidden">Project</span>
          <select aria-label="Project" value={state.currentProjectId ?? ''} onChange={(e) => onSwitchProject(e.target.value)}>
            {state.currentProjectId === null && <option value="">No project open</option>}
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {vcs && <span className={state.vcs?.mode === 'none' ? 'badge badge-warning' : 'badge'}>{vcs}</span>}
        <span className="run-indicator" aria-live="polite">
          {runLabel(state.runs)}
        </span>
        {specChanges > 0 && onOpenSpecCommit && (
          <button type="button" className="spec-changes" onClick={onOpenSpecCommit}>
            {specChanges === 1 ? '1 spec file changed' : `${specChanges} spec files changed`}
          </button>
        )}
        <button type="button" className="pending-decisions" onClick={onOpenPendingDecisions}>
          {pendingLabel(state.pendingDecisions)}
        </button>
        {state.currentProjectId !== null && onCloseProject && (
          <button type="button" onClick={onCloseProject}>
            Close project
          </button>
        )}
        <span className="core-status" data-testid="core-status">
          {coreStatus}
        </span>
      </header>
      <nav aria-label="Primary">
        {AREAS.map((area, index) => {
          const reason = disabledReason(area.id, state);
          return (
            <button
              key={area.id}
              type="button"
              aria-current={area.id === active ? 'page' : undefined}
              aria-keyshortcuts={`Control+${index + 1}`}
              disabled={reason !== undefined}
              title={reason}
              onClick={() => onNavigate(area.id)}
            >
              {area.label}
            </button>
          );
        })}
      </nav>
      <main>{children}</main>
    </div>
  );
}
