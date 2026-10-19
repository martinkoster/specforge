// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { KanbanBoard, type BoardData } from '../src/board/KanbanBoard.js';
import { GeneratePanel } from '../src/specs/GeneratePanel.js';
import { closeFakeCores, fakeCore, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const REASON = 'AI functions are disabled: No AI provider is configured. Complete the setup to enable them.';
const caps = (aiAvailable: boolean) => ({
  agentAvailable: true,
  providerConfigured: aiAvailable,
  gitAvailable: true,
  aiAvailable,
  missing: aiAvailable ? null : 'No AI provider is configured.',
});

const shellState = { projects: [], currentProjectId: null, vcs: null, runs: { running: 0, queued: 0 }, pendingDecisions: 0, storyCount: 0 };
const setupState = {
  setupState: 'incomplete' as const,
  steps: [
    { id: 'runtime' as const, label: 'Agent runtime', status: 'ok' as const, detail: 'Found' },
    { id: 'provider' as const, label: 'AI provider', status: 'missing' as const, detail: 'No AI provider configured.' },
    { id: 'git' as const, label: 'Git', status: 'ok' as const, detail: 'Git found' },
    { id: 'rules' as const, label: 'Tools allowed without asking', status: 'ok' as const, detail: '1 rule' },
    { id: 'defaults' as const, label: 'Execution defaults', status: 'ok' as const, detail: 'Saved.' },
    { id: 'summary' as const, label: 'Ready', status: 'warning' as const, detail: 'Some steps are incomplete.' },
  ],
};

describe('US-013 AC-3: banner while AI functions are disabled', () => {
  it('shows a persistent banner that opens the setup wizard at the first incomplete step', async () => {
    const { session } = await fakeCoreWithEvents({
      'shell.state': async () => shellState,
      'projects.recent': async () => [],
      'setup.state': async () => setupState,
      'capabilities.get': async () => caps(false),
    });
    render(<App session={session} testMode={false} />);

    const banner = await screen.findByRole('region', { name: 'AI functions disabled' });
    expect(banner).toHaveTextContent('AI functions disabled — complete setup');
    expect(banner).toHaveTextContent('No AI provider is configured.');
    await userEvent.click(within(banner).getByRole('button', { name: 'Complete setup' }));
    const steps = await screen.findByRole('navigation', { name: 'Setup steps' });
    expect(within(steps).getByRole('button', { current: 'step' })).toHaveTextContent('AI provider');
  });

  it('hides the banner once AI is available (capabilities.changed)', async () => {
    const { session, server } = await fakeCoreWithEvents({
      'shell.state': async () => shellState,
      'projects.recent': async () => [],
      'setup.state': async () => ({ ...setupState, setupState: 'complete' as const }),
      'capabilities.get': async () => caps(false),
    });
    render(<App session={session} testMode={false} />);
    await screen.findByRole('region', { name: 'AI functions disabled' });

    act(() => server.emit('capabilities.changed', caps(true)));
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'AI functions disabled' })).not.toBeInTheDocument());
  });
});

const board: BoardData = {
  columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((status) => ({
    status,
    cards:
      status === 'ready'
        ? [
            {
              storyId: 'US-001',
              title: 'Login',
              size: 'S',
              approval: 'approved' as const,
              status: 'ready' as const,
              subState: 'none' as const,
              queueReason: null,
              waitingFor: [],
              statusNotice: null,
              dependsOn: [],
              related: [],
            },
          ]
        : [],
  })),
  queue: [],
  slots: { active: 0, limit: 3 },
};

describe('US-013 AC-2: AI actions are disabled with an explanation', () => {
  it('the board does not start stories and explains why; other moves stay available', async () => {
    const onMove = vi.fn(async () => ({ ok: true as const }));
    render(<KanbanBoard board={board} onMove={onMove} aiDisabledReason={REASON} />);

    const select = screen.getByRole('combobox', { name: 'Move US-001 to' });
    const inProgress = within(select).getByRole('option', { name: 'In Progress' });
    expect(inProgress).toBeDisabled();
    expect(inProgress).toHaveAttribute('title', REASON);
    expect(screen.getByRole('region', { name: /In Progress/ })).toHaveAttribute('title', REASON);

    await userEvent.selectOptions(select, 'backlog');
    expect(onMove).toHaveBeenCalledWith('US-001', 'backlog', null);
  });

  it('the Generate button is disabled with the reason as tooltip', async () => {
    const session = await fakeCore({ 'specs.openReview': async () => null });
    render(<GeneratePanel session={session} projectId="p1" onChanged={() => undefined} aiDisabledReason={REASON} />);
    const button = screen.getByRole('button', { name: 'Generate' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', REASON);
  });
});
