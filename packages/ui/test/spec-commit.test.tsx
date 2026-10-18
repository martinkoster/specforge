// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/shell/AppShell.js';
import { CommitSpecDialog } from '../src/shell/CommitSpecDialog.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const state = {
  projects: [{ id: 'p1', name: 'Tasks' }],
  currentProjectId: 'p1',
  vcs: { mode: 'git' as const, branch: 'main' },
  runs: { running: 0, queued: 0 },
  pendingDecisions: 0,
  storyCount: 0,
};

const files = [
  { path: 'spec/02_requirements/fr.md', change: 'M' as const },
  { path: 'spec/02_requirements/nfr.md', change: 'A' as const },
];

describe('US-023 AC-1: top bar indicator', () => {
  it('shows "n spec files changed" in git mode and opens the commit dialog', async () => {
    const onOpen = vi.fn();
    const props = {
      state,
      coreStatus: 'connected' as const,
      active: 'dashboard' as const,
      onNavigate: () => undefined,
      onSwitchProject: () => undefined,
      onOpenPendingDecisions: () => undefined,
      onOpenSpecCommit: onOpen,
    };
    const { rerender } = render(<AppShell {...props} specChanges={2} />);
    await userEvent.click(screen.getByRole('button', { name: '2 spec files changed' }));
    expect(onOpen).toHaveBeenCalled();

    rerender(<AppShell {...props} specChanges={1} />);
    expect(screen.getByRole('button', { name: '1 spec file changed' })).toBeInTheDocument();
    rerender(<AppShell {...props} specChanges={0} />);
    expect(screen.queryByRole('button', { name: /spec files? changed/ })).not.toBeInTheDocument();
  });
});

describe('US-023 AC-2/AC-3: commit dialog', () => {
  it('lists the files with diffs and a generated message; commits exactly these paths with the edited message', async () => {
    const commit = vi.fn(async () => ({ ok: true as const, commit: 'abc' }));
    const onDone = vi.fn();
    const session = await fakeCore({
      'specCommit.status': async () => ({ files, message: 'Update specification: 02_requirements\n\nM spec/02_requirements/fr.md' }),
      'specCommit.diff': async ({ path }) => ({ patch: `--- a/${path}\n+++ b/${path}\n+new line in ${path}` }),
      'specCommit.commit': commit,
    });
    render(<CommitSpecDialog session={session} projectId="p1" onDone={onDone} onCancel={() => undefined} />);

    const dialog = await screen.findByRole('dialog', { name: 'Commit spec changes' });
    expect(await within(dialog).findByText('+new line in spec/02_requirements/nfr.md')).toBeInTheDocument();
    expect(within(dialog).getByText('Modified')).toBeInTheDocument();
    const message = within(dialog).getByRole('textbox', { name: 'Commit message' });
    expect(message).toHaveValue('Update specification: 02_requirements\n\nM spec/02_requirements/fr.md');
    await userEvent.clear(message);
    await userEvent.type(message, 'Refine requirements');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Commit 2 files' }));

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        paths: ['spec/02_requirements/fr.md', 'spec/02_requirements/nfr.md'],
        message: 'Refine requirements',
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the output of failing Git hooks and stays open', async () => {
    const onDone = vi.fn();
    const session = await fakeCore({
      'specCommit.status': async () => ({ files, message: 'Update specification' }),
      'specCommit.diff': async () => ({ patch: '' }),
      'specCommit.commit': async () => ({ ok: false as const, output: 'lint failed: trailing whitespace' }),
    });
    render(<CommitSpecDialog session={session} projectId="p1" onDone={onDone} onCancel={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Commit 2 files' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('lint failed: trailing whitespace');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows that there is nothing to commit; Cancel closes', async () => {
    const onCancel = vi.fn();
    const session = await fakeCore({ 'specCommit.status': async () => ({ files: [], message: '' }) });
    render(<CommitSpecDialog session={session} projectId="p1" onDone={() => undefined} onCancel={onCancel} />);
    expect(await screen.findByText('No uncommitted specification files.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Commit/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
