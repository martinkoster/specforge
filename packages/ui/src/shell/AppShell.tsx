// SPDX-License-Identifier: Apache-2.0
// Application shell: primary navigation, top bar with project/VCS/run status, keyboard access (US-022, UC-049);
// redesigned per ui_design_concept.md §4.1 (US-072): icon sidebar (collapsible), app mark, status badges, bell.
import { Bell, GitBranch, Hexagon, PanelLeftClose, PanelLeftOpen, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AREA_ICONS, Icon } from '../components/icons.js';
import { Tooltip } from '../components/Tooltip.js';
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
  /** Full-width callouts under the top bar (limited mode, non-git warning). */
  banners?: ReactNode;
  children?: ReactNode;
}

const SIDEBAR_KEY = 'specforge.sidebar';
const NARROW = '(max-width: 1279px)';

function storedSidebar(): 'collapsed' | 'expanded' | null {
  try {
    const value = localStorage.getItem(SIDEBAR_KEY);
    return value === 'collapsed' || value === 'expanded' ? value : null;
  } catch {
    return null;
  }
}

const narrowWindow = () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;

/** Collapsed sidebar: the user's choice (remembered locally), otherwise collapsed below 1280 px window width. */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = storedSidebar();
    return stored ? stored === 'collapsed' : narrowWindow();
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW);
    const onChange = () => {
      if (!storedSidebar()) setCollapsed(query.matches);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, current ? 'expanded' : 'collapsed');
      } catch {
        // Per-viewer convenience only.
      }
      return !current;
    });
  }, []);
  return [collapsed, toggle];
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
  banners,
  children,
}: AppShellProps) {
  const [collapsed, toggleSidebar] = useSidebarCollapsed();
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

  const navItem = (area: (typeof AREAS)[number], index: number) => {
    const reason = disabledReason(area.id, state);
    return (
      <button
        className="nav-item"
        key={area.id}
        type="button"
        aria-current={area.id === active ? 'page' : undefined}
        aria-keyshortcuts={`Control+${index + 1}`}
        disabled={reason !== undefined}
        title={reason ?? (collapsed ? area.label : undefined)}
        onClick={() => onNavigate(area.id)}
      >
        <Icon icon={AREA_ICONS[area.id]} size={20} />
        <span className="nav-label">{area.label}</span>
      </button>
    );
  };
  const pending = state.pendingDecisions;

  return (
    <div className="app-shell" data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
      <header className="top-bar">
        <span className="app-mark">
          <Icon icon={Hexagon} size={20} />
          <span>SpecForge</span>
        </span>
        <label className="project-switcher">
          <span className="visually-hidden">Project</span>
          <select
            className="select"
            aria-label="Project"
            value={state.currentProjectId ?? ''}
            onChange={(e) => onSwitchProject(e.target.value)}
          >
            {state.currentProjectId === null && <option value="">No project open</option>}
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {vcs && (
          <span className={state.vcs?.mode === 'none' ? 'badge badge-warning' : 'badge badge-neutral'}>
            <Icon icon={state.vcs?.mode === 'none' ? TriangleAlert : GitBranch} />
            <span>{vcs}</span>
          </span>
        )}
        <span className="run-indicator" aria-live="polite">
          {runLabel(state.runs)}
        </span>
        <div className="top-bar-actions">
          {specChanges > 0 && onOpenSpecCommit && (
            <button type="button" className="btn btn-ghost btn-sm spec-changes" onClick={onOpenSpecCommit}>
              {specChanges === 1 ? '1 spec file changed' : `${specChanges} spec files changed`}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm pending-decisions" onClick={onOpenPendingDecisions}>
            <Icon icon={Bell} />
            {pending > 0 && <span className="pill">{pending}</span>}
            <span className="visually-hidden">{pending > 0 ? ` ${pendingLabel(pending).replace(/^\d+ /, '')}` : pendingLabel(0)}</span>
          </button>
          {state.currentProjectId !== null && onCloseProject && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={onCloseProject}>
              Close project
            </button>
          )}
          <span className="core-status" data-testid="core-status">
            {coreStatus}
          </span>
        </div>
      </header>
      <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>
        <nav aria-label="Primary">
          <div className="nav-main">{AREAS.slice(0, -1).map((area, index) => navItem(area, index))}</div>
          <div className="nav-bottom">{navItem(AREAS[AREAS.length - 1]!, AREAS.length - 1)}</div>
        </nav>
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={toggleSidebar}
          >
            <Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} />
          </button>
        </Tooltip>
      </aside>
      <main>
        {banners && <div className="shell-banners">{banners}</div>}
        {children}
      </main>
    </div>
  );
}
