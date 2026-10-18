// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { CONTRACT_VERSION, IpcError, serveContract, type ContractHandlers, type PortLike } from '@specforge/ipc-contract';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { CoreSession } from '../src/core/core-session.js';

const open: MessagePort[] = [];
afterEach(() => {
  cleanup();
  for (const p of open.splice(0)) p.close();
});

function wrap(port: MessagePort): PortLike {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
}

const shellState = {
  projects: [],
  currentProjectId: null,
  vcs: null,
  runs: { running: 0, queued: 0 },
  pendingDecisions: 0,
  storyCount: 0,
};

async function connect(handlers: ContractHandlers): Promise<CoreSession> {
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), {
    'system.ping': async ({ nonce }) => ({ nonce, pid: 99 }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: 'test' }),
    'shell.state': async () => shellState,
    ...handlers,
  });
  const session = new CoreSession();
  await session.attach(wrap(port1));
  return session;
}

describe('US-017/US-022: renderer root', () => {
  it('shows the start wizard with recent projects when no project is open, and refreshes after a removal', async () => {
    let projects = [{ id: 'p1', name: 'Tasks', path: '/w/tasks', lastOpenedAt: null, phase: null, phaseLabel: null, missing: true }];
    const session = await connect({
      'projects.recent': async () => projects,
      'projects.remove': async ({ projectId }) => {
        projects = projects.filter((p) => p.id !== projectId);
        return {};
      },
    });

    render(<App session={session} testMode={false} />);

    const item = await screen.findByRole('listitem', { name: 'Tasks' });
    expect(screen.getByTestId('core-status')).toHaveTextContent('connected');
    await userEvent.click(within(item).getByRole('button', { name: 'Remove Tasks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    expect(await screen.findByText('No recent projects')).toBeInTheDocument();
  });

  it('renames a project and shows refused removals', async () => {
    let name = 'Tasks';
    const session = await connect({
      'projects.recent': async () => [
        {
          id: 'p1',
          name,
          path: '/w/tasks',
          lastOpenedAt: null,
          phase: { phase: 'intent', state: 'not_started' },
          phaseLabel: 'Intent · not started',
          missing: false,
        },
      ],
      'projects.rename': async (input) => {
        name = input.name;
        return {};
      },
      'projects.remove': async () => {
        throw new IpcError('RUNS_ACTIVE', 'Tasks has 1 active run. Cancel them before removing the project.');
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Tasks' }));
    const input = screen.getByRole('textbox', { name: 'Project name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tasks v2{Enter}');
    expect(await screen.findByRole('listitem', { name: 'Tasks v2' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Tasks v2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 active run');
  });

  it('shows an empty list when the registry is unavailable and navigates to other areas', async () => {
    const session = await connect({});
    render(<App session={session} testMode={false} />);

    expect(await screen.findByText('No recent projects')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('offers test-mode diagnostics (ping) and reports a failed core', async () => {
    const session = await connect({});
    render(<App session={session} testMode />);

    await userEvent.click(screen.getByTestId('ping'));
    expect(await screen.findByText(/pong from pid 99 #1/)).toBeInTheDocument();

    act(() => session.setStatus('reconnecting'));
    expect(screen.getByTestId('core-status')).toHaveTextContent('reconnecting');
    await userEvent.click(screen.getByTestId('ping'));
    expect(await screen.findByText(/error: The SpecForge core is not connected/)).toBeInTheDocument();
  });
});

const opened = (
  overrides: Partial<{ vcs: { mode: 'git'; branch: string | null } | { mode: 'none' }; isolationWarning: string | null }> = {},
) => ({
  id: 'p9',
  name: 'Task Manager',
  path: 'C:\\work\\task-manager',
  vcs: { mode: 'git' as const, branch: 'main' },
  isolationWarning: null,
  ...overrides,
});

/** Core fake whose shell state follows the open project. */
function projectCore(extra: ContractHandlers = {}) {
  let current: ReturnType<typeof opened> | null = null;
  const handlers: ContractHandlers = {
    'shell.state': async () => ({
      ...shellState,
      projects: current ? [{ id: current.id, name: current.name }] : [],
      currentProjectId: current?.id ?? null,
      vcs: current?.vcs ?? null,
    }),
    'projects.recent': async () => [],
    'projects.gitAvailable': async () => ({ available: true }),
    'projects.close': async () => {
      current = null;
      return {};
    },
    ...extra,
  };
  return { handlers, open: (p: ReturnType<typeof opened>) => (current = p) };
}

describe('US-018/US-019: project flows in the renderer', () => {
  it('US-018 AC-4: creating a project opens it at the Intent phase', async () => {
    const core = projectCore();
    const session = await connect({
      ...core.handlers,
      'projects.create': async (input) => core.open({ ...opened(), name: input.name }),
    });
    render(<App session={session} testMode={false} pickFolder={async () => 'C:\\work'} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Create new project' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Project name' }), 'Task Manager');
    await userEvent.click(screen.getByRole('button', { name: 'Choose location…' }));
    await screen.findByText('C:\\work');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('heading', { name: 'Intent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intent' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Git · main')).toBeInTheDocument();
  });

  it('US-019 AC-1/AC-2: opening a folder shows the project with its VCS badge and the non-git warning', async () => {
    const core = projectCore();
    const warning = 'No Git repository — runs are not isolated.';
    const session = await connect({
      ...core.handlers,
      'projects.open': async () => core.open(opened({ vcs: { mode: 'none' }, isolationWarning: warning })),
    });
    render(<App session={session} testMode={false} pickFolder={async () => 'C:\\work\\billing'} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Open existing project' }));

    expect(await screen.findByText('No Git — runs are not isolated')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(warning);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('US-019 AC-1: explains a folder without SpecForge metadata', async () => {
    const session = await connect({
      ...projectCore().handlers,
      'projects.open': async () => {
        throw new IpcError('NOT_A_PROJECT', 'The folder C:\\plain has no SpecForge metadata (.specforge/project.yaml).');
      },
    });
    render(<App session={session} testMode={false} pickFolder={async () => 'C:\\plain'} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Open existing project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no SpecForge metadata');
  });

  it('cancelling the folder picker does nothing', async () => {
    let calls = 0;
    const session = await connect({
      ...projectCore().handlers,
      'projects.open': async () => {
        calls++;
        throw new Error('unexpected');
      },
    });
    render(<App session={session} testMode={false} pickFolder={async () => null} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Open existing project' }));

    expect(calls).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reopens a recent project, locates a missing one, switches and closes projects', async () => {
    const core = projectCore();
    const located: string[] = [];
    const session = await connect({
      ...core.handlers,
      'projects.recent': async () => [
        {
          id: 'p9',
          name: 'Task Manager',
          path: 'C:\\work\\task-manager',
          lastOpenedAt: null,
          phase: null,
          phaseLabel: 'Intent · not started',
          missing: false,
        },
        { id: 'p8', name: 'Moved', path: 'C:\\old', lastOpenedAt: null, phase: null, phaseLabel: null, missing: true },
      ],
      'projects.locate': async ({ path }) => {
        located.push(path);
        return {};
      },
      'projects.openById': async ({ projectId }) => core.open({ ...opened(), id: projectId }),
    });
    render(<App session={session} testMode={false} pickFolder={async () => 'C:\\new'} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Locate Moved' }));
    expect(located).toEqual(['C:\\new']);

    await userEvent.click(screen.getByRole('button', { name: 'Open Task Manager' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close project' }));
    expect(await screen.findByRole('button', { name: 'Create new project' })).toBeInTheDocument();
  });
});

describe('US-038: Kanban area', () => {
  it('loads the board of the open project, moves a card and refreshes the board and the run indicator', async () => {
    const core = projectCore();
    core.open(opened());
    let status: 'ready' | 'in_progress' = 'ready';
    const moves: unknown[] = [];
    const card = () => ({
      storyId: 'US-001',
      title: 'Login',
      size: 'S',
      approval: 'approved' as const,
      status,
      subState: (status === 'ready' ? 'none' : 'queued') as 'none' | 'queued',
      queueReason: null,
      waitingFor: [],
      statusNotice: null,
      dependsOn: [],
      related: [],
    });
    const session = await connect({
      ...core.handlers,
      'shell.state': async () => ({
        ...shellState,
        projects: [{ id: 'p9', name: 'Task Manager' }],
        currentProjectId: 'p9',
        vcs: { mode: 'git', branch: 'main' },
        storyCount: 1,
        runs: { running: 0, queued: status === 'in_progress' ? 1 : 0 },
      }),
      'board.get': async () => ({
        columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((s) => ({
          status: s,
          cards: s === status ? [card()] : [],
        })),
        queue: [],
        slots: { active: 0, limit: 3 },
      }),
      'board.move': async (input) => {
        moves.push(input);
        status = 'in_progress';
        return { ok: true };
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Kanban' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Move US-001 to' }), 'in_progress');

    expect(await screen.findByRole('region', { name: 'In Progress (1)' })).toBeInTheDocument();
    expect(moves).toEqual([{ projectId: 'p9', storyId: 'US-001', to: 'in_progress', beforeStoryId: null }]);
    expect(await screen.findByText('0 running · 1 queued')).toBeInTheDocument();
  });
});

describe('US-025: Specifications area', () => {
  it('lists artifacts, opens one in the editor and saves it through the core', async () => {
    const core = projectCore();
    core.open(opened());
    const saved: unknown[] = [];
    const session = await connect({
      ...core.handlers,
      'artifacts.list': async () => [
        { kind: 'intent', label: 'Intent', artifacts: [{ path: 'spec/01_intent/intent.md', approval: 'draft', invalid: null }] },
      ],
      'artifact.read': async () => ({ content: '# Intent\n', hash: 'h1' }),
      'artifact.save': async (input) => {
        saved.push(input);
        return { ok: true, hash: 'h2' };
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Specifications' }));
    await userEvent.click(await screen.findByRole('button', { name: /intent\.md/ }));
    await screen.findByRole('region', { name: 'Preview' });
    const { EditorView } = await import('@codemirror/view');
    const view = EditorView.findFromDOM(document.querySelector('.cm-content') as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: 'More.\n' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(saved).toEqual([{ projectId: 'p9', path: 'spec/01_intent/intent.md', content: '# Intent\nMore.\n', expectedHash: 'h1' }]);
  });
});

describe('US-015 / US-014 AC-3: Settings area', () => {
  const view = {
    global: { model: 'claude-opus-5-5', env: [] },
    project: null,
    effective: { model: 'claude-opus-5-5', env: [] },
    exec: {
      maxRunDurationS: 3600,
      idleTimeoutS: 600,
      notifications: true,
      logRetentionDays: 30,
      logLevel: 'info' as const,
      mergeCheckIntervalS: 60,
    },
    modelSuggestions: [],
  };

  it('shows agent defaults, project overrides, execution defaults and effective rules; saving reloads', async () => {
    const core = projectCore();
    core.open(opened());
    const calls: string[] = [];
    let disabled = false;
    const session = await connect({
      ...core.handlers,
      'settings.get': async () => view,
      'settings.saveAgent': async ({ scope }) => {
        calls.push(`agent ${scope.kind}`);
        return { ok: true };
      },
      'settings.saveExec': async () => {
        calls.push('exec');
        return { ok: true };
      },
      'rules.effective': async () => [
        { id: 'g1', effect: 'allow', toolName: 'Read', pattern: null, appliesTo: 'all', origin: 'global', disabled },
      ],
      'rules.setGlobalDisabled': async (input) => {
        disabled = input.disabled;
        calls.push(`rule ${input.ruleId} ${input.disabled}`);
        return {};
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save execution defaults' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save agent settings' })[1]!);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Use global rule Allow Read in this project' }));

    expect(await screen.findByText('Disabled for this project')).toBeInTheDocument();
    expect(calls).toEqual(['exec', 'agent project', 'rule g1 true']);
    expect(screen.getByRole('form', { name: 'Agent defaults (all projects)' })).toBeInTheDocument();
  });

  it('US-016: shows the project settings of the open project and saves them', async () => {
    const core = projectCore();
    core.open(opened());
    const saved: unknown[] = [];
    const session = await connect({
      ...core.handlers,
      'settings.get': async () => view,
      'rules.effective': async () => [],
      'projectSettings.get': async () => ({
        settings: {
          baseBranch: 'main',
          branchPattern: 'specforge/{storyId}',
          worktreeRoot: '/wt/p9',
          snapshotExclusions: [],
          concurrencyLimit: 3,
        },
        vcsMode: 'git',
        effectiveConcurrency: 3,
        concurrencyNote: null,
        instructions: { content: '', hash: null },
      }),
      'projectSettings.save': async (input) => {
        saved.push(input.settings.concurrencyLimit);
        return { ok: true };
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save project settings' }));

    expect(saved).toEqual([3]);
  });

  it('is available without an open project (global settings only)', async () => {
    const session = await connect({ ...projectCore().handlers, 'settings.get': async () => view });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('form', { name: 'Agent defaults (all projects)' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Approval rules' })).not.toBeInTheDocument();
  });
});

describe('US-012 AC-3: first start opens the setup wizard', () => {
  const steps = (['runtime', 'provider', 'git', 'rules', 'defaults', 'summary'] as const).map((id) => ({
    id,
    label: id,
    status: 'ok' as const,
    detail: '',
  }));

  it('shows the setup wizard while setup has not been done, then the start wizard', async () => {
    let setupState: 'not_started' | 'complete' = 'not_started';
    const session = await connect({
      ...projectCore().handlers,
      'setup.state': async () => ({ setupState, steps }),
      'setup.complete': async () => {
        setupState = 'complete';
        return {};
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: /^summary/ }));
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByRole('button', { name: 'Create new project' })).toBeInTheDocument();
  });

  it('opens the start wizard directly once setup is complete', async () => {
    const session = await connect({ ...projectCore().handlers, 'setup.state': async () => ({ setupState: 'complete', steps }) });
    render(<App session={session} testMode={false} />);
    expect(await screen.findByRole('button', { name: 'Create new project' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument();
  });
});

describe('US-026: approve in the Specifications area', () => {
  it('approves the open artifact and shows the Approved badge', async () => {
    const core = projectCore();
    core.open(opened());
    let approval: 'draft' | 'approved' = 'draft';
    const session = await connect({
      ...core.handlers,
      'artifacts.list': async () => [
        { kind: 'requirements', label: 'Requirements', artifacts: [{ path: 'spec/02_requirements/fr.md', approval, invalid: null }] },
      ],
      'artifact.read': async () => ({ content: `---\napproval: ${approval}\n---\n# FR\n`, hash: `h-${approval}` }),
      'artifact.approve': async () => {
        approval = 'approved';
        return { ok: true, hash: 'h2' };
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Specifications' }));
    await userEvent.click(await screen.findByRole('button', { name: /fr\.md/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    // The editor remounts with the re-read document; wait for the end state.
    await screen.findByText((_, el) => el?.classList.contains('artifact-toolbar') === true && el.textContent!.includes('Approved'));
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});

describe('US-041 / US-043: Kanban area actions', () => {
  it('switches to the dependency graph, re-checks a blocked story and edits dependencies in the drawer', async () => {
    const core = projectCore();
    core.open(opened());
    const calls: string[] = [];
    const blocked = {
      storyId: 'US-004',
      title: 'Import',
      size: null,
      approval: 'approved' as const,
      status: 'in_progress' as const,
      subState: 'blocked_conflict' as const,
      queueReason: 'conflict' as const,
      waitingFor: ['src/a.ts'],
      statusNotice: null,
      dependsOn: ['US-001'],
      related: [],
    };
    const done = {
      ...blocked,
      storyId: 'US-001',
      title: 'Base',
      status: 'done' as const,
      subState: 'none' as const,
      queueReason: null,
      waitingFor: [],
      dependsOn: [],
    };
    const session = await connect({
      ...core.handlers,
      'shell.state': async () => ({
        ...shellState,
        projects: [{ id: 'p9', name: 'T' }],
        currentProjectId: 'p9',
        vcs: { mode: 'git', branch: 'main' },
        storyCount: 2,
      }),
      'board.get': async () => ({
        columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((s) => ({
          status: s,
          cards: [blocked, done].filter((c) => c.status === s),
        })),
        queue: ['US-004'],
        slots: { active: 0, limit: 3 },
      }),
      'board.recheck': async ({ storyId }) => {
        calls.push(`recheck ${storyId}`);
        return { ok: true };
      },
      'stories.removeDependency': async ({ from, to }) => {
        calls.push(`remove ${from}->${to}`);
        return { ok: true };
      },
    });
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Kanban' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Re-check US-004' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open US-004' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'US-004 Import' })).getByRole('button', { name: 'Remove dependency on US-001' }),
    );
    expect(calls).toEqual(['recheck US-004', 'remove US-004->US-001']);

    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    await userEvent.click(screen.getByRole('radio', { name: 'Dependency graph' }));
    expect(await screen.findByRole('region', { name: 'Dependency graph' })).toBeInTheDocument();
  });
});
