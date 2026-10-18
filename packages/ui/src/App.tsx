// SPDX-License-Identifier: Apache-2.0
// Renderer root: connects the shell and its areas to the core session (US-017, US-018, US-019, US-022).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import { KanbanArea } from './board/KanbanArea.js';
import { ExecutionsArea } from './executions/ExecutionsArea.js';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession, CoreStatus } from './core/core-session.js';
import { PendingDecisionsPanel, type PendingGroups } from './pending/PendingDecisionsPanel.js';
import { Toasts, type Toast } from './pending/Toasts.js';
import { CloseGuard, type CloseBridge } from './shell/CloseGuard.js';
import { DashboardArea } from './dashboard/DashboardArea.js';
import { IntentArea } from './intent/IntentArea.js';
import { CommitSpecDialog } from './shell/CommitSpecDialog.js';
import { PhaseStepper, type PhaseStatus } from './shell/PhaseStepper.js';
import { CreateProjectDialog } from './projects/CreateProjectDialog.js';
import { StartWizard, type RecentProject } from './projects/StartWizard.js';
import { SettingsArea } from './settings/SettingsArea.js';
import { SetupWizard } from './setup/SetupWizard.js';
import { AppShell, AREAS, type Area, type ShellState } from './shell/AppShell.js';
import { SpecificationsArea } from './specs/SpecificationsArea.js';

const EMPTY_STATE: ShellState = {
  projects: [],
  currentProjectId: null,
  vcs: null,
  runs: { running: 0, queued: 0 },
  pendingDecisions: 0,
  storyCount: 0,
};

type OpenedProject = CommandOutput<'projects.open'>;

/** Test-mode controls used by the end-to-end tests (US-005). */
function Diagnostics({ session }: { session: CoreSession }) {
  const [pong, setPong] = useState('');
  const [count, setCount] = useState(0);
  const ping = async (): Promise<void> => {
    try {
      const result = await session.ping();
      // The counter makes every answer a new text (the e2e test clears the output between pings).
      setCount((n) => n + 1);
      setPong(`pong from pid ${result.pid} #${count + 1}`);
    } catch (e) {
      setPong(`error: ${(e as Error).message}`);
    }
  };
  return (
    <section aria-label="Diagnostics">
      <button type="button" data-testid="ping" onClick={() => void ping()}>
        Ping core
      </button>
      <button type="button" data-testid="crash" onClick={() => void session.client().command('system.crash', {})}>
        Crash core
      </button>
      <output data-testid="pong">{pong}</output>
    </section>
  );
}

export interface AppProps {
  session: CoreSession;
  testMode: boolean;
  /** Native folder picker (main process); absent outside Electron. */
  pickFolder?(title: string): Promise<string | null>;
  /** OS notification (main process); used when the window is not focused (US-053 AC-3). */
  notify?(title: string, body: string): void;
  isFocused?(): boolean;
  /** Window close handshake with the main process (US-049). */
  closeBridge?: CloseBridge;
}

type Capabilities = QueryOutput<'capabilities.get'>;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function App({ session, testMode, pickFolder, notify, isFocused = () => document.hasFocus(), closeBridge }: AppProps) {
  const [status, setStatus] = useState<CoreStatus>(session.currentStatus);
  const [state, setState] = useState<ShellState>(EMPTY_STATE);
  const [active, setActive] = useState<Area>('dashboard');
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [gitAvailable, setGitAvailable] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  /** UC-028: the setup wizard opens while setup has not been done (or when the user runs it again). */
  const [showSetup, setShowSetup] = useState(false);
  const [setupAtFirstIncomplete, setSetupAtFirstIncomplete] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  /** US-013: AI actions are disabled while capabilities are missing (unknown = not restricted). */
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [specChanges, setSpecChanges] = useState(0);
  /** US-033: phase stepper of the open project and the phase chosen in it. */
  const [phases, setPhases] = useState<PhaseStatus | null>(null);
  const [specPhase, setSpecPhase] = useState<'requirements' | 'design' | 'stories' | null>(null);
  /** US-061: navigation targets from the dashboard. */
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);
  const [boardEpic, setBoardEpic] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [pending, setPending] = useState<PendingGroups>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);

  useEffect(() => session.onStatus(setStatus), [session]);
  useEffect(() => {
    if (status !== 'connected') return;
    session
      .client()
      .query('setup.state', {})
      .then(
        (setup) => setShowSetup(setup.setupState === 'not_started'),
        // A core without setup support must not block the app.
        () => setShowSetup(false),
      )
      .finally(() => setSetupChecked(true));
    const client = session.client();
    client.query('capabilities.get', {}).then(setCapabilities, () => setCapabilities(null));
    return client.subscribe('capabilities.changed', setCapabilities);
  }, [session, status]);
  const aiDisabledReason =
    capabilities && !capabilities.aiAvailable
      ? `AI functions are disabled: ${capabilities.missing} Complete the setup to enable them.`
      : null;

  const refresh = useCallback(async (): Promise<void> => {
    const next = await session.client().query('shell.state', {});
    setState(next);
    setPhases(
      next.currentProjectId !== null
        ? await session
            .client()
            .query('phases.status', { projectId: next.currentProjectId })
            .catch(() => null)
        : null,
    );
    // US-023 AC-1: uncommitted spec files (git mode only; a core without the query shows none).
    setSpecChanges(
      next.currentProjectId !== null && next.vcs?.mode === 'git'
        ? await session
            .client()
            .query('specCommit.status', { projectId: next.currentProjectId })
            .then(
              (s) => s.files.length,
              () => 0,
            )
        : 0,
    );
    if (next.currentProjectId === null) {
      // An unavailable registry shows an empty list.
      setRecent(
        await session
          .client()
          .query('projects.recent', {})
          .catch(() => []),
      );
    }
  }, [session]);

  useEffect(() => {
    if (status === 'connected') void refresh().catch(() => undefined);
  }, [status, refresh]);

  const projectId = state.currentProjectId;
  const gitMode = state.vcs?.mode === 'git';
  // US-024 AC-2: merged branches are detected within seconds of returning to the window.
  useEffect(() => {
    if (!projectId || !gitMode || status !== 'connected') return;
    const onFocus = () =>
      void session
        .client()
        .command('merge.check', { projectId })
        .catch(() => undefined);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session, status, projectId, gitMode]);
  const loadPending = useCallback(async (): Promise<void> => {
    if (!projectId) return setPending([]);
    setPending(await session.client().query('pending.list', { projectId }));
  }, [session, projectId]);

  // US-053 AC-3: in-app toasts; an OS notification when the window is not focused and notifications are enabled.
  const alert = useCallback(
    (text: string, tone: Toast['tone'], wantsNotification: boolean) => {
      const id = nextToast.current++;
      setToasts((ts) => [...ts, { id, text, tone }].slice(-5));
      if (wantsNotification && !isFocused()) notify?.('SpecForge', text);
    },
    [isFocused, notify],
  );

  useEffect(() => {
    if (status !== 'connected') return;
    const client = session.client();
    const off = [
      client.subscribe('pending.changed', () => {
        void refresh().catch(() => undefined);
        void loadPending().catch(() => undefined);
      }),
      // US-060 AC-3: the shell state (incl. the next step) is re-read when the project state changes.
      client.subscribe('project.changed', () => void refresh().catch(() => undefined)),
      client.subscribe('spec.reviewReady', () => void refresh().catch(() => undefined)),
      client.subscribe('capabilities.changed', () => void refresh().catch(() => undefined)),
      client.subscribe('run.finished', (e) => {
        void refresh().catch(() => undefined);
        const text = e.outcome === 'completed' ? `${e.storyId}: run completed — ready for review` : `${e.storyId}: run ${e.outcome}`;
        alert(text, e.outcome === 'completed' ? 'info' : 'warning', e.notify);
      }),
      client.subscribe('permission.requested', (e) =>
        alert(`${e.storyId ?? 'A specification run'} asks to use ${e.toolName}`, 'warning', e.notify),
      ),
    ];
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [session, status, refresh, loadPending, alert]);

  const opened = async (open: () => Promise<OpenedProject>, area: Area): Promise<void> => {
    const project = await open();
    setWarning(project.isolationWarning);
    setError(undefined);
    setCreating(false);
    setActive(area);
    await refresh();
  };

  const guarded = (fn: () => Promise<void>) => () => {
    void fn().catch((e: unknown) => setError(message(e)));
  };

  const openExisting = guarded(async () => {
    const path = await pickFolder!('Open a SpecForge project');
    if (path) await opened(() => session.client().command('projects.open', { path }), 'dashboard');
  });

  const startCreate = guarded(async () => {
    setGitAvailable((await session.client().query('projects.gitAvailable', {})).available);
    setCreating(true);
  });

  const openById = (projectId: string): void =>
    guarded(() => opened(() => session.client().command('projects.openById', { projectId }), 'dashboard'))();

  const locate = (projectId: string): void =>
    guarded(async () => {
      const path = await pickFolder!('Locate the project folder');
      if (!path) return;
      await session.client().command('projects.locate', { projectId, path });
      await refresh();
    })();

  const closeProject = guarded(async () => {
    await session.client().command('projects.close', {});
    setWarning(null);
    setActive('dashboard');
    await refresh();
  });

  const navigate = useCallback((area: Area) => setActive(area), []);
  /** Opens an artifact from the dashboard or a trace (US-061, US-034). */
  const openArtifactPath = useCallback((path: string) => {
    setSpecPhase(null);
    setOpenArtifact(path);
    setActive(path.startsWith('spec/01_intent/') ? 'intent' : 'specifications');
  }, []);
  const label = AREAS.find((a) => a.id === active)?.label;

  if (showSetup && status === 'connected') {
    return (
      <SetupWizard
        session={session}
        startAtFirstIncomplete={setupAtFirstIncomplete}
        onDone={() => {
          setShowSetup(false);
          setSetupAtFirstIncomplete(false);
          void session
            .client()
            .command('capabilities.refresh', {})
            .then(setCapabilities, () => undefined);
          setActive('dashboard');
          void refresh().catch(() => undefined);
        }}
      />
    );
  }

  let content: ReactNode;
  if (!setupChecked) {
    // Neither the start wizard nor the setup wizard before the setup state is known.
    content = <p>Loading…</p>;
  } else if (active === 'settings') {
    content = <SettingsArea session={session} projectId={state.currentProjectId} onOpenSetup={() => setShowSetup(true)} />;
  } else if (state.currentProjectId === null) {
    content = (
      <StartWizard
        recent={recent}
        {...(pickFolder ? { onOpenExisting: openExisting, onLocate: locate } : {})}
        onCreateNew={startCreate}
        onOpenRecent={openById}
        onRename={async (projectId, name) => {
          await session.client().command('projects.rename', { projectId, name });
          await refresh();
        }}
        onRemove={async (projectId) => {
          await session.client().command('projects.remove', { projectId });
          await refresh();
        }}
      />
    );
  } else if (active === 'dashboard' && state.currentProjectId !== null) {
    content = (
      <DashboardArea
        session={session}
        projectId={state.currentProjectId}
        nextStep={state.nextStep ?? null}
        phases={phases}
        refreshKey={state}
        aiDisabledReason={aiDisabledReason}
        onNextStep={(target) => {
          if (target.area === 'setup') setShowSetup(true);
          else if (target.area === 'pending') {
            setPendingOpen(true);
            void loadPending().catch(() => undefined);
          } else if (target.area === 'specifications') {
            setSpecPhase((target.generate as 'requirements' | 'design' | 'stories' | undefined) ?? null);
            setActive('specifications');
          } else if (target.area === 'intent' || target.area === 'kanban') setActive(target.area);
        }}
        onOpenArtifact={openArtifactPath}
        onOpenEpic={(epicId) => {
          setBoardEpic(epicId);
          setActive('kanban');
        }}
        onOpenKanban={() => {
          setBoardEpic(null);
          setActive('kanban');
        }}
        onOpenPending={() => {
          setPendingOpen(true);
          void loadPending().catch(() => undefined);
        }}
        onOpenPhase={(phase) => {
          if (phase === 'intent' || phase === 'kanban') setActive(phase);
          else {
            setSpecPhase(phase);
            setActive('specifications');
          }
        }}
      />
    );
  } else if (active === 'intent' && state.currentProjectId !== null) {
    content = <IntentArea session={session} projectId={state.currentProjectId} aiDisabledReason={aiDisabledReason} />;
  } else if (active === 'kanban' && state.currentProjectId !== null) {
    content = (
      <KanbanArea
        session={session}
        projectId={state.currentProjectId}
        aiDisabledReason={aiDisabledReason}
        initialEpicFilter={boardEpic}
        refreshKey={state}
        onChanged={() => void refresh().catch(() => undefined)}
        onOpenArtifact={openArtifactPath}
      />
    );
  } else if (active === 'executions' && state.currentProjectId !== null) {
    content = <ExecutionsArea session={session} projectId={state.currentProjectId} onOpenArtifact={openArtifactPath} />;
  } else if (active === 'specifications' && state.currentProjectId !== null) {
    content = (
      <SpecificationsArea
        session={session}
        projectId={state.currentProjectId}
        aiDisabledReason={aiDisabledReason}
        phase={specPhase}
        initialPath={openArtifact}
      />
    );
  } else {
    content = <h1>{label}</h1>;
  }

  return (
    <AppShell
      state={state}
      coreStatus={status}
      active={active}
      onNavigate={navigate}
      onSwitchProject={openById}
      onOpenPendingDecisions={() => {
        setPendingOpen(true);
        void loadPending().catch(() => undefined);
      }}
      onCloseProject={closeProject}
      specChanges={specChanges}
      onOpenSpecCommit={() => setCommitting(true)}
    >
      {warning && state.currentProjectId !== null && (
        <p role="status" className="banner banner-warning">
          {warning}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {capabilities && !capabilities.aiAvailable && (
        <section aria-label="AI functions disabled" className="banner banner-warning">
          <strong>AI functions disabled — complete setup</strong> <span>{capabilities.missing}</span>{' '}
          <button
            type="button"
            onClick={() => {
              setSetupAtFirstIncomplete(true);
              setShowSetup(true);
            }}
          >
            Complete setup
          </button>
        </section>
      )}
      {phases && state.currentProjectId !== null && (active === 'intent' || active === 'specifications' || active === 'kanban') && (
        <PhaseStepper
          status={phases}
          current={active === 'intent' ? 'intent' : active === 'kanban' ? 'kanban' : specPhase}
          onOpen={(phase) => {
            if (phase === 'intent' || phase === 'kanban') {
              setActive(phase);
            } else {
              setSpecPhase(phase);
              setActive('specifications');
            }
          }}
        />
      )}
      {content}
      {creating && pickFolder && (
        <CreateProjectDialog
          gitAvailable={gitAvailable}
          onPickFolder={() => pickFolder('Choose where to create the project')}
          onCreate={(input) => opened(() => session.client().command('projects.create', input), 'intent')}
          onCancel={() => setCreating(false)}
        />
      )}
      {committing && state.currentProjectId !== null && (
        <CommitSpecDialog
          session={session}
          projectId={state.currentProjectId}
          onDone={() => {
            setCommitting(false);
            void refresh().catch(() => undefined);
          }}
          onCancel={() => setCommitting(false)}
        />
      )}
      {pendingOpen && (
        <PendingDecisionsPanel
          groups={pending}
          onDecide={async (id, decision) => {
            const result = await session.client().command('permission.decide', { id, ...decision });
            await loadPending();
            await refresh();
            return result;
          }}
          onOpenBoard={() => {
            setPendingOpen(false);
            setActive('kanban');
          }}
          onClose={() => setPendingOpen(false)}
        />
      )}
      {closeBridge && <CloseGuard session={session} bridge={closeBridge} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
      {status === 'failed' && session.lastError && <p role="alert">{session.lastError}</p>}
      {testMode && <Diagnostics session={session} />}
    </AppShell>
  );
}
