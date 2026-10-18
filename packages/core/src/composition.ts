// SPDX-License-Identifier: Apache-2.0
// Core composition root: opens the database and wires adapters, application services and IPC handlers (ADR-002, ADR-003).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeCodeAdapter, detectClaudeCode, systemEnvironment, verifyClaudeCode } from '@specforge/agent-claude-code';
import {
  ApprovalService,
  SPEC_TARGET_FOLDERS,
  specCommitMessage,
  SpecRunService,
  ChatService,
  buildDashboard,
  EpicService,
  mustHaveRequirementIds,
  TraceService,
  mergeOrder,
  ClarificationService,
  INTENT_TEMPLATE,
  type ClarificationRecord,
  QualityService,
  MergeDetector,
  type GenerationTarget,
  ArtifactAccessError,
  ArtifactService,
  BoardService,
  ProjectService,
  ProjectRegistryError,
  ProjectSettingsService,
  ExecutionService,
  PermissionBroker,
  alwaysAllowRule,
  pendingCount,
  pendingDecisions,
  SettingsService,
  SetupService,
  WorkspaceIndexer,
  enableSuggestion,
  runConnectionTest,
  suggestRules,
  type AgentAdapter,
  type SecretStore,
} from '@specforge/application';
import { ExecutionSpaceManager, GitClient, GitVcs, SpecCommits } from '@specforge/git';
import { nextStep, orderQueue, phaseStepper, unapprovedInputs, type SpecPhase } from '@specforge/domain';
import { IpcError, type ContractHandlers, type EventName, type EventPayload } from '@specforge/ipc-contract';
import {
  AgentRuntimeRepository,
  ExecutionStore,
  IndexRepository,
  PermissionRequestRepository,
  PermissionRuleRepository,
  ProjectRepository,
  SettingsRepository,
  openDatabase,
} from '@specforge/sqlite';
import { identify, killOrphan, killTree } from '@specforge/process';
import { SnapshotStore } from '@specforge/snapshot';
import { ProjectFolderProbe, WorkspaceFiles } from '@specforge/workspace-fs';
import { createDependencyHandlers } from './handlers/dependency-handlers.js';
import { createProjectHandlers } from './handlers/project-handlers.js';
import { createRuleHandlers } from './handlers/rule-handlers.js';
import { createRuntimeHandlers } from './handlers/runtime-handlers.js';
import { createSystemHandlers } from './handlers/system-handlers.js';
import { ProjectContexts } from './project-context.js';
import { ReviewFiles } from './review.js';
import { ContextPromptBuilder, CoreExecutionSpaces, snapshotRoot, type ProjectWorkspace } from './execution.js';
import { pruneLogs } from './log-retention.js';
import { createScheduler, notifyScheduler } from './scheduling.js';

export interface CoreOptions {
  appDataDir: string;
  platform: string;
  pid: number;
  /** SPECFORGE_TEST=1: enables test-only commands (system.crash). */
  testMode: boolean;
  exit(code: number): void;
  /** Watch the open project's workspace for external edits (default true). */
  watch?: boolean;
  /** Secret storage of the main process (ADR-012); without it, storing secrets fails with an explanation. */
  secrets?: SecretStore;
  /** Agent adapter for runs (tests: MockAdapter, scripted test agent); overrides `claudeCode`. */
  agentAdapter?: AgentAdapter;
  /** Run agents with the user's verified Claude Code installation (US-045, ADR-006); the production setting. */
  claudeCode?: boolean;
  /** Opens a (validated, absolute) file with the OS default application (main process, US-057). */
  openPath?(path: string): Promise<void>;
}

/** Common test/build/Git read commands offered as global rules during setup (no project is open yet). */
const SETUP_COMMANDS = [
  'npm test',
  'pnpm test',
  'pytest',
  'mvn test',
  'gradle test',
  'dotnet test',
  'go test',
  'cargo test',
  'git status',
  'git diff',
  'git log',
];

const NO_SECRET_STORAGE: SecretStore = {
  set: () => Promise.reject(new Error('Secret storage is not available in this process.')),
  get: async () => undefined,
  delete: async () => undefined,
};

export type CoreEventEmitter = <N extends EventName>(name: N, payload: EventPayload<N>) => void;

export interface Core {
  handlers: ContractHandlers;
  /** Connects the event stream of the current UI connection (one per core start). */
  setEmitter(emit: CoreEventEmitter): void;
  close(): Promise<void>;
}

async function mapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProjectRegistryError || e instanceof ArtifactAccessError) throw new IpcError(e.code, e.message);
    throw e;
  }
}

export async function createCore(options: CoreOptions): Promise<Core> {
  const database = openDatabase({ dir: options.appDataDir });
  const projects = new ProjectRepository(database.db);
  const index = new IndexRepository(database.sqlite);
  const folders = new ProjectFolderProbe();
  const contexts = new ProjectContexts({
    index,
    watch: options.watch ?? true,
    onIndexed: (projectId) => projectChanged(projectId),
    onReconcile: (projectId, event) => {
      if (event.type === 'story-added') void epics.storiesAdded(projectId, [event.storyId]).catch(() => undefined);
    },
  });
  const execution = new ExecutionStore(database.sqlite);
  // Runs and system transitions may concern a project that is not open: workspace access by project path.
  const paths = new Map<string, string>();
  const workspaceFiles = (projectId: string): WorkspaceFiles => {
    const current = contexts.current;
    if (current?.projectId === projectId) return current.files;
    const path = paths.get(projectId);
    if (!path) throw new IpcError('NOT_FOUND', `Unknown project ${projectId}.`);
    return new WorkspaceFiles(path);
  };
  const reindexIn = (projectId: string, path: string) => {
    const current = contexts.current;
    if (current?.projectId === projectId) return current.indexer.reindex(projectId, path);
    return new WorkspaceIndexer(workspaceFiles(projectId), index).reindex(projectId, path);
  };
  let emit: CoreEventEmitter | undefined;
  /** The dashboard read model is recomputed on request; this tells the UI to re-read it (US-060 AC-3, NFR-030). */
  const projectChanged = (projectId: string) => {
    if (!closing) emit?.('project.changed', { projectId });
  };
  let closing = false;
  const settingsStore = new SettingsRepository(database.sqlite);
  const settings = new SettingsService(settingsStore, options.secrets ?? NO_SECRET_STORAGE);
  // FR-052: run logs older than the retention period are removed at startup.
  pruneLogs(join(options.appDataDir, 'logs'), settingsStore.execDefaults().logRetentionDays, new Date());
  const vcsModes = new Map<string, 'git' | 'none'>();
  const vcs = new GitVcs();
  const projectSettings = new ProjectSettingsService({
    store: settingsStore,
    projects: {
      get: async (id) => {
        const p = await projects.get(id);
        return p ? { workspacePath: p.workspacePath, vcsMode: p.vcsMode, baseBranch: p.baseBranch } : undefined;
      },
      setBaseBranch: (id, branch) => projects.setBaseBranch(id, branch),
    },
    files: (projectId) => contexts.require(projectId).files,
    branchExists: (path, branch) => vcs.branchExists(path, branch),
    defaultWorktreeRoot: (id) => join(options.appDataDir, 'wt', id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)),
    onLimitChanged: (projectId) => scheduler.post({ type: 'LimitChanged', projectId }),
  });
  const scheduler = createScheduler({
    store: execution,
    index,
    projects,
    vcsMode: (id) => vcsModes.get(id),
    limit: (id) => projectSettings.limit(id, vcsModes.get(id) ?? 'git'),
    configSnapshot: (id) => settings.snapshot(id),
    // The ExecutionService is created below; launches happen only after startup has finished wiring.
    launcher: { launch: (request) => runs.launch(request) },
  });
  const board = new BoardService({
    index,
    files: (projectId) => workspaceFiles(projectId),
    reindex: (projectId, path) => reindexIn(projectId, path),
    now: () => new Date().toISOString(),
    aiDisabledReason: () => setup.aiDisabledReason(),
    epics: (projectId) =>
      index.epics(projectId).map((e) => ({ id: e.id, title: e.title, laneOrder: e.laneOrder, reviewOutcome: e.reviewOutcome })),
    merged: (projectId, storyId) => index.mergedAt(projectId, storyId) !== null,
    onTransition: async (projectId, storyId, command) => {
      projectChanged(projectId);
      // Moving a running story back to Ready cancels its run (US-049 AC-1).
      if (command === 'cancelRun') {
        const active = runs.activeRuns().find((r) => r.projectId === projectId && r.storyId === storyId);
        if (active) await runs.cancel(active.runId);
      }
      return notifyScheduler(scheduler, execution, index, projectId, storyId, command);
    },
    queueOrder: (projectId) => orderQueue(execution.queue(projectId)).map((e) => e.storyId),
    slots: (projectId) => ({
      active: execution.activeImplementationRuns(projectId),
      limit: projectSettings.limit(projectId, vcsModes.get(projectId) ?? 'git'),
    }),
  });
  const artifacts = new ArtifactService({
    index,
    files: (projectId) => contexts.require(projectId).files,
    reindex: (projectId, path) => contexts.require(projectId).indexer.reindex(projectId, path),
  });
  const approvals = new ApprovalService({
    index,
    files: (projectId) => workspaceFiles(projectId),
    reindex: (projectId, path) => reindexIn(projectId, path),
    now: () => new Date().toISOString(),
  });
  let currentProjectId: string | null = null;

  const service = new ProjectService({
    workspace: folders,
    git: vcs,
    store: projects,
    indexer: {
      indexAll: async (id) => {
        const project = await projects.get(id);
        if (!project) throw new IpcError('NOT_FOUND', `Unknown project ${id}.`);
        await contexts.activate(id, project.workspacePath);
      },
    },
    newId: randomUUID,
    join,
  });

  // US-024: merge checks of the open project (open, interval, focus, after SpecForge Git operations).
  let watchMerges: (projectId: string) => void = () => undefined;
  const opened = async <T extends { id: string }>(open: () => Promise<T>): Promise<T> => {
    const project = await mapped(open);
    currentProjectId = project.id;
    const vcs = (project as { vcs?: { mode: 'git' | 'none' } }).vcs;
    if (vcs) vcsModes.set(project.id, vcs.mode);
    const path = (project as { path?: string }).path;
    if (path) paths.set(project.id, path);
    watchMerges(project.id);
    return project;
  };

  // UC-002: SpecForge starts with the last opened project if its folder still exists. It is reopened while the rest
  // of the core starts and the capabilities are checked (NFR-003); the core is ready once both are done.
  const reopening = (async () => {
    const recent = (await projects.list()).filter((p) => p.lastOpenedAt).sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!));
    for (const project of recent.slice(0, 1)) {
      if (await folders.exists(project.workspacePath)) await opened(() => service.openById(project.id)).catch(() => undefined);
    }
  })();

  const rules = new PermissionRuleRepository(database.sqlite);
  const runtimes = new AgentRuntimeRepository(database.sqlite);
  // US-045: the verified Claude Code executable of the user (Settings → Agent runtime, US-010).
  const claudeExecutable = (): string | undefined => {
    const runtime = runtimes.get('claude-code');
    return runtime?.verifiedAt ? runtime.executablePath : undefined;
  };
  const agentAdapter: AgentAdapter | undefined =
    options.agentAdapter ?? (options.claudeCode ? new ClaudeCodeAdapter({ executable: claudeExecutable }) : undefined);
  const git = new GitClient();
  const spaceManager = new ExecutionSpaceManager(git);
  const setup = new SetupService({
    store: settingsStore,
    secrets: options.secrets ?? NO_SECRET_STORAGE,
    runtime: async () => {
      const runtime = runtimes.get('claude-code');
      return runtime?.verifiedAt
        ? { found: true, path: runtime.executablePath, version: runtime.detectedVersion ?? 'unknown' }
        : { found: false };
    },
    gitVersion: async () => {
      try {
        return (await git.version()).join('.');
      } catch {
        return null;
      }
    },
    globalRuleCount: () => rules.globalRules().length,
    agent: async () => {
      if (!agentAdapter) return undefined;
      const requiresProvider = agentAdapter.capabilities().requiresProvider ?? true;
      // Claude Code is available once its executable is verified, not merely found on the PATH.
      if (agentAdapter instanceof ClaudeCodeAdapter)
        return { detect: async () => ({ found: claudeExecutable() !== undefined }), requiresProvider };
      return { detect: () => agentAdapter.detect(), requiresProvider };
    },
    execDefaultsSaved: () => settingsStore.hasExecDefaults(),
    connectionTest: async (env) =>
      agentAdapter
        ? runConnectionTest(agentAdapter, { cwd: options.appDataDir, env })
        : { ok: false, error: 'No agent adapter is available to run the connection test yet.' },
  });
  // US-048: run execution.
  const workspaceOf = async (projectId: string): Promise<ProjectWorkspace> => {
    const project = await projects.get(projectId);
    if (!project) throw new Error(`Unknown project ${projectId}.`);
    return {
      workspacePath: project.workspacePath,
      vcsMode: project.vcsMode,
      baseBranch: project.baseBranch,
      files: workspaceFiles(projectId),
      reindex: (path) => reindexIn(projectId, path),
    };
  };
  const projectSettingsOf = (projectId: string) => {
    const stored = settingsStore.projectSettings(projectId);
    return {
      worktreeRoot: stored?.worktreeRoot ?? join(options.appDataDir, 'wt', projectId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)),
      branchPattern: stored?.branchPattern ?? 'specforge/{storyId}',
      snapshotExclusions: stored?.snapshotExclusions ?? ['node_modules/**', '.venv/**', 'dist/**', 'build/**', 'target/**'],
    };
  };
  const broker = new PermissionBroker({
    store: new PermissionRequestRepository(database.sqlite),
    fileExists: (path) => existsSync(path),
    rules: (projectId) => rules.effective(projectId),
    runs: { setAwaitingPermission: (runId, waiting) => execution.setRunStatus(runId, waiting ? 'awaiting_approval' : 'running') },
    now: () => new Date().toISOString(),
    newId: randomUUID,
    onRequested: (pending) => {
      emit?.('permission.requested', {
        projectId: pending.projectId,
        id: pending.id,
        storyId: execution.run(pending.runId)?.storyId ?? null,
        toolName: pending.toolName,
        notify: settingsStore.execDefaults().notifications,
      });
      emit?.('pending.changed', { projectId: pending.projectId });
    },
  });
  const pendingOf = (projectId: string) =>
    pendingDecisions({
      stories: index.stories(projectId),
      permissions: broker.pending().filter((p) => p.projectId === projectId),
      storyOfRun: (runId) => execution.run(runId)?.storyId ?? null,
      recommendations: execution.openRecommendations(projectId),
    });
  const runEnv = async (projectId: string) => {
    const [provider, agent] = await Promise.all([setup.providerEnv(), settings.resolveEnvWithSecrets(projectId)]);
    return { env: { ...provider.env, ...agent.env }, secrets: [...provider.secrets, ...agent.secrets] };
  };
  const runConfig = (projectId: string) => {
    const snapshot = settings.snapshot(projectId);
    return { maxRunDurationS: snapshot.exec.maxRunDurationS, idleTimeoutS: snapshot.exec.idleTimeoutS, agent: snapshot.agent };
  };
  const runs = new ExecutionService({
    store: execution,
    spaces: new CoreExecutionSpaces({
      workspace: workspaceOf,
      settings: projectSettingsOf,
      index,
      store: execution,
      spaces: spaceManager,
      snapshots: (projectId) => new SnapshotStore(snapshotRoot(options.appDataDir, projectId)),
    }),
    prompts: new ContextPromptBuilder(workspaceOf, index, execution),
    adapter: agentAdapter,
    env: runEnv,
    config: runConfig,
    permissions: broker,
    resumeSession: (request) => {
      // US-059 AC-3: a correction the user started as a fresh run does not resume.
      if (request.startKind === 'correct' && execution.correction(request.projectId, request.storyId)?.fresh) return undefined;
      return request.parentRunId ? (execution.run(request.parentRunId)?.agentSessionId ?? undefined) : undefined;
    },
    processes: { identify, killTree: (pid) => killTree(pid) },
    implementationActive: (projectId) => execution.activeImplementationRuns(projectId) > 0,
    transitions: {
      completed: async (projectId, storyId) => {
        const result = await board.system(projectId, storyId, 'completeRun');
        if (!result.ok) throw new Error(result.reason);
      },
    },
    onFinished: (request, outcome) => {
      if (request.startKind === 'correct') execution.setCorrection(request.projectId, request.storyId, null);
      if (closing) return;
      void merges.check(request.projectId);
      void scheduler.post({ type: 'RunFinished', projectId: request.projectId, runId: request.runId }).catch(() => undefined);
      emit?.('run.finished', {
        projectId: request.projectId,
        runId: request.runId,
        storyId: request.storyId,
        outcome,
        notify: settingsStore.execDefaults().notifications,
      });
      emit?.('pending.changed', { projectId: request.projectId });
    },
    emit: (runId, event, seq) => {
      if (event.type === 'output') emit?.('run.output', { runId, seq, text: event.text });
    },
    now: () => new Date().toISOString(),
  });

  // Specification runs (US-027, ADR-014): main workspace, writes limited to the target folder, snapshot + review.
  const specFolder = (projectId: string, folder: string) => {
    const workspace = paths.get(projectId);
    if (!workspace) throw new Error(`Unknown project ${projectId}.`);
    return join(workspace, ...folder.split('/'));
  };
  const specCommits = new SpecCommits(git);
  const reviewFiles = new ReviewFiles({
    store: execution,
    workspace: (projectId) => specFolder(projectId, '.'),
    snapshots: (projectId) => new SnapshotStore(snapshotRoot(options.appDataDir, projectId)),
    git,
  });
  const permissionLog = new PermissionRequestRepository(database.sqlite);
  const specSnapshots = (projectId: string) => new SnapshotStore(snapshotRoot(options.appDataDir, projectId));
  const specRuns = new SpecRunService({
    store: execution,
    snapshots: {
      capture: async (projectId, folder) => {
        const dir = specFolder(projectId, folder);
        await mkdir(dir, { recursive: true });
        return (await specSnapshots(projectId).create(dir, { exclusions: [] })).id;
      },
      changes: async (projectId, folder, id) =>
        (await specSnapshots(projectId).diff(id, specFolder(projectId, folder))).map((c) => ({ ...c, path: `${folder}/${c.path}` })),
      restore: async (projectId, folder, id) => {
        await specSnapshots(projectId).restore(id, specFolder(projectId, folder));
      },
    },
    files: { read: async (projectId, path) => (await workspaceFiles(projectId).read(path))?.content ?? null },
    index: (projectId) => index.specIndexView(projectId),
    adapter: agentAdapter,
    workspace: (projectId) => ({ root: specFolder(projectId, '.'), nonGit: vcsModes.get(projectId) === 'none' }),
    implementationActive: (projectId) => execution.activeImplementationRuns(projectId) > 0,
    epics: (projectId) => index.epics(projectId),
    env: runEnv,
    config: runConfig,
    permissions: broker,
    approvals,
    reindex: async (projectId, changed) => {
      for (const path of changed) await reindexIn(projectId, path);
    },
    aiDisabledReason: () => setup.aiDisabledReason(),
    onKept: (review) => {
      quality.proposalKept(review.runId);
      // New stories reopen a Done epic (US-039 AC-4, FR-095).
      const added = review.files.filter((f) => f.change === 'A').flatMap((f) => index.storyByPath(review.projectId, f.path)?.storyId ?? []);
      if (added.length > 0) void epics.storiesAdded(review.projectId, added).catch(() => undefined);
    },
    onWritersChanged: (projectId) => void scheduler.post({ type: 'WorkspaceWriterChanged', projectId }).catch(() => undefined),
    onReviewReady: (review) => {
      if (closing) return;
      projectChanged(review.projectId);
      emit?.('spec.reviewReady', { projectId: review.projectId, runId: review.runId, state: review.state });
    },
    emit: (runId, event, seq) => {
      if (event.type === 'output') emit?.('run.output', { runId, seq, text: event.text });
    },
    now: () => new Date().toISOString(),
  });

  // US-013 AC-1: capabilities are published after each health check; losing them never stops active runs (AC-4).
  setup.onCapabilities((capabilities) => {
    if (!closing) emit?.('capabilities.changed', capabilities);
  });
  await Promise.all([setup.checkCapabilities(), reopening]);
  const rechecked = async <T>(result: T): Promise<T> => {
    await setup.checkCapabilities();
    return result;
  };

  // US-029: AI quality checks (read-only runs) and their findings.
  const quality = new QualityService({
    store: execution,
    adapter: agentAdapter,
    workspace: (projectId) => ({ root: specFolder(projectId, '.'), nonGit: vcsModes.get(projectId) === 'none' }),
    env: runEnv,
    config: runConfig,
    permissions: broker,
    implementationActive: (projectId) => execution.activeImplementationRuns(projectId) > 0,
    refine: (request) => specRuns.refine(request),
    aiDisabledReason: () => setup.aiDisabledReason(),
    newId: randomUUID,
    onChecked: (projectId, path, runId) => {
      if (closing) return;
      emit?.('quality.checked', { projectId, path, runId });
      projectChanged(projectId);
    },
    emit: (runId, event, seq) => {
      if (event.type === 'output') emit?.('run.output', { runId, seq, text: event.text });
    },
    now: () => new Date().toISOString(),
  });

  // US-028: intent clarification dialogues.
  const clarifications = new ClarificationService({
    store: execution,
    adapter: agentAdapter,
    workspace: (projectId) => ({ root: specFolder(projectId, '.'), nonGit: vcsModes.get(projectId) === 'none' }),
    env: runEnv,
    config: runConfig,
    permissions: broker,
    implementationActive: (projectId) => execution.activeImplementationRuns(projectId) > 0,
    refine: (request) => specRuns.refine(request),
    aiDisabledReason: () => setup.aiDisabledReason(),
    newId: randomUUID,
    onUpdated: (record) => {
      if (!closing) emit?.('clarify.updated', { projectId: record.projectId, clarificationId: record.id, state: record.state });
    },
    emit: (runId, event, seq) => {
      if (event.type === 'output') emit?.('run.output', { runId, seq, text: event.text });
    },
    now: () => new Date().toISOString(),
  });
  const clarificationView = (r: ClarificationRecord) => ({
    id: r.id,
    intentPath: r.intentPath,
    state: r.state,
    items: r.items,
    proposalRunId: r.proposalRunId,
    reason: r.reason,
  });

  // US-034: traceability over the index and the execution store.
  const trace = new TraceService({
    element: (projectId, id) => index.element(projectId, id),
    linkTargets: (projectId, id) => index.linkTargets(projectId, id),
    linkSources: (projectId, id) => index.linkSources(projectId, id),
    storyRuns: (projectId, storyId) =>
      execution
        .runs(projectId)
        .filter((r) => r.storyId === storyId)
        .map((r) => ({ runId: r.id, status: r.status, createdAt: r.createdAt })),
    runStory: (runId) => execution.run(runId)?.storyId ?? null,
    runFiles: (runId) => execution.runResult(runId)?.computedFiles.map((f) => f.path) ?? [],
    fileRuns: (projectId, path) => execution.fileRuns(projectId, path),
    allLinks: (projectId) => index.allLinks(projectId),
  });

  // US-035: epics of the user-stories phase.
  const epics = new EpicService({
    index: {
      epics: (projectId) => index.epics(projectId),
      epicStoryIds: (projectId, epicId) => index.epicStoryIds(projectId, epicId),
      storyPath: (projectId, storyId) => index.storyPath(projectId, storyId),
      epicRequirements: (projectId, epicId) => index.linkTargets(projectId, epicId).filter((id) => /^(FR|NFR)-/.test(id)),
      setLaneOrder: (projectId, epicId, order) => index.setLaneOrder(projectId, epicId, order),
    },
    files: (projectId) => workspaceFiles(projectId),
    reindex: (projectId, path) => reindexIn(projectId, path),
    approve: (projectId, path) => approvals.approve(projectId, path),
  });
  const mustHaves = async (projectId: string) => {
    const files = workspaceFiles(projectId);
    const ids: string[] = [];
    for (const a of index.artifacts(projectId).filter((x) => x.kind === 'requirements')) {
      const file = await files.read(a.path);
      if (file) ids.push(...mustHaveRequirementIds(file.content));
    }
    return ids;
  };
  const epicChange = async <T>(projectId: string, change: () => Promise<T>): Promise<T> => {
    const result = await mapped(change);
    projectChanged(projectId);
    return result;
  };

  // US-062: read-only project chat.
  const chat = new ChatService({
    store: execution,
    adapter: agentAdapter,
    workspace: (projectId) => ({ root: specFolder(projectId, '.'), nonGit: vcsModes.get(projectId) === 'none' }),
    env: runEnv,
    config: runConfig,
    permissions: broker,
    implementationActive: (projectId) => execution.activeImplementationRuns(projectId) > 0,
    aiDisabledReason: () => setup.aiDisabledReason(),
    newId: randomUUID,
    onMessage: (message, projectId) => {
      if (!closing) emit?.('chat.message', { projectId, threadId: message.threadId });
    },
    emit: (runId, event, seq) => {
      if (event.type === 'output') emit?.('run.output', { runId, seq, text: event.text });
    },
    now: () => new Date().toISOString(),
  });

  // US-060: the recommended next step over the indexed project state (ADR-017).
  const GENERATED_PHASE: Partial<Record<GenerationTarget, SpecPhase>> = {
    requirements: 'requirements',
    design: 'design',
    epics: 'stories',
    stories: 'stories',
  };
  const nextStepOf = (projectId: string, vcsMode: 'git' | 'none') => {
    const stories = index.stories(projectId);
    const generating = (Object.keys(GENERATED_PHASE) as GenerationTarget[])
      .filter((t) => execution.openSpecReview(projectId, SPEC_TARGET_FOLDERS[t])?.state === 'running')
      .map((t) => GENERATED_PHASE[t]!);
    return nextStep({
      setupComplete: setup.capabilities()?.aiAvailable ?? false,
      pendingPermissions: broker.pending().filter((p) => p.projectId === projectId).length,
      failedRuns: stories.filter((s) => s.subState === 'failed' || s.subState === 'interrupted').map((s) => s.storyId),
      reviewStories: stories.filter((s) => s.status === 'review').map((s) => s.storyId),
      conflictStories: stories.filter((s) => s.subState === 'blocked_conflict').map((s) => s.storyId),
      epicsAwaitingReview: [],
      decisionsInFlight: 0,
      phases: index.phaseInputs(projectId),
      generating,
      openDecisions: 0,
      readyStories: stories.filter((s) => s.status === 'ready').length,
      freeSlots: Math.max(0, projectSettings.limit(projectId, vcsMode) - execution.activeImplementationRuns(projectId)),
      approvedUnmerged: index.unmergedDoneStories(projectId).length,
      storyCount: stories.length,
      doneStories: stories.filter((s) => s.status === 'done').length,
    });
  };

  const merges = new MergeDetector({
    project: async (projectId) => {
      const project = await projects.get(projectId);
      return project && project.vcsMode === 'git' && project.baseBranch
        ? { repo: project.workspacePath, baseBranch: project.baseBranch }
        : undefined;
    },
    candidates: (projectId) => index.unmergedDoneStories(projectId),
    mergedInto: (repo, base, branches) => spaceManager.mergedInto(repo, base, branches),
    markMerged: (projectId, storyId, at) => index.setMergedAt(projectId, storyId, at),
    clearTouches: (projectId, storyId) => execution.clearTouches(projectId, storyId),
    onMerged: (projectId) => projectChanged(projectId),
    now: () => new Date().toISOString(),
  });
  let stopMergeTimer: () => void = () => undefined;
  watchMerges = (projectId) => {
    stopMergeTimer();
    stopMergeTimer = merges.every(projectId, settingsStore.execDefaults().mergeCheckIntervalS * 1000);
    void merges.check(projectId);
  };
  if (currentProjectId) watchMerges(currentProjectId);

  // FR-041: runs left active by a crash are Interrupted; their recorded agent processes are killed (identity checked).
  for (const crashed of execution.interruptActiveRuns()) {
    if (crashed.process) void killOrphan(crashed.process).catch(() => undefined);
  }

  // ADR-009: queues are re-evaluated at startup.
  for (const p of await projects.list()) {
    vcsModes.set(p.id, vcsModes.get(p.id) ?? p.vcsMode);
    paths.set(p.id, p.workspacePath);
  }
  await scheduler.post({ type: 'Startup' });

  /** Why the agent session of a story's last run cannot be resumed for corrections (US-059), or null. */
  const correctionBlocker = (projectId: string, storyId: string): string | null => {
    const adapter = agentAdapter;
    if (!adapter) return 'No agent adapter is available.';
    if (!adapter.capabilities().resume) return 'The agent cannot resume sessions.';
    const runId = execution.lastRunId(projectId, storyId);
    return runId && execution.run(runId)?.agentSessionId ? null : 'The previous run has no agent session.';
  };
  const suggestions = suggestRules(SETUP_COMMANDS);
  const env = systemEnvironment();
  const handlers: ContractHandlers = {
    ...createSystemHandlers({ pid: options.pid, platform: options.platform, allowCrash: options.testMode, exit: options.exit }),
    ...createRuntimeHandlers({
      detect: () => detectClaudeCode(env),
      verify: (path) => verifyClaudeCode(path, env),
      repository: runtimes,
    }),
    ...createRuleHandlers({ rules }),
    ...createDependencyHandlers({
      service: {
        add: (projectId, dependency) => contexts.require(projectId).dependencies.add(projectId, dependency),
        remove: (projectId, dependency) => contexts.require(projectId).dependencies.remove(projectId, dependency),
      },
      index,
    }),
    ...createProjectHandlers({
      projects,
      index,
      folders,
      activeRuns: async (id) => execution.activeImplementationRuns(id) + execution.activeWorkspaceWriters(id),
    }),
    'projects.create': (input) => opened(() => service.create(input)),
    'projects.open': ({ path }) => opened(() => service.open(path)),
    'projects.openById': ({ projectId }) => opened(() => service.openById(projectId)),
    'projects.close': async () => {
      await contexts.close();
      currentProjectId = null;
      return {};
    },
    'artifacts.list': async ({ projectId }) => {
      contexts.require(projectId);
      return artifacts.list(projectId);
    },
    'artifact.approve': ({ projectId, path }) => mapped(() => approvals.approve(projectId, path)),
    'artifacts.generationCheck': async ({ projectId, target }) => approvals.check(projectId, target),
    'artifact.read': ({ projectId, path }) => mapped(() => artifacts.read(projectId, path)),
    'artifact.save': ({ projectId, path, content, expectedHash }) => mapped(() => artifacts.save(projectId, path, content, expectedHash)),
    'setup.state': () => setup.state(),
    'setup.saveProvider': async ({ provider }) => rechecked(await setup.saveProvider(provider)),
    'setup.testConnection': async () => rechecked(await setup.testConnection()),
    'capabilities.get': async () => setup.capabilities() ?? setup.checkCapabilities(),
    'capabilities.refresh': () => setup.checkCapabilities(),
    'setup.ruleSuggestions': async () => {
      const existing = new Set(rules.globalRules().map((r) => `${r.toolName}|${r.pattern ?? ''}|${r.appliesTo}`));
      return suggestions.map((s) => ({
        key: s.key,
        label: s.label,
        enabled: s.rules.every((r) => existing.has(`${r.toolName}|${r.pattern ?? ''}|${r.appliesTo}`)),
      }));
    },
    'setup.enableRules': async ({ keys }) => {
      let created = 0;
      for (const suggestion of suggestions.filter((s) => keys.includes(s.key))) {
        for (const rule of enableSuggestion(suggestion, { scope: 'global' })) {
          rules.create({
            scope: 'global',
            effect: rule.effect,
            toolName: rule.toolName,
            appliesTo: rule.appliesTo,
            createdFrom: 'setup',
            ...(rule.pattern ? { pattern: rule.pattern } : {}),
          });
          created++;
        }
      }
      settingsStore.recordStep('rules', 'done');
      return { created };
    },
    'setup.skipStep': async ({ step }) => {
      await setup.skipStep(step);
      return {};
    },
    'setup.complete': async () => {
      await setup.complete();
      return rechecked({});
    },
    'setup.skip': async () => {
      await setup.skipSetup();
      return rechecked({});
    },
    'settings.get': async ({ projectId }) => ({
      ...settings.view(projectId),
      modelSuggestions: runtimes.get('claude-code')?.capabilities.models ?? [],
    }),
    'settings.saveAgent': ({ scope, settings: input }) => settings.saveAgent(scope, input),
    'settings.saveExec': async ({ defaults }) => {
      const result = await settings.saveExec(defaults);
      // A changed merge check interval applies at once (US-024 AC-1).
      if (result.ok && currentProjectId) watchMerges(currentProjectId);
      return result;
    },
    'pending.list': async ({ projectId }) => pendingOf(projectId),
    'permission.decide': async ({ id, decision, message, alwaysAllow }) => {
      const pending = broker.pending().find((p) => p.id === id);
      if (!pending) return { ok: false as const, reason: `No pending permission request ${id}.` };
      if (decision === 'allow' && alwaysAllow) {
        const rule = alwaysAllowRule(pending);
        if (!rule.ok) return { ok: false as const, reason: rule.reason };
        rules.create(rule.rule);
      }
      broker.decide(id, decision, message);
      emit?.('pending.changed', { projectId: pending.projectId });
      return { ok: true as const };
    },
    'specs.generate': async ({ projectId, target, instruction, epicIds }) =>
      specRuns.start({ projectId, target, instruction, ...(epicIds ? { epicIds } : {}) }),
    'specs.refine': async ({ projectId, path, section, instruction }) =>
      specRuns.refine({ projectId, path, instruction, ...(section ? { section } : {}) }),
    'specs.keep': async ({ runId }) => specRuns.keep(runId),
    'specs.discard': async ({ runId }) => specRuns.discard(runId),
    'specs.fix': async ({ runId }) => specRuns.fix(runId),
    'specs.review': async ({ runId }) => specRuns.review(runId) ?? null,
    'specs.openReview': async ({ projectId, target }) => execution.openSpecReview(projectId, SPEC_TARGET_FOLDERS[target]) ?? null,
    'specCommit.status': async ({ projectId }) => {
      const workspace = paths.get(projectId);
      if (!workspace || vcsModes.get(projectId) !== 'git') return { files: [], message: '' };
      const files = await specCommits.status(workspace);
      return { files, message: files.length > 0 ? specCommitMessage(files) : '' };
    },
    'specCommit.diff': async ({ projectId, path }) => ({ patch: await specCommits.diff(specFolder(projectId, '.'), path) }),
    'specCommit.commit': async ({ projectId, paths: files, message }) => {
      const result = await mapped(() => specCommits.commit(specFolder(projectId, '.'), files, message));
      if (result.ok) {
        projectChanged(projectId);
        void merges.check(projectId);
      }
      return result;
    },
    'merge.check': async ({ projectId }) => ({ merged: await merges.check(projectId) }),
    'board.runAction': async ({ projectId, storyId, action, reuseBranch, removeWorktree }) => {
      const lastRunId = execution.lastRunId(projectId, storyId);
      const space = lastRunId ? execution.executionSpace(lastRunId) : undefined;
      if (action === 'retry') execution.setRetryMode(projectId, storyId, reuseBranch ? 'reuse' : 'fresh');
      const result = await board.runAction(projectId, storyId, action);
      // AC-3: discard offers to remove the run's worktree (the branch is kept).
      if (
        result.ok &&
        action === 'discard' &&
        removeWorktree &&
        space?.mode === 'worktree' &&
        space.worktreePath &&
        existsSync(space.worktreePath)
      ) {
        await spaceManager.remove(specFolder(projectId, '.'), space.worktreePath);
      }
      return result;
    },
    'runs.recovery': async ({ projectId, storyId }) => {
      const lastRunId = execution.lastRunId(projectId, storyId) ?? null;
      const run = lastRunId ? execution.run(lastRunId) : undefined;
      const space = lastRunId ? execution.executionSpace(lastRunId) : undefined;
      return {
        lastRunId,
        resumable: Boolean(run?.agentSessionId) && (agentAdapter?.capabilities().resume ?? false),
        gitMode: vcsModes.get(projectId) === 'git',
        hasWorktree: Boolean(space?.mode === 'worktree' && space.worktreePath && existsSync(space.worktreePath)),
      };
    },
    'review.approve': async ({ projectId, storyId }) => {
      const moved = await board.move(projectId, storyId, 'done', null);
      if (!moved.ok) return moved;
      const project = await projects.get(projectId);
      const stories = index.stories(projectId).map((s) => s.storyId);
      const branches = Object.fromEntries(
        stories.flatMap((id) => {
          const branch = index.storyBranch(projectId, id);
          return branch ? [[id, branch] as const] : [];
        }),
      );
      const merged = new Set(stories.filter((id) => index.mergedAt(projectId, id) !== null));
      return {
        ok: true as const,
        merge: {
          baseBranch: project?.vcsMode === 'git' ? project.baseBranch : null,
          order: mergeOrder(storyId, { dependencies: index.dependencies(projectId), branches, merged }),
        },
      };
    },
    'review.reject': async ({ projectId, storyId, reason, restoreSnapshot }) => {
      const runId = execution.lastRunId(projectId, storyId);
      const space = runId ? execution.executionSpace(runId) : undefined;
      const moved = await board.move(projectId, storyId, 'ready', null);
      if (!moved.ok) return moved;
      if (space?.mode === 'worktree' && space.branch) execution.addRejectedBranch(projectId, storyId, space.branch);
      if (restoreSnapshot && space?.mode === 'in_place' && space.snapshotId && runId) {
        const changed = execution.runResult(runId)?.computedFiles.map((f) => f.path) ?? [];
        await new SnapshotStore(snapshotRoot(options.appDataDir, projectId)).restorePaths(
          space.snapshotId,
          specFolder(projectId, '.'),
          changed,
        );
      }
      execution.setStatusNotice(projectId, storyId, reason?.trim() ? `Rejected: ${reason.trim()}` : 'Rejected.');
      projectChanged(projectId);
      return { ok: true as const };
    },
    'review.rejectedBranches': async ({ projectId, storyId }) => execution.rejectedBranches(projectId, storyId),
    // US-059: corrections resume the agent session of the reviewed run, or start fresh on the same branch.
    'review.correctionOptions': async ({ projectId, storyId }) => {
      const reason = correctionBlocker(projectId, storyId);
      return { resumable: reason === null, reason };
    },
    'review.requestCorrections': async ({ projectId, storyId, feedback, fresh }) => {
      const blocker = fresh ? null : correctionBlocker(projectId, storyId);
      if (blocker) {
        return {
          ok: false as const,
          reason: `The agent session cannot be resumed (${blocker}). Start a fresh run on the same branch instead.`,
        };
      }
      const previous = execution.correction(projectId, storyId);
      execution.setCorrection(projectId, storyId, { feedback: feedback.trim(), fresh: fresh ?? false });
      const moved = await board.move(projectId, storyId, 'in_progress', null);
      if (!moved.ok) execution.setCorrection(projectId, storyId, previous ?? null);
      return moved;
    },
    'review.get': async ({ projectId, storyId }) => ({
      runId: execution.lastRunId(projectId, storyId) ?? null,
      overlaps: execution.overlaps(projectId, storyId),
      gitMode: vcsModes.get(projectId) === 'git',
    }),
    'review.fileVersions': async ({ projectId, runId, path }) => reviewFiles.versions(projectId, runId, path),
    'review.openFile': async ({ projectId, runId, path }) => {
      if (!options.openPath) throw new IpcError('UNAVAILABLE', 'Opening files is not available in this process.');
      await options.openPath(reviewFiles.resolve(projectId, runId, path));
      return { ok: true as const };
    },
    'runs.permissions': async ({ runId }) =>
      permissionLog.forRun(runId).map((p) => ({
        id: p.id,
        toolName: p.toolName,
        input: p.input,
        outsideWorkspace: p.outsideWorkspace,
        requestedAt: p.requestedAt,
        decision: p.decision,
        decidedBy: p.decidedBy,
        message: p.message,
      })),
    'quality.check': async ({ projectId, path }) => quality.check(projectId, path),
    'quality.findings': async ({ projectId, path }) =>
      quality.findings(projectId, path).map(({ projectId: _p, runId: _r, ...finding }) => finding),
    'quality.applyFix': async ({ findingId }) => quality.applyFix(findingId),
    'quality.dismiss': async ({ findingId, reason }) => quality.dismiss(findingId, reason),
    'intent.create': async ({ projectId }) => {
      const path = 'spec/01_intent/intent.md';
      const files = workspaceFiles(projectId);
      if (await files.read(path)) throw new IpcError('CONFLICT', `${path} already exists.`);
      await files.writeAtomic(path, INTENT_TEMPLATE, { expectedHash: null });
      await reindexIn(projectId, path);
      projectChanged(projectId);
      return { path };
    },
    'clarify.current': async ({ projectId, path }) => {
      const record = clarifications.current(projectId, path);
      return record ? clarificationView(record) : null;
    },
    'clarify.start': async ({ projectId, path }) => clarifications.start(projectId, path),
    'clarify.answer': async ({ clarificationId, answers }) => clarifications.answer(clarificationId, answers),
    'clarify.saveDraft': async ({ clarificationId, answers }) => clarifications.saveDraft(clarificationId, answers),
    'clarify.finish': async ({ clarificationId }) => clarifications.finish(clarificationId),
    'clarify.cancel': async ({ clarificationId }) => clarifications.cancel(clarificationId),
    'epics.create': ({ projectId, title }) => epicChange(projectId, () => epics.create(projectId, { title })),
    'epics.merge': ({ projectId, sourceId, targetId }) =>
      epicChange(projectId, async () => (await epics.merge(projectId, sourceId, targetId), {})),
    'epics.split': ({ projectId, epicId, storyIds, title }) => epicChange(projectId, () => epics.split(projectId, epicId, storyIds, title)),
    'epics.reorder': async ({ projectId, epicIds }) => {
      epics.reorder(projectId, epicIds);
      projectChanged(projectId);
      return {};
    },
    'epics.delete': ({ projectId, epicId }) => epicChange(projectId, async () => (await epics.delete(projectId, epicId), {})),
    'epics.approveAll': ({ projectId }) => epicChange(projectId, () => epics.approveAll(projectId)),
    'stories.setEpic': ({ projectId, storyId, epicId }) =>
      epicChange(projectId, async () => (await epics.assign(projectId, storyId, epicId), {})),
    'chat.createThread': async ({ projectId, title }) => {
      const thread = chat.createThread(projectId, title);
      return { id: thread.id, title: thread.title };
    },
    'chat.send': async ({ threadId, text }) => chat.send(threadId, text),
    'runs.cancel': async ({ runId }) => {
      const run = execution.run(runId);
      if (!run?.storyId) return { ok: false as const, reason: `Run ${runId} is not active.` };
      const active = runs.activeRuns().some((r) => r.runId === runId);
      if (!active) return { ok: false as const, reason: `Run ${runId} is not active.` };
      const moved = await board.move(run.projectId, run.storyId, 'ready', null);
      return moved.ok ? { ok: true as const } : { ok: false as const, reason: moved.reason };
    },
    'phases.status': async ({ projectId }) => {
      const inputs = index.phaseInputs(projectId);
      const PHASE_OF_FOLDER: Record<string, SpecPhase> = {
        '01_intent': 'intent',
        '02_requirements': 'requirements',
        '03_design': 'design',
        '04_user_stories': 'stories',
      };
      const qualityChecked = execution
        .runs(projectId)
        .filter((r) => r.kind === 'quality_check' && r.status === 'completed' && r.startTrigger?.startsWith('QualityCheck '))
        .map((r) => PHASE_OF_FOLDER[r.startTrigger!.slice('QualityCheck '.length).split('/')[1] ?? ''])
        .filter((p): p is SpecPhase => p !== undefined);
      const generating = (Object.keys(GENERATED_PHASE) as GenerationTarget[])
        .filter((t) => execution.openSpecReview(projectId, SPEC_TARGET_FOLDERS[t])?.state === 'running')
        .map((t) => GENERATED_PHASE[t]!);
      const stepper = phaseStepper(inputs, { storyCount: index.storyIds(projectId).length, generating, qualityChecked });
      return { ...stepper, phases: stepper.phases.map((p) => ({ ...p, unapprovedInputs: unapprovedInputs(p.phase, inputs) })) };
    },
    'trace.get': async ({ projectId, target }) => trace.trace(projectId, target),
    'trace.issues': async ({ projectId }) => trace.issues(projectId),
    'epics.list': async ({ projectId }) => ({
      epics: index.epics(projectId).map((e) => ({
        id: e.id,
        title: e.title,
        approval: e.approval,
        path: e.path,
        stories: index.epicStoryIds(projectId, e.id),
        requirements: index.linkTargets(projectId, e.id).filter((id) => /^(FR|NFR)-/.test(id)),
      })),
      uncovered: epics.uncovered(projectId, await mustHaves(projectId)),
    }),
    'dashboard.get': async ({ projectId }) => {
      contexts.require(projectId);
      const impacted = new Set(index.impactedPaths(projectId));
      return buildDashboard({
        stories: index.stories(projectId).map((s) => ({ storyId: s.storyId, status: s.status })),
        runs: execution
          .runs(projectId)
          .map((r) => ({ runId: r.id, storyId: r.storyId, kind: r.kind, status: r.status, createdAt: r.createdAt, endedAt: r.endedAt })),
        queued: execution.queuedCount(projectId),
        pendingDecisions: pendingCount(pendingOf(projectId)),
        unmerged: index.unmergedDoneStories(projectId).length,
        artifacts: index
          .artifacts(projectId)
          .map((a) => ({ path: a.path, kind: a.kind, approval: a.approval, impacted: impacted.has(a.path) })),
        lanes: board.board(projectId).lanes,
      });
    },
    'chat.threads': async ({ projectId }) =>
      chat.threads(projectId).map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, active: chat.isAnswering(t.id) })),
    'chat.messages': async ({ threadId }) => chat.messages(threadId).map(({ threadId: _t, ...m }) => m),
    'runs.active': async () =>
      runs.activeRuns().map((r) => ({
        runId: r.runId,
        projectId: r.projectId,
        storyId: r.storyId,
        title: index.stories(r.projectId).find((s) => s.storyId === r.storyId)?.title ?? r.storyId,
      })),
    'runs.interruptAll': async () => {
      await runs.shutdown();
      return {};
    },
    'runs.context': async ({ runId }) => ({ context: execution.contextDigest(runId) }),
    'runs.result': async ({ runId }) => execution.runResult(runId) ?? null,
    'runs.events': async ({ runId, afterSeq, limit }) => execution.runEvents(runId, afterSeq ?? 0, limit ?? -1),
    'runs.search': async ({ runId, query }) => ({
      seqs: query.trim() ? execution.searchEvents(runId, query) : [],
      total: execution.eventCount(runId),
    }),
    'runs.overview': async ({ projectId }) => {
      const titles = new Map(index.stories(projectId).map((s) => [s.storyId, s.title]));
      return execution.runsOverview(projectId).map((r) => ({ ...r, title: (r.storyId && titles.get(r.storyId)) || r.storyId || r.kind }));
    },
    'runs.list': async ({ projectId }) =>
      execution.runs(projectId).map((r) => ({
        id: r.id,
        storyId: r.storyId,
        kind: r.kind,
        status: r.status,
        startTrigger: r.startTrigger,
        failureReason: r.failureReason,
        configSnapshot: r.configSnapshot,
        createdAt: r.createdAt,
        endedAt: r.endedAt,
      })),
    'projectSettings.get': ({ projectId }) => projectSettings.get(projectId),
    'projectSettings.save': ({ projectId, settings: input }) => projectSettings.save(projectId, input),
    'projectSettings.saveInstructions': ({ projectId, content, expectedHash }) =>
      projectSettings.saveInstructions(projectId, content, expectedHash),
    'board.get': async ({ projectId }) => {
      contexts.require(projectId);
      return board.board(projectId);
    },
    'board.recheck': ({ projectId, storyId }) => board.recheck(projectId, storyId),
    'board.move': ({ projectId, storyId, to, beforeStoryId }) => board.move(projectId, storyId, to, beforeStoryId),
    'projects.gitAvailable': async () => ({ available: await service.gitAvailable() }),
    'shell.state': async () => {
      const current = currentProjectId ? await projects.get(currentProjectId) : undefined;
      return {
        projects: (await projects.list()).map((p) => ({ id: p.id, name: p.name })),
        currentProjectId: current?.id ?? null,
        vcs: current
          ? current.vcsMode === 'git'
            ? { mode: 'git' as const, branch: current.baseBranch }
            : { mode: 'none' as const }
          : null,
        runs: current
          ? { running: execution.activeImplementationRuns(current.id), queued: execution.queuedCount(current.id) }
          : { running: 0, queued: 0 },
        pendingDecisions: current ? pendingCount(pendingOf(current.id)) : 0,
        storyCount: current ? index.storyIds(current.id).length : 0,
        nextStep: current ? nextStepOf(current.id, current.vcsMode) : null,
      };
    },
  };

  return {
    handlers,
    setEmitter(next) {
      emit = next;
    },
    async close() {
      closing = true;
      stopMergeTimer();
      await merges.idle();
      broker.shutdown();
      await runs.shutdown();
      await scheduler.idle();
      await Promise.allSettled([specRuns.idle(), quality.idle(), clarifications.idle(), merges.idle(), chat.idle()]);
      await contexts.close();
      database.close();
    },
  };
}
