// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { ArtifactAiPanel, headingLine, sectionsOf } from '../src/specs/ArtifactAiPanel.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const PATH = 'spec/02_requirements/functional_requirements.md';
const CONTENT = '---\nkind: requirements\n---\n# Requirements\n\n### FR-001: Login\nText\n\n### FR-002: Logout\n';
const finding = (
  id: string,
  severity: 'critical' | 'major' | 'minor' | 'info',
  state: 'open' | 'applied' | 'dismissed' = 'open',
  elementId: string | null = 'FR-001',
) => ({
  id,
  artifactPath: PATH,
  elementId,
  severity,
  category: 'clarity',
  explanation: `Explanation ${id}`,
  suggestedFix: `Fix ${id}`,
  state,
  dismissReason: state === 'dismissed' ? 'Intentional.' : null,
  fixRunId: null,
});
const review = (runId: string, state: 'running' | 'open' = 'open') => ({
  runId,
  projectId: 'p1',
  target: PATH,
  kind: 'refine',
  instruction: 'x',
  snapshotId: 's',
  parentRunId: null,
  state,
  files: [{ path: PATH, change: 'M' as const, patch: '-old\n+new' }],
  issues: [],
  reason: null,
  createdAt: 't',
});

async function renderPanel(handlers: ContractHandlers = {}, props: { aiDisabledReason?: string | null } = {}) {
  const onJump = vi.fn();
  const onChanged = vi.fn();
  const core = await fakeCoreWithEvents({
    'quality.findings': async () => [
      finding('f2', 'minor', 'open', 'FR-002'),
      finding('f1', 'critical'),
      finding('f3', 'info', 'dismissed', null),
    ],
    ...handlers,
  });
  render(
    <ArtifactAiPanel
      session={core.session}
      projectId="p1"
      path={PATH}
      content={CONTENT}
      onJump={onJump}
      onChanged={onChanged}
      {...props}
    />,
  );
  return { ...core, onJump, onChanged };
}

describe('US-030: refine with AI', () => {
  it('AC-1: refines the artifact or a chosen section with an instruction; AC-2: the result is reviewed as a diff', async () => {
    const refine = vi.fn(async () => ({ ok: true as const, runId: 'r1' }));
    let state: 'running' | 'open' = 'running';
    const keep = vi.fn(async () => ({ ok: true as const }));
    const { server, onChanged } = await renderPanel({
      'specs.refine': refine,
      'specs.review': async ({ runId }) => review(runId, state),
      'specs.keep': keep,
    });

    const section = screen.getByRole('combobox', { name: 'Section' });
    expect(
      within(section)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whole artifact', 'FR-001: Login', 'FR-002: Logout']);
    await userEvent.selectOptions(section, 'FR-002: Logout');
    await userEvent.type(screen.getByRole('textbox', { name: 'Refine instruction' }), 'Make it measurable.');
    await userEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));

    expect(refine).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', path: PATH, section: 'FR-002: Logout', instruction: 'Make it measurable.' }),
    );
    expect(await screen.findByText(/The agent is working on a proposal/)).toBeInTheDocument();

    state = 'open';
    act(() => server.emit('spec.reviewReady', { projectId: 'p1', runId: 'r1', state: 'open' }));
    const dialog = await screen.findByRole('dialog', { name: `Review changes in ${PATH}` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect(keep).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('is disabled while AI functions are disabled', async () => {
    await renderPanel({}, { aiDisabledReason: 'AI functions are disabled.' });
    expect(screen.getByRole('button', { name: 'Refine with AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quality check' })).toHaveAttribute('title', 'AI functions are disabled.');
  });

  it('extracts the sections and their lines from the artifact', () => {
    expect(sectionsOf(CONTENT)).toEqual(['FR-001: Login', 'FR-002: Logout']);
    expect(headingLine(CONTENT, 'FR-002')).toBe(9);
    expect(headingLine(CONTENT, 'FR-404')).toBeNull();
  });
});

describe('US-029: quality check panel', () => {
  it('AC-1/AC-4: runs a quality check and shows the open findings count as badge', async () => {
    const check = vi.fn(async () => ({ ok: true as const, runId: 'q1' }));
    const { server } = await renderPanel({ 'quality.check': check });
    expect(await screen.findByText('2 open findings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quality check' }));
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', path: PATH }));
    expect(screen.getByRole('status')).toHaveTextContent('Quality check running…');
    act(() => server.emit('quality.checked', { projectId: 'p1', path: PATH, runId: 'q1' }));
    await vi.waitFor(() => expect(screen.queryByText('Quality check running…')).not.toBeInTheDocument());
  });

  it('AC-2: lists findings by severity; clicking the location jumps to it', async () => {
    const { onJump } = await renderPanel();
    const list = await screen.findByRole('list', { name: 'Findings' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-severity')),
    ).toEqual(['critical', 'minor', 'info']);
    await userEvent.click(within(list).getByRole('button', { name: 'Go to FR-002' }));
    expect(onJump).toHaveBeenCalledWith('FR-002');
    expect(within(list).getByText(/Dismissed: Intentional\./)).toBeInTheDocument();
  });

  it('AC-3: Apply fix opens the proposal review; Dismiss records a reason', async () => {
    const applyFix = vi.fn(async () => ({ ok: true as const, runId: 'fix1' }));
    const dismiss = vi.fn(async () => ({ ok: true as const }));
    const { server } = await renderPanel({
      'quality.applyFix': applyFix,
      'quality.dismiss': dismiss,
      'specs.review': async ({ runId }) => review(runId),
    });
    const list = await screen.findByRole('list', { name: 'Findings' });
    const critical = within(list).getAllByRole('listitem')[0]!;

    await userEvent.click(within(critical).getByRole('button', { name: 'Apply fix' }));
    expect(applyFix).toHaveBeenCalledWith(expect.objectContaining({ findingId: 'f1' }));
    act(() => server.emit('spec.reviewReady', { projectId: 'p1', runId: 'fix1', state: 'open' }));
    expect(await screen.findByRole('dialog', { name: `Review changes in ${PATH}` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Decide later' }));

    const minor = within(list).getAllByRole('listitem')[1]!;
    await userEvent.click(within(minor).getByRole('button', { name: 'Dismiss' }));
    await userEvent.type(within(minor).getByRole('textbox', { name: 'Reason' }), 'Wording is intended.');
    await userEvent.click(within(minor).getByRole('button', { name: 'Confirm dismiss' }));
    expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ findingId: 'f2', reason: 'Wording is intended.' }));
  });

  it('shows refused actions', async () => {
    await renderPanel({ 'quality.check': async () => ({ ok: false as const, reason: 'No agent adapter.' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Quality check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No agent adapter.');
  });
});
