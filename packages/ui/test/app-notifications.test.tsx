// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import type { ContractHandlers } from '@specforge/ipc-contract';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const permission = {
  id: 'q1',
  runId: 'run-1',
  projectId: 'p1',
  runKind: 'implement',
  toolName: 'Bash',
  input: { command: 'npm test' },
  cwd: '/wt/US-001',
  outsideWorkspace: false,
  requestedAt: 't',
};

function handlers(state: { pending: boolean; decided: unknown[] }): ContractHandlers {
  return {
    'setup.state': async () => ({ setupState: 'complete', steps: [] }),
    'shell.state': async () => ({
      projects: [{ id: 'p1', name: 'P' }],
      currentProjectId: 'p1',
      vcs: { mode: 'git', branch: 'main' },
      runs: { running: 1, queued: 0 },
      pendingDecisions: state.pending ? 1 : 0,
      storyCount: 1,
    }),
    'pending.list': async () => (state.pending ? [{ storyId: 'US-001', title: 'Login', items: [{ kind: 'permission', permission }] }] : []),
    'permission.decide': async (input) => {
      state.decided.push(input);
      state.pending = false;
      return { ok: true };
    },
  };
}

describe('US-053: pending decisions and notifications in the app', () => {
  it('AC-1/AC-2: the counter opens the panel; deciding a prompt refreshes the counter', async () => {
    const state = { pending: true, decided: [] as unknown[] };
    const { session, server } = await fakeCoreWithEvents(handlers(state));
    render(<App session={session} testMode={false} />);

    await userEvent.click(await screen.findByRole('button', { name: '1 pending decision' }));
    const panel = screen.getByRole('dialog', { name: 'Pending decisions (1)' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Allow' }));
    act(() => server.emit('pending.changed', { projectId: 'p1' }));

    expect(await screen.findByRole('button', { name: 'No pending decisions' })).toBeInTheDocument();
    expect(state.decided).toEqual([{ id: 'q1', decision: 'allow' }]);
    expect(await screen.findByText('Nothing is waiting for you.')).toBeInTheDocument();
  });

  it('AC-3: shows toasts for finished runs and permission requests; OS notification only when unfocused and enabled', async () => {
    const notify = vi.fn();
    let focused = true;
    const { session, server } = await fakeCoreWithEvents(handlers({ pending: false, decided: [] }));
    render(<App session={session} testMode={false} notify={notify} isFocused={() => focused} />);
    await screen.findByRole('button', { name: 'No pending decisions' });

    act(() => server.emit('run.finished', { projectId: 'p1', runId: 'r1', storyId: 'US-001', outcome: 'completed', notify: true }));
    expect(await screen.findByText('US-001: run completed — ready for review')).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();

    focused = false;
    act(() => server.emit('run.finished', { projectId: 'p1', runId: 'r2', storyId: 'US-002', outcome: 'failed', notify: true }));
    expect(await screen.findByText('US-002: run failed')).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith('SpecForge', 'US-002: run failed');

    act(() => server.emit('permission.requested', { projectId: 'p1', id: 'q2', storyId: 'US-003', toolName: 'Write', notify: true }));
    expect(await screen.findByText('US-003 asks to use Write')).toBeInTheDocument();
    expect(notify).toHaveBeenLastCalledWith('SpecForge', 'US-003 asks to use Write');

    act(() => server.emit('run.finished', { projectId: 'p1', runId: 'r3', storyId: 'US-004', outcome: 'failed', notify: false }));
    await screen.findByText('US-004: run failed');
    expect(notify).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(screen.queryByText('US-001: run completed — ready for review')).not.toBeInTheDocument();
  });
});
