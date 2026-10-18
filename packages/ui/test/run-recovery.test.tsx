// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard, type BoardData } from '../src/board/KanbanBoard.js';
import { RunRecoveryDialog } from '../src/board/RunRecoveryDialog.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const card = (subState: 'failed' | 'interrupted' | 'running') => ({
  storyId: 'US-001',
  title: 'Login',
  size: 'S',
  approval: 'approved' as const,
  status: 'in_progress' as const,
  subState,
  queueReason: null,
  waitingFor: [],
  statusNotice: subState === 'failed' ? 'Failed: Agent crashed' : null,
  dependsOn: [],
  related: [],
});
const board = (subState: 'failed' | 'interrupted' | 'running'): BoardData => ({
  columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((status) => ({
    status,
    cards: status === 'in_progress' ? [card(subState)] : [],
  })),
  queue: [],
  slots: { active: 0, limit: 3 },
});

describe('US-055 AC-1: recovery actions on failed and interrupted cards', () => {
  it('offers Recover on failed and interrupted cards only', async () => {
    const onRecover = vi.fn();
    const { rerender } = render(<KanbanBoard board={board('failed')} onMove={async () => ({ ok: true })} onRecover={onRecover} />);
    await userEvent.click(screen.getByRole('button', { name: 'Recover US-001' }));
    expect(onRecover).toHaveBeenCalledWith('US-001');
    rerender(<KanbanBoard board={board('interrupted')} onMove={async () => ({ ok: true })} onRecover={onRecover} />);
    expect(screen.getByRole('button', { name: 'Recover US-001' })).toBeInTheDocument();
    rerender(<KanbanBoard board={board('running')} onMove={async () => ({ ok: true })} onRecover={onRecover} />);
    expect(screen.queryByRole('button', { name: 'Recover US-001' })).not.toBeInTheDocument();
  });
});

async function dialog(recovery: { resumable: boolean; gitMode: boolean; hasWorktree: boolean }) {
  const action = vi.fn(async () => ({ ok: true as const }));
  const onDone = vi.fn();
  const session = await fakeCore({
    'runs.recovery': async () => ({ lastRunId: 'r1', ...recovery }),
    'board.runAction': action,
  });
  render(<RunRecoveryDialog session={session} projectId="p1" storyId="US-001" onDone={onDone} onCancel={() => undefined} />);
  const view = await screen.findByRole('dialog', { name: 'Recover US-001' });
  await within(view).findByRole('button', { name: 'Retry' });
  return { action, onDone, view };
}

describe('US-055 AC-1..AC-3: recovery dialog', () => {
  it('retries from a fresh branch by default, or reusing the existing branch', async () => {
    const { action, onDone, view } = await dialog({ resumable: true, gitMode: true, hasWorktree: true });
    expect(within(view).getByRole('radio', { name: 'Fresh branch from the base branch' })).toBeChecked();
    await userEvent.click(within(view).getByRole('radio', { name: 'Reuse the existing branch' }));
    await userEvent.click(within(view).getByRole('button', { name: 'Retry' }));
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', storyId: 'US-001', action: 'retry', reuseBranch: true }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('resumes the agent session when supported; otherwise explains why not', async () => {
    const supported = await dialog({ resumable: true, gitMode: false, hasWorktree: false });
    expect(within(supported.view).queryByRole('radio', { name: /branch/ })).not.toBeInTheDocument();
    await userEvent.click(within(supported.view).getByRole('button', { name: 'Resume' }));
    expect(supported.action).toHaveBeenCalledWith(expect.objectContaining({ action: 'resume' }));
    cleanup();

    const unsupported = await dialog({ resumable: false, gitMode: true, hasWorktree: true });
    const resume = within(unsupported.view).getByRole('button', { name: 'Resume' });
    expect(resume).toBeDisabled();
    expect(resume).toHaveAttribute('title', 'The agent session of the last run cannot be resumed.');
  });

  it('discards to Ready and offers to remove the worktree', async () => {
    const { action, view } = await dialog({ resumable: false, gitMode: true, hasWorktree: true });
    await userEvent.click(within(view).getByRole('checkbox', { name: 'Also remove the worktree' }));
    await userEvent.click(within(view).getByRole('button', { name: 'Discard' }));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ action: 'discard', removeWorktree: true }));
  });

  it('shows a refused action', async () => {
    const session = await fakeCore({
      'runs.recovery': async () => ({ lastRunId: 'r1', resumable: false, gitMode: false, hasWorktree: false }),
      'board.runAction': async () => ({ ok: false as const, reason: 'AI functions are disabled.' }),
    });
    render(<RunRecoveryDialog session={session} projectId="p1" storyId="US-001" onDone={() => undefined} onCancel={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI functions are disabled.');
  });
});
