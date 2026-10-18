// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingDecisionsPanel, type PendingGroups } from '../src/pending/PendingDecisionsPanel.js';
import { PermissionPrompt, type PendingPermissionView } from '../src/pending/PermissionPrompt.js';

afterEach(cleanup);

const permission = (overrides: Partial<PendingPermissionView> = {}): PendingPermissionView => ({
  id: 'q1',
  runId: 'run-12345678-abcd',
  projectId: 'p1',
  runKind: 'implement',
  toolName: 'Bash',
  input: { command: 'npm test' },
  cwd: 'C:\\wt\\US-001',
  outsideWorkspace: false,
  requestedAt: '2026-10-15T12:00:00.000Z',
  ...overrides,
});

describe('US-053 AC-1: permission prompt', () => {
  it('shows story, run, tool, arguments and working directory; Allow decides', async () => {
    const onDecide = vi.fn(async () => ({ ok: true as const }));
    render(<PermissionPrompt storyId="US-001" permission={permission()} onDecide={onDecide} />);
    const prompt = screen.getByRole('group', { name: 'US-001 asks to use Bash' });

    expect(prompt).toHaveTextContent('Run run-1234');
    expect(within(prompt).getByText('npm test')).toBeInTheDocument();
    expect(prompt).toHaveTextContent('C:\\wt\\US-001');
    expect(within(prompt).queryByText('Outside workspace')).not.toBeInTheDocument();

    await userEvent.click(within(prompt).getByRole('button', { name: 'Allow' }));
    expect(onDecide).toHaveBeenCalledWith({ decision: 'allow' });
  });

  it('denies with a message and offers "Always allow for this project"', async () => {
    const onDecide = vi.fn(async () => ({ ok: true as const }));
    render(<PermissionPrompt storyId="US-001" permission={permission()} onDecide={onDecide} />);

    await userEvent.click(screen.getByRole('button', { name: 'Always allow for this project' }));
    expect(onDecide).toHaveBeenLastCalledWith({ decision: 'allow', alwaysAllow: true });

    await userEvent.type(screen.getByRole('textbox', { name: 'Message to the agent (optional)' }), 'Use pnpm instead');
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDecide).toHaveBeenLastCalledWith({ decision: 'deny', message: 'Use pnpm instead' });
  });

  it('flags outside-workspace requests and never offers "Always allow" for them', () => {
    render(
      <PermissionPrompt
        storyId="US-001"
        permission={permission({ toolName: 'Read', input: { file_path: 'C:\\Windows\\win.ini' }, outsideWorkspace: true })}
        onDecide={vi.fn()}
      />,
    );

    expect(screen.getByText('Outside workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Always allow for this project' })).not.toBeInTheDocument();
    expect(screen.getByText(/"file_path": "C:\\\\Windows\\\\win.ini"/)).toBeInTheDocument();
  });

  it('shows why a decision failed', async () => {
    render(
      <PermissionPrompt
        storyId={null}
        permission={permission()}
        onDecide={vi.fn(async () => ({ ok: false as const, reason: 'Commands with shell operators cannot be allowed by a rule.' }))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Always allow for this project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('shell operators');
  });
});

describe('US-053 AC-2: pending decisions panel', () => {
  const groups: PendingGroups = [
    { storyId: 'US-001', title: 'Login', items: [{ kind: 'permission', permission: permission() }] },
    { storyId: 'US-003', title: 'Export', items: [{ kind: 'failed', detail: 'Failed: The agent crashed.' }] },
    { storyId: 'US-005', title: 'Import', items: [{ kind: 'blocked', detail: 'Conflicting files: src/a.ts' }] },
    { storyId: 'US-002', title: 'Signup', items: [{ kind: 'review', detail: 'Ready for your review' }] },
    {
      storyId: null,
      runId: 'run-spec',
      title: 'Run run-spec',
      items: [{ kind: 'recommendation', detail: 'Approve the requirements', id: 'r1', runId: 'run-spec' }],
    },
  ];

  it('lists all kinds of decisions grouped by story/run with the prompt inline', async () => {
    const onOpenBoard = vi.fn();
    render(
      <PendingDecisionsPanel
        groups={groups}
        onDecide={vi.fn(async () => ({ ok: true as const }))}
        onOpenBoard={onOpenBoard}
        onClose={vi.fn()}
      />,
    );
    const panel = screen.getByRole('dialog', { name: 'Pending decisions (5)' });

    expect(
      within(panel)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['US-001 Login', 'US-003 Export', 'US-005 Import', 'US-002 Signup', 'Run run-spec']);
    expect(within(panel).getByRole('group', { name: 'US-001 asks to use Bash' })).toBeInTheDocument();
    expect(within(panel).getByText('Failed: The agent crashed.')).toBeInTheDocument();
    expect(within(panel).getByText('Conflicting files: src/a.ts')).toBeInTheDocument();
    expect(within(panel).getByText('Approve the requirements')).toBeInTheDocument();

    await userEvent.click(
      within(within(panel).getByRole('region', { name: 'US-002 Signup' })).getByRole('button', { name: 'Open on the board' }),
    );
    expect(onOpenBoard).toHaveBeenCalledWith('US-002');
  });

  it('says when nothing is waiting', () => {
    render(<PendingDecisionsPanel groups={[]} onDecide={vi.fn()} onOpenBoard={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Nothing is waiting for you.')).toBeInTheDocument();
  });
});
