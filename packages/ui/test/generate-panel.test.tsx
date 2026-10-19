// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { GeneratePanel } from '../src/specs/GeneratePanel.js';
import type { SpecReview } from '../src/specs/ReviewChangesDialog.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const review = (over: Partial<SpecReview> = {}): SpecReview => ({
  runId: 'run-1',
  projectId: 'p1',
  target: 'spec/02_requirements',
  kind: 'generate',
  instruction: 'Generate',
  snapshotId: 'snap',
  parentRunId: null,
  state: 'open',
  files: [
    {
      path: 'spec/02_requirements/fr.md',
      change: 'M',
      patch: 'Index: fr.md\n===\n--- fr.md\n+++ fr.md\n@@ -1 +1 @@\n-### FR-001: Old\n+### FR-001: Login',
    },
  ],
  issues: [],
  reason: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  ...over,
});

async function renderPanel(handlers: ContractHandlers = {}) {
  const onChanged = vi.fn();
  const core = await fakeCoreWithEvents({
    'specs.openReview': async () => null,
    'artifacts.generationCheck': async () => ({ drafts: [], warning: null }),
    ...handlers,
  });
  render(<GeneratePanel session={core.session} projectId="p1" onChanged={onChanged} />);
  return { ...core, onChanged };
}

describe('US-027: generate and review specification changes', () => {
  it('AC-1/AC-3: starts the run for the chosen target, then shows the review when it is ready', async () => {
    const generate = vi.fn(async () => ({ ok: true as const, runId: 'run-1' }));
    let state: SpecReview['state'] = 'running';
    const { server } = await renderPanel({
      'specs.generate': generate,
      'specs.review': async () => review({ state, target: 'spec/03_design' }),
    });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'design');
    expect(screen.getByRole('textbox', { name: 'Instruction' })).toHaveValue(
      'Generate the functional and technical design from the approved requirements.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/Generating…/)).toBeInTheDocument();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        target: 'design',
        instruction: 'Generate the functional and technical design from the approved requirements.',
      }),
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();

    state = 'open';
    act(() => server.emit('spec.reviewReady', { projectId: 'p1', runId: 'run-1', state: 'open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes in spec/03_design' });
    expect(within(dialog).getByText('1 file changed')).toBeInTheDocument();
    expect(within(dialog).getByText('+### FR-001: Login')).toHaveClass('diff-add');
    expect(within(dialog).getByText('-### FR-001: Old')).toHaveClass('diff-del');
    expect(within(dialog).queryByText(/^Index:/)).not.toBeInTheDocument();
  });

  it('asks for confirmation when inputs are still Draft (US-026)', async () => {
    const generate = vi.fn(async () => ({ ok: true as const, runId: 'run-1' }));
    await renderPanel({
      'artifacts.generationCheck': async () => ({ drafts: ['spec/01_intent/intent.md'], warning: 'Some inputs are still Draft.' }),
      'specs.generate': generate,
      'specs.review': async () => review({ state: 'running' }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Inputs are still Draft' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(generate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue anyway' }));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it('shows why a run could not start', async () => {
    await renderPanel({
      'specs.generate': async () => ({ ok: false as const, reason: 'A specification run for spec/02_requirements is still running.' }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still running');
  });

  it('AC-3: Keep and Discard decide the resumed open review and refresh the artifacts', async () => {
    const keep = vi.fn(async () => ({ ok: true as const }));
    const discard = vi.fn(async () => ({ ok: true as const }));
    const { onChanged } = await renderPanel({
      'specs.openReview': async () => review(),
      'specs.keep': keep,
      'specs.discard': discard,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Review changes' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep' }));
    expect(keep).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();
  });

  it('AC-3: Discard; a refused decision is shown in the dialog; Decide later closes it', async () => {
    const discard = vi.fn(async () => ({ ok: false as const, reason: 'This review is already closed.' }));
    await renderPanel({ 'specs.openReview': async () => review({ state: 'failed', reason: 'Agent crashed' }), 'specs.discard': discard });

    await userEvent.click(await screen.findByRole('button', { name: 'Review changes' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('The run failed: Agent crashed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This review is already closed.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Decide later' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-4: lists validation issues; Ask agent to fix starts the follow-up run', async () => {
    const fix = vi.fn(async () => ({ ok: true as const, runId: 'run-2' }));
    await renderPanel({
      'specs.openReview': async () =>
        review({
          issues: [{ path: 'spec/02_requirements/fr.md', kind: 'broken_link', message: 'FR-001 references FR-404, which does not exist.' }],
        }),
      'specs.fix': fix,
      'specs.review': async ({ runId }) => review({ runId, state: 'running' }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Review changes' }));
    const issues = within(screen.getByRole('dialog')).getByRole('region', { name: 'Validation issues' });
    expect(issues).toHaveTextContent('spec/02_requirements/fr.md: FR-001 references FR-404, which does not exist.');

    await userEvent.click(within(issues).getByRole('button', { name: 'Ask agent to fix' }));
    expect(fix).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }));
    expect(await screen.findByText(/Generating…/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows files without a text diff and an empty change set', async () => {
    await renderPanel({
      'specs.openReview': async () => review({ files: [{ path: 'spec/02_requirements/img.png', change: 'A' }] }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('No text diff available.')).toBeInTheDocument();
    cleanup();
    await renderPanel({ 'specs.openReview': async () => review({ files: [] }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('No files changed')).toBeInTheDocument();
  });
});

describe('US-036 AC-1: generate stories for all or selected approved epics', () => {
  it('lists the approved epics (all selected) and passes the chosen ones', async () => {
    const generate = vi.fn(async () => ({ ok: true as const, runId: 'run-1' }));
    await renderPanel({
      'specs.generate': generate,
      'specs.review': async () => review({ state: 'running' }),
      'epics.list': async () => ({
        epics: [
          { id: 'EP-001', title: 'Login', approval: 'approved' as const, path: 'a', stories: [], requirements: [] },
          { id: 'EP-002', title: 'Profile', approval: 'approved' as const, path: 'b', stories: [], requirements: [] },
          { id: 'EP-003', title: 'Draft one', approval: 'draft' as const, path: 'c', stories: [], requirements: [] },
        ],
        uncovered: [],
      }),
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'stories');
    const epics = await screen.findByRole('group', { name: 'Epics' });
    expect(
      within(epics)
        .getAllByRole('checkbox')
        .map((c) => [c.getAttribute('aria-label') ?? (c as HTMLInputElement).labels?.[0]?.textContent, (c as HTMLInputElement).checked]),
    ).toEqual([
      ['EP-001 Login', true],
      ['EP-002 Profile', true],
    ]);
    await userEvent.click(within(epics).getByRole('checkbox', { name: 'EP-002 Profile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledWith(expect.objectContaining({ target: 'stories', epicIds: ['EP-001'] })));
  });
});
