// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { ReviewPanel } from '../src/review/ReviewPanel.js';
import { RejectedBranches } from '../src/review/RejectedBranches.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const result = {
  result: {
    outcome: 'success' as const,
    summary: 'Login added.',
    tests: { run: 3, passed: 3, failed: 0 },
    coverage: 88,
    changedFiles: ['src/login.ts'],
    openIssues: ['Rate limiting'],
    recommendations: [],
  },
  unavailableReason: null,
  computedFiles: [
    { path: 'README.md', change: 'M' as const, additions: 1, deletions: 1 },
    { path: 'src/login.ts', change: 'A' as const, additions: 1, deletions: 0 },
    { path: 'old.txt', change: 'D' as const, additions: 0, deletions: 2 },
  ],
};

async function renderPanel(handlers: ContractHandlers = {}) {
  const session = await fakeCore({
    'review.get': async () => ({ runId: 'r1', overlaps: [{ storyId: 'US-002', files: ['README.md'] }], gitMode: true }),
    'runs.result': async () => result,
    'review.fileVersions': async ({ path }) => ({ before: path === 'README.md' ? 'original\n' : null, after: 'changed\n', binary: false }),
    'runs.permissions': async () => [
      {
        id: 'p1',
        toolName: 'Write',
        input: { file_path: 'src/login.ts' },
        outsideWorkspace: false,
        requestedAt: '2026-10-16T10:00:00.000Z',
        decision: 'allow' as const,
        decidedBy: 'user',
        message: null,
      },
    ],
    'runs.context': async () => ({ context: '# Story US-001' }),
    'runs.events': async () => [{ seq: 1, ts: 't', type: 'output', payload: { type: 'output', text: 'Implementing login' } }],
    ...handlers,
  });
  render(<ReviewPanel session={session} projectId="p1" storyId="US-001" />);
  return screen.findByRole('region', { name: 'Review of US-001' });
}

describe('US-057 AC-1: review summary', () => {
  it('shows outcome, summary, tests, coverage, open issues and overlap warnings', async () => {
    const panel = await renderPanel();
    expect(await within(panel).findByText('Login added.')).toBeInTheDocument();
    expect(within(panel).getByText('success')).toBeInTheDocument();
    expect(within(panel).getByText('3 passed, 0 failed (3 run)')).toBeInTheDocument();
    expect(within(panel).getByText('88 %')).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Open issues' })).toHaveTextContent('Rate limiting');
    expect(within(panel).getByRole('region', { name: 'Warnings' })).toHaveTextContent('Overlaps with US-002: README.md');
  });

  it('explains a missing result or a story without runs', async () => {
    const panel = await renderPanel({
      'runs.result': async () => ({ result: null, unavailableReason: 'No result block.', computedFiles: [] }),
    });
    expect(await within(panel).findByText('Result unavailable: No result block.')).toBeInTheDocument();
    expect(within(panel).getByText('No file changes.')).toBeInTheDocument();
    cleanup();
    const session = await fakeCore({ 'review.get': async () => ({ runId: null, overlaps: [], gitMode: true }) });
    render(<ReviewPanel session={session} projectId="p1" storyId="US-001" />);
    expect(await screen.findByText('This story has no run to review yet.')).toBeInTheDocument();
  });
});

describe('US-057 AC-2: changed files with diffs', () => {
  it('lists added/modified/deleted files; selecting one shows a side-by-side or unified diff', async () => {
    const panel = await renderPanel();
    const files = await within(panel).findByRole('region', { name: 'Changed files' });
    expect(
      within(files)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('Modified README.md'),
      expect.stringContaining('Added src/login.ts'),
      expect.stringContaining('Deleted old.txt'),
    ]);

    await userEvent.click(within(files).getByRole('button', { name: 'Modified README.md' }));
    const diff = await within(panel).findByRole('region', { name: 'Diff of README.md' });
    await vi.waitFor(() => expect(within(diff).getByTestId('diff-view')).toHaveClass('diff-view-side-by-side'));
    expect(within(diff).getByTestId('diff-view').textContent).toContain('original');
    expect(within(diff).getByTestId('diff-view').textContent).toContain('changed');

    await userEvent.click(within(diff).getByRole('radio', { name: 'Unified' }));
    expect(within(diff).getByTestId('diff-view')).toHaveClass('diff-view-unified');
  });

  it('shows binary files without a text diff', async () => {
    const panel = await renderPanel({ 'review.fileVersions': async () => ({ before: null, after: null, binary: true }) });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Added src/login.ts' }));
    expect(await within(panel).findByText('Binary file — no text diff.')).toBeInTheDocument();
  });
});

describe('US-057 AC-3: Log, Permissions, Context tabs and Open in editor', () => {
  it('switches between the tabs', async () => {
    const panel = await renderPanel();
    await userEvent.click(within(panel).getByRole('tab', { name: 'Permissions' }));
    expect(await within(panel).findByRole('table', { name: 'Permission requests' })).toHaveTextContent('Write');
    await userEvent.click(within(panel).getByRole('tab', { name: 'Context' }));
    expect(await within(panel).findByText('# Story US-001')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('tab', { name: 'Log' }));
    expect(await within(panel).findByText('Implementing login')).toBeInTheDocument();
  });

  it('opens a changed file in the editor; deleted files have no such action', async () => {
    const openFile = vi.fn(async () => ({ ok: true as const }));
    const panel = await renderPanel({ 'review.openFile': openFile });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Open src/login.ts in editor' }));
    expect(openFile).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', runId: 'r1', path: 'src/login.ts' }));
    expect(within(panel).queryByRole('button', { name: 'Open old.txt in editor' })).not.toBeInTheDocument();
  });
});

describe('US-057: review in the story drawer', () => {
  it('shows the review content for stories in Review', async () => {
    const { KanbanBoard } = await import('../src/board/KanbanBoard.js');
    const card = {
      storyId: 'US-001',
      title: 'Login',
      size: 'S',
      approval: 'approved' as const,
      status: 'review' as const,
      subState: 'none' as const,
      queueReason: null,
      waitingFor: [],
      statusNotice: null,
      dependsOn: [],
      related: [],
    };
    const board = {
      columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((status) => ({
        status,
        cards: status === 'review' ? [card] : [],
      })),
      queue: [],
      slots: { active: 0, limit: 3 },
    };
    render(<KanbanBoard board={board} onMove={async () => ({ ok: true })} renderReview={(id) => <p>Review content of {id}</p>} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open US-001' }));
    expect(screen.getByText('Review content of US-001')).toBeInTheDocument();
  });
});

describe('US-058: approve or reject in the review', () => {
  it('AC-1: approve shows the merge instructions (predecessors first); SpecForge does not merge', async () => {
    const approve = vi.fn(async () => ({
      ok: true as const,
      merge: {
        baseBranch: 'main',
        order: [
          { storyId: 'US-000', branch: 'specforge/US-000' },
          { storyId: 'US-001', branch: 'specforge/US-001' },
        ],
      },
    }));
    const onDecided = vi.fn();
    const session = await fakeCore({
      'review.get': async () => ({ runId: 'r1', overlaps: [], gitMode: true }),
      'runs.result': async () => result,
      'review.approve': approve,
    });
    render(<ReviewPanel session={session} projectId="p1" storyId="US-001" onDecided={onDecided} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', storyId: 'US-001' }));
    const merge = await screen.findByRole('region', { name: 'Merge instructions' });
    expect(
      within(merge)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Merge specforge/US-000 (US-000) into main', 'Merge specforge/US-001 (US-001) into main']);
    expect(merge).toHaveTextContent('SpecForge does not merge');
    expect(onDecided).toHaveBeenCalled();
  });

  it("AC-2: reject with an optional reason; non-git offers restoring the run's files", async () => {
    const reject = vi.fn(async () => ({ ok: true as const }));
    const session = await fakeCore({
      'review.get': async () => ({ runId: 'r1', overlaps: [], gitMode: false }),
      'runs.result': async () => result,
      'review.reject': reject,
    });
    render(<ReviewPanel session={session} projectId="p1" storyId="US-001" onDecided={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'Wrong approach');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Restore the files the run changed' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'US-001', reason: 'Wrong approach', restoreSnapshot: true }));
  });

  it('shows refused decisions; git mode has no restore option', async () => {
    const session = await fakeCore({
      'review.get': async () => ({ runId: 'r1', overlaps: [], gitMode: true }),
      'runs.result': async () => result,
      'review.reject': async () => ({ ok: false as const, reason: 'reject is not allowed from done/none.' }),
    });
    render(<ReviewPanel session={session} projectId="p1" storyId="US-001" onDecided={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject…' }));
    expect(screen.queryByRole('checkbox', { name: 'Restore the files the run changed' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed');
  });
});

describe('US-058 AC-2: rejected branches stay visible', () => {
  it('lists the retained branches that were marked rejected', async () => {
    const session = await fakeCore({ 'review.rejectedBranches': async () => ['specforge/US-001'] });
    render(<RejectedBranches session={session} projectId="p1" storyId="US-001" />);
    expect(await screen.findByText('specforge/US-001')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rejected branches' })).toHaveTextContent(/Retained/);
  });

  it('shows nothing without rejected branches', async () => {
    const query = vi.fn(async () => []);
    const session = await fakeCore({ 'review.rejectedBranches': query });
    const { container } = render(<RejectedBranches session={session} projectId="p1" storyId="US-001" />);
    await vi.waitFor(() => expect(query).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('US-059: request corrections', () => {
  async function renderCorrections(options: { resumable: boolean; reason: string | null }) {
    const request = vi.fn(async () => ({ ok: true as const }));
    const decided = vi.fn();
    const session = await fakeCore({
      'review.get': async () => ({ runId: 'r1', overlaps: [], gitMode: true }),
      'runs.result': async () => result,
      'review.correctionOptions': async () => options,
      'review.requestCorrections': request,
    });
    render(<ReviewPanel session={session} projectId="p1" storyId="US-001" onDecided={decided} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Request corrections…' }));
    return { request, decided };
  }

  it('AC-1/AC-2: sends the feedback; the agent continues its session', async () => {
    const { request, decided } = await renderCorrections({ resumable: true, reason: null });
    const send = screen.getByRole('button', { name: 'Send to the agent' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Feedback for the agent' }), 'The sender is wrong.');
    await userEvent.click(send);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'US-001', feedback: 'The sender is wrong.' }));
    expect(request).toHaveBeenCalledWith(expect.not.objectContaining({ fresh: true }));
    expect(decided).toHaveBeenCalled();
  });

  it('AC-3: without a resumable session it offers a fresh run on the same branch', async () => {
    const { request } = await renderCorrections({ resumable: false, reason: 'The agent cannot resume sessions.' });
    expect(screen.getByRole('note')).toHaveTextContent(
      'The agent session cannot be resumed (The agent cannot resume sessions.). A fresh run on the same branch gets your feedback and the previous summary.',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Feedback for the agent' }), 'Fix it.');
    await userEvent.click(screen.getByRole('button', { name: 'Start a fresh run on the same branch' }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ feedback: 'Fix it.', fresh: true }));
  });
});
