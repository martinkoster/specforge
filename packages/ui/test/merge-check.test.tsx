// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { KanbanArea } from '../src/board/KanbanArea.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const board = {
  columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((status) => ({ status, cards: [] })),
  queue: [],
  slots: { active: 0, limit: 3 },
};

const state = (mode: 'git' | 'none') => ({
  projects: [{ id: 'p1', name: 'Tasks' }],
  currentProjectId: 'p1',
  vcs: mode === 'git' ? { mode: 'git' as const, branch: 'main' } : { mode: 'none' as const },
  runs: { running: 0, queued: 0 },
  pendingDecisions: 0,
  storyCount: 0,
});

describe('US-024 AC-1/AC-2: merge check triggers in the UI', () => {
  it('checks for merged branches when the window gains focus (git mode only)', async () => {
    const check = vi.fn(async () => ({ merged: ['US-001'] }));
    const session = await fakeCore({
      'shell.state': async () => state('git'),
      'setup.state': async () => ({ setupState: 'complete', steps: [] }),
      'merge.check': check,
    });
    render(<App session={session} testMode={false} />);
    await screen.findByRole('button', { name: 'Close project' });

    act(() => void window.dispatchEvent(new Event('focus')));
    await vi.waitFor(() => expect(check).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' })));
  });

  it('does not check in non-git mode', async () => {
    const check = vi.fn(async () => ({ merged: [] }));
    const session = await fakeCore({
      'shell.state': async () => state('none'),
      'setup.state': async () => ({ setupState: 'complete', steps: [] }),
      'merge.check': check,
    });
    render(<App session={session} testMode={false} />);
    await screen.findByRole('button', { name: 'Close project' });
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 50));
    expect(check).not.toHaveBeenCalled();
  });

  it('Refresh on the board runs the merge check and reloads the board', async () => {
    const check = vi.fn(async () => ({ merged: [] }));
    const get = vi.fn(async () => board);
    const session = await fakeCore({ 'board.get': get, 'merge.check': check });
    render(<KanbanArea session={session} projectId="p1" onChanged={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe('US-063 AC-1: the board follows run progress', () => {
  it('re-reads the board when the shell state changes (run started, finished, decision answered)', async () => {
    const get = vi.fn(async () => board);
    const session = await fakeCore({ 'board.get': get });
    const { rerender } = render(<KanbanArea session={session} projectId="p1" onChanged={vi.fn()} refreshKey={1} />);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    rerender(<KanbanArea session={session} projectId="p1" onChanged={vi.fn()} refreshKey={2} />);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
