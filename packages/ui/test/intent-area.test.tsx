// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcError, type ContractHandlers, type QueryOutput } from '@specforge/ipc-contract';
import { ClarificationPanel } from '../src/intent/ClarificationPanel.js';
import { IntentArea } from '../src/intent/IntentArea.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const INTENT = 'spec/01_intent/intent.md';
type Clarification = NonNullable<QueryOutput<'clarify.current'>>;
const clarification = (over: Partial<Clarification> = {}): Clarification => ({
  id: 'c1',
  intentPath: INTENT,
  state: 'awaiting_answers',
  items: [
    { id: 'q1', type: 'question', text: 'Who are the users?', options: [], answer: null },
    { id: 'a1', type: 'assumption', text: 'Single-user desktop app.', options: [], answer: null },
    { id: 'alt1', type: 'alternative', text: 'Web or desktop?', options: ['Web', 'Desktop'], answer: null },
    { id: 'am1', type: 'ambiguity', text: '"Fast" is not defined.', options: [], answer: 'Under 2 s' },
  ],
  proposalRunId: null,
  reason: null,
  ...over,
});

describe('US-028 AC-1: intent editor with template', () => {
  it('offers the template when no intent exists, then opens it in the editor', async () => {
    let exists = false;
    const create = vi.fn(async () => {
      exists = true;
      return { path: INTENT };
    });
    const { session } = await fakeCoreWithEvents({
      'artifact.read': async () => {
        if (!exists) throw new IpcError('NOT_FOUND', 'not indexed');
        return { content: '---\nkind: intent\n---\n## Vision\n', hash: 'h1' };
      },
      'artifacts.list': async () => [
        {
          kind: 'intent',
          label: 'Intent',
          artifacts: [{ path: INTENT, approval: 'draft' as const, invalid: null }],
        },
      ],
      'intent.create': create,
      'clarify.current': async () => null,
      'quality.findings': async () => [],
    });
    render(<IntentArea session={session} projectId="p1" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Start from the template' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
    expect(await screen.findByText(INTENT)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Analyse intent' })).toBeInTheDocument();
  });
});

async function renderPanel(record: Clarification | null, handlers: ContractHandlers = {}) {
  const core = await fakeCoreWithEvents({ 'clarify.current': async () => record, ...handlers });
  const onChanged = vi.fn();
  render(<ClarificationPanel session={core.session} projectId="p1" path={INTENT} onChanged={onChanged} />);
  return { ...core, onChanged };
}

describe('US-028 AC-2/AC-3: clarification cards and answers', () => {
  it('Analyse intent starts the dialogue; running rounds are shown', async () => {
    const start = vi.fn(async () => ({ ok: true as const, clarificationId: 'c1' }));
    let record: Clarification | null = null;
    const { server } = await renderPanel(null, { 'clarify.start': start, 'clarify.current': async () => record });
    await userEvent.click(await screen.findByRole('button', { name: 'Analyse intent' }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', path: INTENT }));
    record = clarification({ state: 'running', items: [] });
    act(() => server.emit('clarify.updated', { projectId: 'p1', clarificationId: 'c1', state: 'running' }));
    expect(await screen.findByText('The agent is analysing…')).toBeInTheDocument();
  });

  it('shows questions, ambiguities, alternatives and assumptions as cards and submits the answers', async () => {
    const answer = vi.fn(async () => ({ ok: true as const }));
    await renderPanel(clarification(), { 'clarify.answer': answer });
    const cards = await screen.findByRole('list', { name: 'Clarification items' });
    expect(
      within(cards)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-type')),
    ).toEqual(['question', 'assumption', 'alternative', 'ambiguity']);

    await userEvent.type(within(cards).getByRole('textbox', { name: 'Answer to: Who are the users?' }), 'Product owners');
    await userEvent.click(within(cards).getByRole('button', { name: 'Accept assumption: Single-user desktop app.' }));
    await userEvent.click(within(cards).getByRole('radio', { name: 'Desktop' }));
    expect(within(cards).getByRole('textbox', { name: 'Answer to: "Fast" is not defined.' })).toHaveValue('Under 2 s');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({
        clarificationId: 'c1',
        answers: { q1: 'Product owners', a1: 'accepted', alt1: 'Desktop', am1: 'Under 2 s' },
      }),
    );
  });

  it('Finish proposes the Clarified decisions section; the proposal is reviewed', async () => {
    const finish = vi.fn(async () => ({ ok: true as const, runId: 'p1run' }));
    const keep = vi.fn(async () => ({ ok: true as const }));
    const { server, onChanged } = await renderPanel(clarification({ state: 'complete' }), {
      'clarify.finish': finish,
      'specs.keep': keep,
      'specs.review': async ({ runId }) => ({
        runId,
        projectId: 'p1',
        target: INTENT,
        kind: 'refine',
        instruction: 'x',
        snapshotId: 's',
        parentRunId: null,
        state: 'open' as const,
        files: [{ path: INTENT, change: 'M' as const, patch: '+## Clarified decisions' }],
        issues: [],
        reason: null,
        createdAt: 't',
      }),
    });
    expect(await screen.findByText(/No further questions/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish and propose Clarified decisions' }));
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ clarificationId: 'c1' }));
    act(() => server.emit('spec.reviewReady', { projectId: 'p1', runId: 'p1run', state: 'open' }));
    const dialog = await screen.findByRole('dialog', { name: `Review changes in ${INTENT}` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect(keep).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('US-028 AC-4: cancel keeps the answers as a draft', () => {
  it('cancels the dialogue; a cancelled dialogue keeps answers, can save the draft and continue', async () => {
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const saveDraft = vi.fn(async () => ({ ok: true as const }));
    const { unmount } = (await renderPanel(clarification(), { 'clarify.cancel': cancel }), { unmount: cleanup });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel dialogue' }));
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ clarificationId: 'c1' }));
    unmount();

    await renderPanel(clarification({ state: 'cancelled' }), { 'clarify.saveDraft': saveDraft });
    expect(await screen.findByText(/Cancelled — your answers are kept as a draft/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Answer to: Who are the users?' }), 'Owners');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ clarificationId: 'c1', answers: expect.objectContaining({ q1: 'Owners' }) }),
    );
    expect(screen.getByRole('button', { name: 'Submit answers' })).toBeInTheDocument();
  });

  it('shows failures and refusals', async () => {
    await renderPanel(clarification({ state: 'failed', reason: 'The agent returned no valid clarification block.' }), {
      'clarify.start': async () => ({ ok: false as const, reason: 'AI functions are disabled.' }),
    });
    expect(await screen.findByText(/The agent returned no valid clarification block/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Analyse intent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI functions are disabled.');
  });
});

describe('US-028 AC-1: editing and approving the intent', () => {
  it('saves (back to Draft), approves, jumps to a finding and reports a refused template', async () => {
    let approval: 'draft' | 'approved' = 'draft';
    const save = vi.fn(async () => ({ ok: true as const, hash: 'h2' }));
    const approve = vi.fn(async () => {
      approval = 'approved';
      return { ok: true as const, hash: 'h3' };
    });
    const { session } = await fakeCoreWithEvents({
      'artifact.read': async () => ({ content: '---\nkind: intent\n---\n### FR-001: Goal\n', hash: 'h1' }),
      'artifacts.list': async () => [{ kind: 'intent', label: 'Intent', artifacts: [{ path: INTENT, approval, invalid: null }] }],
      'artifact.save': save,
      'artifact.approve': approve,
      'clarify.current': async () => null,
      'quality.findings': async () => [
        {
          id: 'f1',
          artifactPath: INTENT,
          elementId: 'FR-001',
          severity: 'major' as const,
          category: 'clarity',
          explanation: 'Vague.',
          suggestedFix: 'Be precise.',
          state: 'open' as const,
          dismissReason: null,
          fixRunId: null,
        },
      ],
    });
    render(<IntentArea session={session} projectId="p1" />);

    expect(await screen.findAllByText('1 open finding')).not.toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', path: INTENT }));
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to FR-001' }));
    expect(screen.getByRole('textbox', { name: `Edit ${INTENT}` })).toBeInTheDocument();
  });

  it('shows why the template could not be created', async () => {
    const { session } = await fakeCoreWithEvents({
      'artifact.read': async () => {
        throw new IpcError('NOT_FOUND', 'missing');
      },
      'intent.create': async () => {
        throw new IpcError('CONFLICT', 'spec/01_intent/intent.md already exists.');
      },
    });
    render(<IntentArea session={session} projectId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start from the template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
