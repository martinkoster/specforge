// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers, QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { FeatureWizard } from '../src/features/FeatureWizard.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Wizard = NonNullable<QueryOutput<'features.wizard.get'>>;
type Review = NonNullable<Wizard['draft']['review']>;

const READY: Review = {
  state: 'ready',
  runId: 'run-1',
  reason: null,
  parts: [
    { id: 'problem-0', section: 'problem', text: 'Users can comment on tasks', origin: 'user', removed: false },
    { id: 'goal-0', section: 'goal', text: 'Users comment on tasks and mention teammates.', origin: 'ai', removed: false },
    { id: 'assumptions-0', section: 'assumptions', text: 'Comments are plain text', origin: 'ai', removed: false },
  ],
  overlaps: [{ ref: 'FR-034', text: 'Task details already show a description.' }],
  conflicts: [{ ref: 'ADR-005', text: 'Viewers are read-only.' }],
  suggestedEpic: { id: 'EP-002', reason: 'Task management' },
  covered: null,
  questions: [
    {
      id: 'q1',
      text: 'Which formatting may comments use?',
      why: 'Affects storage.',
      options: ['Plain text', 'Markdown'],
      answer: null,
      deferred: false,
    },
  ],
  done: false,
};

async function setup(initial: Partial<Wizard> = {}, over: ContractHandlers = {}) {
  let row: Wizard = {
    id: 'w1',
    projectId: 'p1',
    step: 'describe',
    draft: { text: 'Users can comment on tasks' },
    featureId: null,
    updatedAt: 't',
    ...initial,
  };
  const calls: string[] = [];
  const set = (next: Partial<Wizard>) => (row = { ...row, ...next });
  const { session, server } = await fakeCoreWithEvents({
    'epics.list': async () => ({ epics: [], uncovered: [] }),
    'features.wizard.get': async () => row,
    'features.wizard.create': async () => row,
    'features.wizard.update': async ({ step, draft }) => {
      calls.push(`update ${step}`);
      return set({ step, draft: { ...draft, ...(row.draft.review ? { review: row.draft.review } : {}) } as Wizard['draft'] });
    },
    'features.wizard.review': async () => {
      calls.push('review');
      set({ step: 'review', draft: { ...row.draft, review: { ...READY, state: 'running', parts: [], questions: [] } } });
      return { ok: true as const, runId: 'run-1' };
    },
    'features.wizard.editPart': async ({ partId, removed, text }) => {
      calls.push(`edit ${partId} ${removed ?? ''} ${text ?? ''}`.trim());
      const review = row.draft.review!;
      const parts = review.parts.map((p) =>
        p.id === partId
          ? { ...p, ...(removed !== undefined ? { removed } : {}), ...(text !== undefined ? { text, origin: 'user' as const } : {}) }
          : p,
      );
      return set({ draft: { ...row.draft, review: { ...review, parts } } });
    },
    'features.wizard.answer': async ({ answers }) => {
      calls.push(`answer ${JSON.stringify(answers)}`);
      return { ok: true as const, runId: 'run-2' };
    },
    'features.wizard.deferQuestion': async ({ questionId }) => {
      calls.push(`defer ${questionId}`);
      const review = row.draft.review!;
      return set({
        draft: {
          ...row.draft,
          review: { ...review, questions: review.questions.map((q) => (q.id === questionId ? { ...q, deferred: true } : q)) },
        },
      });
    },
    'features.wizard.dismissCovered': async () => {
      calls.push('dismiss');
      const review = row.draft.review!;
      return set({ draft: { ...row.draft, review: { ...review, covered: { ...review.covered!, dismissed: true } } } });
    },
    'features.wizard.withdraw': async () => {
      calls.push('withdraw');
      return {};
    },
    'features.wizard.merge': async ({ featureId }) => {
      calls.push(`merge ${featureId}`);
      return { path: 'spec/01_intent/FI-001-comments.md' };
    },
    'features.wizard.preview': async () => ({
      featureId: 'FI-002',
      title: 'Task comments',
      path: 'spec/01_intent/FI-002-task-comments.md',
      content: '---\n',
    }),
    ...over,
  });
  const props = { onClose: vi.fn(), onContinue: vi.fn(), onView: vi.fn(), onMerged: vi.fn() };
  render(<FeatureWizard session={session} projectId="p1" resumeId="w1" {...props} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add feature' });
  const finish = (review: Review) => {
    set({ draft: { ...row.draft, title: 'Task comments', review } });
    act(() => server.emit('features.wizardUpdated', { projectId: 'p1', wizardId: 'w1' }));
  };
  return { sheet, server, calls, props, finish, set };
}

describe('US-083 AC-1: Review with AI with live progress', () => {
  it('starts the review and shows the agent output while it runs', async () => {
    const { sheet, server, calls } = await setup();
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Review with AI' }));
    await waitFor(() => expect(calls).toContain('review'));
    expect(await within(sheet).findByText(/The agent is reviewing your idea/)).toBeInTheDocument();
    act(() => server.emit('run.output', { runId: 'run-1', seq: 1, text: 'Reading the main intent…' }));
    expect(await within(sheet).findByText('Reading the main intent…')).toBeInTheDocument();
  });

  it('is disabled with the explanation in limited mode', async () => {
    const { session } = await fakeCoreWithEvents({
      'epics.list': async () => ({ epics: [], uncovered: [] }),
    });
    render(
      <FeatureWizard
        session={session}
        projectId="p1"
        resumeId={null}
        aiDisabledReason="No agent runtime."
        onClose={() => undefined}
        onContinue={() => undefined}
      />,
    );
    const button = await screen.findByRole('button', { name: 'Review with AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'No agent runtime.');
  });
});

describe('US-083 AC-2: enhanced draft and findings', () => {
  it('marks AI-added parts with Keep / Remove / Edit and shows overlaps, conflicts and the suggested epic', async () => {
    const { sheet, calls, props, finish } = await setup({
      step: 'review',
      draft: { text: 'Users can comment on tasks', review: { ...READY, state: 'running' } },
    });
    finish(READY);

    const draft = await within(sheet).findByRole('region', { name: 'Enhanced draft' });
    const assumption = within(draft).getByRole('listitem', { name: 'Comments are plain text' });
    expect(within(assumption).getByText('AI')).toBeInTheDocument();
    await userEvent.click(within(assumption).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls).toContain('edit assumptions-0 true'));
    await userEvent.click(await within(assumption).findByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(calls).toContain('edit assumptions-0 false'));
    const goal = within(draft).getByRole('listitem', { name: 'Users comment on tasks and mention teammates.' });
    await userEvent.click(within(goal).getByRole('button', { name: 'Edit' }));
    const editor = within(goal).getByRole('textbox', { name: 'Edit part' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Users comment on tasks.');
    await userEvent.click(within(goal).getByRole('button', { name: 'Save part' }));
    await waitFor(() => expect(calls).toContain('edit goal-0  Users comment on tasks.'));
    expect(within(draft).getByRole('listitem', { name: 'Users can comment on tasks' })).not.toHaveTextContent('AI');

    const findings = within(sheet).getByRole('region', { name: 'Findings' });
    expect(findings).toHaveTextContent('Overlaps with FR-034');
    expect(findings).toHaveTextContent('Conflicts with ADR-005');
    expect(findings).toHaveTextContent('Fits epic EP-002');
    await userEvent.click(within(findings).getByRole('button', { name: 'View FR-034' }));
    expect(props.onView).toHaveBeenCalledWith('FR-034');
  });

  it('shows a failed review with the reason', async () => {
    const { sheet, finish } = await setup({ step: 'review', draft: { text: 'Idea', review: { ...READY, state: 'running' } } });
    finish({ ...READY, state: 'failed', reason: 'Rate limited.' });
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Rate limited.');
    expect(within(sheet).getByRole('button', { name: 'Review with AI' })).toBeInTheDocument();
  });
});

describe('US-083 AC-3: already covered', () => {
  it('offers Withdraw, Merge into FI-x and Continue', async () => {
    const covered = { ...READY, covered: { ref: 'FI-001', text: 'Already covered by FI-001.', dismissed: false } };
    const first = await setup({ step: 'review', draft: { text: 'Idea', review: covered } });
    const banner = await within(first.sheet).findByRole('region', { name: 'Already covered' });
    await userEvent.click(within(banner).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(first.calls).toContain('dismiss'));
    await waitFor(() => expect(within(first.sheet).queryByRole('region', { name: 'Already covered' })).toBeNull());
    cleanupChecked();

    const second = await setup({ step: 'review', draft: { text: 'Idea', review: covered } });
    await userEvent.click(
      within(await within(second.sheet).findByRole('region', { name: 'Already covered' })).getByRole('button', {
        name: 'Merge into FI-001',
      }),
    );
    await waitFor(() => expect(second.calls).toContain('merge FI-001'));
    expect(second.props.onMerged).toHaveBeenCalledWith('spec/01_intent/FI-001-comments.md');
    cleanupChecked();

    const third = await setup({
      step: 'review',
      draft: { text: 'Idea', review: { ...covered, covered: { ...covered.covered, ref: 'FR-034' } } },
    });
    const banner3 = await within(third.sheet).findByRole('region', { name: 'Already covered' });
    expect(within(banner3).queryByRole('button', { name: /Merge into/ })).toBeNull();
    await userEvent.click(within(banner3).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(third.calls).toContain('withdraw'));
    expect(third.props.onClose).toHaveBeenCalled();
  });
});

describe('US-083 AC-4: clarification questions', () => {
  it('answers with suggested chips or free text, sends them in the same session and allows Answer later', async () => {
    const { sheet, calls, finish } = await setup({ step: 'review', draft: { text: 'Idea', review: READY } });
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Continue' }));
    const card = await within(sheet).findByRole('group', { name: 'Which formatting may comments use?' });
    expect(card).toHaveTextContent('Affects storage.');
    await userEvent.click(within(card).getByRole('button', { name: 'Markdown' }));
    expect(within(card).getByRole('textbox', { name: 'Answer' })).toHaveValue('Markdown');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send answers' }));
    await waitFor(() => expect(calls).toContain('answer {"q1":"Markdown"}'));

    finish({
      ...READY,
      questions: [
        { ...READY.questions[0]!, answer: 'Markdown' },
        { id: 'q2', text: 'Notify by e-mail?', why: '', options: [], answer: null, deferred: false },
      ],
    });
    const second = await within(sheet).findByRole('group', { name: 'Notify by e-mail?' });
    await userEvent.click(within(second).getByRole('button', { name: 'Answer later' }));
    await waitFor(() => expect(calls).toContain('defer q2'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done clarifying' }));
    expect(await within(sheet).findByRole('textbox', { name: 'Title' })).toHaveValue('Task comments');
  });
});
