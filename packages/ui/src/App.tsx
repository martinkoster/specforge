// SPDX-License-Identifier: Apache-2.0
// Renderer root: connects the shell and its areas to the core session (US-017, US-018, US-019, US-022).
import { Callout, PageHeader, Skeleton } from './components/index.js';
import { specLayout } from '@specforge/domain';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CommandOutput } from '@specforge/ipc-contract';
import { KanbanArea } from './board/KanbanArea.js';
import { ExecutionsArea } from './executions/ExecutionsArea.js';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession, CoreStatus } from './core/core-session.js';
import { type ImpactFlags, PendingDecisionsPanel, type PendingGroups } from './pending/PendingDecisionsPanel.js';
import { Toasts, type Toast } from './pending/Toasts.js';
import { CloseGuard, type CloseBridge } from './shell/CloseGuard.js';
import { DashboardArea } from './dashboard/DashboardArea.js';
import { IntentArea } from './intent/IntentArea.js';
import { CommitSpecDialog } from './shell/CommitSpecDialog.js';
import { PhaseStepper, type PhaseStatus } from './shell/PhaseStepper.js';
import { ComponentGallery } from './components/ComponentGallery.js';
import { FeaturePage } from './features/FeaturePage.js';
import { BaselineDialog } from './features/BaselineDialog.js';
import { CaptureIdeaDialog, type IdeaSource } from './features/CaptureIdeaDialog.js';
import { FeatureWizard } from './features/FeatureWizard.js';
import { AdoptProjectDialog, type AdoptFolder } from './projects/AdoptProjectDialog.js';
import { ADOPT_HINT, CreateProjectDialog } from './projects/CreateProjectDialog.js';
import { StartWizard, type RecentProject } from './projects/StartWizard.js';
import type { ThemeBridge } from './settings/AppearanceSettings.js';
import { SettingsArea } from './settings/SettingsArea.js';
import { SetupWizard } from './setup/SetupWizard.js';
import { AppShell, AREAS, type Area, type ShellState } from './shell/AppShell.js';
import { SpecificationsArea } from './specs/SpecificationsArea.js';
import { SpecLayoutContext } from './specs/spec-layout-context.js';

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
      <button className="btn btn-secondary" type="button" data-testid="ping" onClick={() => void ping()}>
        Ping core
      </button>
      <button
        className="btn btn-secondary"
        type="button"
        data-testid="crash"
        onClick={() => void session.client().command('system.crash', {})}
      >
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
  /** Colour theme preference held by the main process (US-077). */
  theme?: ThemeBridge;
}

type Capabilities = QueryOutput<'capabilities.get'>;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function App({ session, testMode, pickFolder, notify, isFocused = () => document.hasFocus(), closeBridge, theme }: AppProps) {
  const [status, setStatus] = useState<CoreStatus>(session.currentStatus);
  const [state, setState] = useState<ShellState>(EMPTY_STATE);
  const [active, setActive] = useState<Area>('dashboard');
  const [recent, setRecent] = useState<RecentProject[]>([]);
  /** US-068: folder picked for a new project (create dialog open) and an empty folder offered by "Open existing project". */
  const [createFolder, setCreateFolder] = useState<string | null>(null);
  const [emptyFolder, setEmptyFolder] = useState<string | null>(null);
  // US-079: a folder with existing code — offered for adoption, or shown in the adopt dialog.
  const [codeFolder, setCodeFolder] = useState<AdoptFolder | null>(null);
  const [adoptFolder, setAdoptFolder] = useState<AdoptFolder | null>(null);
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
  /** US-086: potentially impacted flags, shown with the pending decisions. */
  const [impacts, setImpacts] = useState<ImpactFlags>([]);
  const [specChanges, setSpecChanges] = useState(0);
  /** US-033: phase stepper of the open project and the phase chosen in it. */
  const [phases, setPhases] = useState<PhaseStatus | null>(null);
  const [specPhase, setSpecPhase] = useState<'requirements' | 'design' | 'stories' | null>(null);
  /** US-061: navigation targets from the dashboard. */
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);
  const [boardEpic, setBoardEpic] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  /** US-082: the feature wizard (new feature or a stored draft) and the last saved feature intent. */
  const [wizard, setWizard] = useState<{
    resumeId: string | null;
    idea?: { id: string; text: string; note: string | null };
    /** US-100: the chat agent's summary. */
    text?: string;
  } | null>(null);
  /** US-095: the open *Capture idea* popover and where it was opened from. */
  const [capture, setCapture] = useState<{ source: IdeaSource; text?: string } | null>(null);
  /** US-096: the *Create spec baseline* dialog. */
  const [baselineOpen, setBaselineOpen] = useState(false);
  /** US-084: the open feature page (shown instead of the area content). */
  const [featureView, setFeatureView] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingGroups>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  /** US-070 AC-5: test-only component gallery (`#gallery`). */
  const [gallery, setGallery] = useState(() => testMode && window.location.hash === '#gallery');

  useEffect(() => session.onStatus(setStatus), [session]);
  useEffect(() => {
    if (!testMode) return;
    const onHash = () => setGallery(window.location.hash === '#gallery');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [testMode]);
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
    setImpacts(
      await session
        .client()
        .query('impact.flags', { projectId })
        .catch(() => []),
    );
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
        alert(text, e.outcome === 'completed' ? 'success' : e.outcome === 'cancelled' ? 'info' : 'danger', e.notify);
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
    setCreateFolder(null);
    setEmptyFolder(null);
    setCodeFolder(null);
    setAdoptFolder(null);
    setActive(area);
    await refresh();
  };

  const guarded = (fn: () => Promise<void>) => () => {
    void fn().catch((e: unknown) => setError(message(e)));
  };

  const inspectFolder = (path: string) => session.client().query('projects.inspectFolder', { path });
  const inspect = async (path: string) => (await inspectFolder(path)).kind;
  const asCodeFolder = (path: string, inspection: Awaited<ReturnType<typeof inspectFolder>>): AdoptFolder => ({
    path,
    git: inspection.git ?? 'none',
    suggestedSpecRoot: inspection.suggestedSpecRoot ?? 'spec',
  });

  const openExisting = guarded(async () => {
    const path = await pickFolder!('Open a SpecForge project');
    if (!path) return;
    setEmptyFolder(null);
    setCodeFolder(null);
    const inspection = await inspectFolder(path);
    // US-068 AC-4: an empty folder can become a new project right here.
    if (inspection.kind === 'empty') {
      setError(undefined);
      setEmptyFolder(path);
      return;
    }
    // US-079 AC-1: a folder with other content can be adopted.
    if (inspection.kind === 'notEmpty') {
      setError(undefined);
      setCodeFolder(asCodeFolder(path, inspection));
      return;
    }
    await opened(() => session.client().command('projects.open', { path }), 'dashboard');
  });

  const showAdoptDialog = async (folder: AdoptFolder): Promise<void> => {
    setGitAvailable((await session.client().query('projects.gitAvailable', {})).available);
    setError(undefined);
    setCodeFolder(null);
    setAdoptFolder(folder);
  };

  /** US-079: picks a folder with existing code; a SpecForge project is opened, an empty folder goes to the create dialog. */
  const pickAdoptFolder = async (): Promise<AdoptFolder | null> => {
    const path = await pickFolder!('Choose the folder with your existing code');
    if (!path) return null;
    const inspection = await inspectFolder(path);
    if (inspection.kind === 'project') {
      await opened(() => session.client().command('projects.open', { path }), 'dashboard');
      return null;
    }
    if (inspection.kind === 'empty') {
      setAdoptFolder(null);
      await showCreateDialog(path);
      return null;
    }
    return asCodeFolder(path, inspection);
  };

  const startAdopt = guarded(async () => {
    setEmptyFolder(null);
    setCodeFolder(null);
    const folder = await pickAdoptFolder();
    if (folder) await showAdoptDialog(folder);
  });

  const checkSpecRoot = useCallback(
    async (path: string, specRoot: string): Promise<string | null> =>
      (await session.client().query('projects.checkSpecRoot', { path, specRoot })).problem,
    [session],
  );

  /** US-068 AC-3: picks the folder for a new project; a SpecForge project is opened instead, a non-empty folder is rejected. */
  const pickCreateFolder = async (): Promise<string | null> => {
    const path = await pickFolder!('Choose or create an empty folder for the new project');
    if (!path) return null;
    const kind = await inspect(path);
    if (kind === 'project') {
      await opened(() => session.client().command('projects.open', { path }), 'dashboard');
      return null;
    }
    if (kind === 'notEmpty') throw new Error(`${path} is not empty. ${ADOPT_HINT}`);
    return path;
  };

  const showCreateDialog = async (folder: string): Promise<void> => {
    setGitAvailable((await session.client().query('projects.gitAvailable', {})).available);
    setError(undefined);
    setEmptyFolder(null);
    setCodeFolder(null);
    setCreateFolder(folder);
  };

  const startCreate = guarded(async () => {
    setEmptyFolder(null);
    const folder = await pickCreateFolder();
    if (folder) await showCreateDialog(folder);
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

  const navigate = useCallback((area: Area) => {
    setFeatureView(null);
    setActive(area);
  }, []);
  /** Opens an artifact from the dashboard or a trace (US-061, US-034). */
  const layout = useMemo(() => specLayout(state.specRoot ?? undefined), [state.specRoot]);
  const openArtifactPath = useCallback(
    (path: string) => {
      setSpecPhase(null);
      setOpenArtifact(path);
      // Feature intents (FI-xxx) open in the Specifications area; the Intent area shows the main intent.
      setActive(layout.phaseOf(path) === 'intent' && !/\/FI-\d+[^/]*\.md$/.test(path) ? 'intent' : 'specifications');
    },
    [layout],
  );
  const intentApproved = phases?.phases.some((p) => p.phase === 'intent' && (p.state === 'approved' || p.state === 'impacted')) ?? false;
  const openProjectId = state.currentProjectId;
  // US-082 AC-1: Ctrl/Cmd+Shift+F opens the feature wizard from any screen of an open project.
  useEffect(() => {
    if (openProjectId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setWizard((w) => w ?? { resumeId: null });
      }
      // US-095 AC-1: Ctrl/Cmd+Shift+I captures an idea from any screen.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setCapture((c) => c ?? { source: 'shortcut' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openProjectId]);
  const label = AREAS.find((a) => a.id === active)?.label;

  if (gallery) return <ComponentGallery />;

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
    content = <Skeleton label="Loading" lines={4} />;
  } else if (active === 'settings') {
    content = (
      <SettingsArea
        session={session}
        projectId={state.currentProjectId}
        onOpenSetup={() => setShowSetup(true)}
        {...(theme ? { theme } : {})}
      />
    );
  } else if (state.currentProjectId === null) {
    content = (
      <StartWizard
        recent={recent}
        {...(pickFolder ? { onOpenExisting: openExisting, onAdoptExisting: startAdopt, onLocate: locate } : {})}
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
        intentApproved={intentApproved}
        onAddFeature={(resumeId) => setWizard({ resumeId })}
        onCaptureIdea={() => setCapture({ source: 'menu' })}
        onCreateFeatureFromChat={(text) => setWizard({ resumeId: null, text })}
        onSaveChatAsIdea={(text) => setCapture({ source: 'chat', text })}
        onCreateBaseline={() => setBaselineOpen(true)}
        onTurnIdeaIntoFeature={(idea) => setWizard({ resumeId: null, idea: { id: idea.id, text: idea.text, note: idea.note } })}
        onOpenFeature={setFeatureView}
        onEditSpecs={() => {
          setSpecPhase(null);
          setActive('specifications');
        }}
        onNextStep={(target) => {
          if (target.area === 'setup') setShowSetup(true);
          else if (target.area === 'pending') {
            setPendingOpen(true);
            void loadPending().catch(() => undefined);
          } else if (target.area === 'specifications') {
            setSpecPhase((target.generate as 'requirements' | 'design' | 'stories' | undefined) ?? null);
            setActive('specifications');
          } else if (target.area === 'feature' && target.featureId) setFeatureView(target.featureId);
          else if (target.area === 'intent' || target.area === 'kanban') setActive(target.area);
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
    content = (
      <IntentArea
        session={session}
        projectId={state.currentProjectId}
        aiDisabledReason={aiDisabledReason}
        onAddFeature={() => setWizard({ resumeId: null })}
      />
    );
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
    content = <PageHeader title={label} />;
  }
  if (featureView !== null && state.currentProjectId !== null) {
    content = (
      <FeaturePage
        session={session}
        projectId={state.currentProjectId}
        featureId={featureView}
        refreshKey={state}
        aiDisabledReason={aiDisabledReason}
        onBack={() => setFeatureView(null)}
        onOpenKanban={() => navigate('kanban')}
        onCreateBaseline={() => setBaselineOpen(true)}
        onOpenArtifact={(path) => {
          setFeatureView(null);
          openArtifactPath(path);
        }}
      />
    );
  }

  const banners =
    (warning && state.currentProjectId !== null) || (capabilities && !capabilities.aiAvailable) ? (
      <>
        {warning && state.currentProjectId !== null && (
          <Callout tone="warning" role="status" className="banner-callout">
            {warning}
          </Callout>
        )}
        {capabilities && !capabilities.aiAvailable && (
          <Callout
            tone="warning"
            role="region"
            label="AI functions disabled"
            className="banner-callout"
            title="AI functions disabled — complete setup"
            action={{
              label: 'Complete setup',
              onClick: () => {
                setSetupAtFirstIncomplete(true);
                setShowSetup(true);
              },
            }}
          >
            {capabilities.missing}
          </Callout>
        )}
      </>
    ) : undefined;

  return (
    <SpecLayoutContext.Provider value={layout}>
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
        banners={banners}
      >
        {error && <p role="alert">{error}</p>}
        {emptyFolder !== null && state.currentProjectId === null && (
          <Callout
            tone="info"
            role="region"
            label="Empty folder"
            action={{ label: 'Create new project here', onClick: guarded(() => showCreateDialog(emptyFolder)) }}
          >
            {emptyFolder} is empty — it has no SpecForge project yet.
          </Callout>
        )}
        {codeFolder !== null && state.currentProjectId === null && (
          <Callout
            tone="info"
            role="region"
            label="Folder with existing code"
            action={{ label: 'Adopt this folder', onClick: guarded(() => showAdoptDialog(codeFolder)) }}
          >
            {codeFolder.path} has no SpecForge metadata. Adopt it to bring its code under SpecForge, or choose another folder.
          </Callout>
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
        {createFolder !== null && pickFolder && (
          <CreateProjectDialog
            key={createFolder}
            folder={createFolder}
            gitAvailable={gitAvailable}
            onChangeFolder={pickCreateFolder}
            onCreate={(input) => opened(() => session.client().command('projects.create', input), 'intent')}
            onCancel={() => setCreateFolder(null)}
          />
        )}
        {adoptFolder !== null && pickFolder && (
          <AdoptProjectDialog
            key={adoptFolder.path}
            folder={adoptFolder}
            gitAvailable={gitAvailable}
            aiDisabledReason={aiDisabledReason}
            checkSpecRoot={checkSpecRoot}
            onChangeFolder={pickAdoptFolder}
            onAdopt={async (input, { analyze }) => {
              const project = await session.client().command('projects.adopt', input);
              // US-080: the analysis starts right away; the Intent screen shows its progress and review.
              if (analyze) {
                const started = await session.client().command('specs.analyze', { projectId: project.id });
                if (!started.ok) setError(started.reason);
              }
              await opened(async () => project, 'intent');
            }}
            onCancel={() => setAdoptFolder(null)}
          />
        )}
        {baselineOpen && state.currentProjectId !== null && (
          <BaselineDialog
            session={session}
            projectId={state.currentProjectId}
            onClose={() => setBaselineOpen(false)}
            onCreated={() => {
              setBaselineOpen(false);
              void refresh();
            }}
            onCommitSpecChanges={() => {
              setBaselineOpen(false);
              setCommitting(true);
            }}
          />
        )}
        {capture && state.currentProjectId !== null && (
          <CaptureIdeaDialog
            session={session}
            projectId={state.currentProjectId}
            source={capture.source}
            {...(capture.text ? { initialText: capture.text } : {})}
            onClose={() => {
              setCapture(null);
              void refresh();
            }}
          />
        )}
        {wizard && state.currentProjectId !== null && (
          <FeatureWizard
            key={wizard.resumeId ?? wizard.idea?.id ?? 'new'}
            session={session}
            projectId={state.currentProjectId}
            resumeId={wizard.resumeId}
            {...(wizard.idea ? { idea: wizard.idea } : {})}
            {...(wizard.text ? { initialText: wizard.text } : {})}
            aiDisabledReason={aiDisabledReason}
            onView={(ref) => {
              const projectId = state.currentProjectId!;
              void session
                .client()
                .query('trace.get', { projectId, target: { kind: 'element', id: ref } })
                .then((t) => t.node.path && openArtifactPath(t.node.path))
                .catch(() => undefined);
            }}
            onMerged={(path) => {
              setWizard(null);
              openArtifactPath(path);
            }}
            onSaved={() => void refresh().catch(() => undefined)}
            onClose={() => {
              setWizard(null);
              void refresh().catch(() => undefined);
            }}
            onContinue={(featureId) => {
              // US-084: the feature page (its Impact tab follows with US-085).
              setWizard(null);
              setFeatureView(featureId);
            }}
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
            impacts={impacts}
            onClearImpact={async (elementId) => {
              await session.client().command('impact.clear', { projectId: state.currentProjectId!, elementId });
              await loadPending();
              await refresh();
            }}
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
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        {status === 'failed' && session.lastError && <p role="alert">{session.lastError}</p>}
        {testMode && <Diagnostics session={session} />}
      </AppShell>
    </SpecLayoutContext.Provider>
  );
}
