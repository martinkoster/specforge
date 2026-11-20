// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers, QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { FeatureWizard } from '../src/features/FeatureWizard.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Wizard = NonNullable<QueryOutput<'features.wizard.get'>>;

function wizardCore(over: ContractHandlers = {}) {
  const rows = new Map<string, Wizard>();
  const calls: string[] = [];
  const handlers: ContractHandlers = {
    'epics.list': async () => ({
      epics: [{ id: 'EP-002', title: 'Task management', approval: 'approved' as const, path: 'x', stories: [], requirements: [] }],
      uncovered: [],
    }),
    'features.wizard.create': async ({ projectId, draft }) => {
      calls.push('create');
      const row: Wizard = { id: 'w1', projectId, step: 'describe', draft: draft as Wizard['draft'], featureId: null, updatedAt: 't' };
      rows.set(row.id, row);
      return row;
    },
    'features.wizard.update': async ({ wizardId, step, draft }) => {
      calls.push(`update ${step}`);
      const row = { ...rows.get(wizardId)!, step, draft: draft as Wizard['draft'] };
      rows.set(wizardId, row);
      return row;
    },
    'features.wizard.get': async ({ wizardId }) => rows.get(wizardId) ?? null,
    'features.wizard.discard': async ({ wizardId }) => {
      calls.push('discard');
      rows.delete(wizardId);
      return {};
    },
    'features.wizard.preview': async ({ title }) => ({
      featureId: 'FI-003',
      title: title ?? 'Users can comment on tasks',
      path: `spec/01_intent/FI-003-${(title ?? 'Users can comment on tasks').toLowerCase().replace(/ /g, '-')}.md`,
      content: `---\nkind: feature_intent\nid: FI-003\ntitle: ${title ?? 'Users can comment on tasks'}\n---\n## Problem\n`,
    }),
    'features.wizard.save': async ({ title, approve }) => {
      calls.push(`save ${title} ${approve}`);
      return { featureId: 'FI-003', path: 'spec/01_intent/FI-003-task-comments.md' };
    },
    ...over,
  };
  return { handlers, rows, calls };
}

async function renderWizard(core: ReturnType<typeof wizardCore>, props: Partial<Parameters<typeof FeatureWizard>[0]> = {}) {
  const session = await fakeCore(core.handlers);
  const callbacks = { onClose: vi.fn(), onContinue: vi.fn(), onSaved: vi.fn() };
  render(<FeatureWizard session={session} projectId="p1" resumeId={null} {...callbacks} {...props} />);
  return { ...callbacks, sheet: await screen.findByRole('dialog', { name: 'Add feature' }) };
}

describe('US-082 AC-2: the wizard sheet', () => {
  it('shows the steps and the Describe step with collapsed optional details', async () => {
    const { sheet } = await renderWizard(wizardCore());

    const steps = within(sheet).getByRole('list', { name: 'Wizard steps' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Describe', 'AI review', 'Clarify', 'Save']);
    expect(within(steps).getByText('Describe').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(within(sheet).getByRole('textbox', { name: 'What would you like to add or change?' })).toBeInTheDocument();
    const details = within(sheet).getByText('More details').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByRole('textbox', { name: 'Motivation' })).toBeInTheDocument();
    expect(within(details).getByRole('textbox', { name: 'Target users' })).toBeInTheDocument();
    expect(within(details).getByRole('combobox', { name: 'Priority' })).toBeInTheDocument();
    await userEvent.click(within(details).getByText('More details'));
    expect(await within(details).findByRole('option', { name: 'EP-002 Task management' })).toBeInTheDocument();
  });
});

describe('US-082 AC-3/AC-5: save without AI', () => {
  it('stores the draft, previews the file with an editable title and saves & approves; then shows the feature stepper', async () => {
    const core = wizardCore();
    const { sheet, onContinue, onSaved } = await renderWizard(core);

    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'What would you like to add or change?' }),
      'Users can comment on tasks',
    );
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Priority' }), 'should');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save without AI' }));

    const title = await within(sheet).findByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Users can comment on tasks');
    expect(within(sheet).getByLabelText('Preview of spec/01_intent/FI-003-users-can-comment-on-tasks.md')).toHaveTextContent('id: FI-003');
    expect(core.calls).toEqual(['create', 'update save']);
    expect(core.rows.get('w1')?.draft).toEqual({ text: 'Users can comment on tasks', priority: 'should' });

    await userEvent.clear(title);
    await userEvent.type(title, 'Task comments');
    await waitFor(() => expect(within(sheet).getByLabelText('Preview of spec/01_intent/FI-003-task-comments.md')).toBeInTheDocument());
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save & approve' }));

    expect(await within(sheet).findByRole('heading', { name: 'FI-003 saved' })).toBeInTheDocument();
    expect(core.calls.at(-1)).toBe('save Task comments true');
    expect(onSaved).toHaveBeenCalledWith({ featureId: 'FI-003', path: 'spec/01_intent/FI-003-task-comments.md' });
    const stepper = within(sheet).getByRole('list', { name: 'Feature steps' });
    expect(
      within(stepper)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Feature intent ✓', 'Impact', 'Requirements', 'Design', 'Epic & stories', 'Kanban', 'Epic review']);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Continue to impact analysis' }));
    expect(onContinue).toHaveBeenCalledWith('FI-003');
  });

  it('saves as draft and shows save errors', async () => {
    const core = wizardCore({
      'features.wizard.save': async () => {
        throw new Error('The feature needs a title.');
      },
    });
    const { sheet } = await renderWizard(core);
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'What would you like to add or change?' }), 'Idea');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save without AI' }));
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Save as draft' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('The feature needs a title.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Back' }));
    expect(within(sheet).getByRole('textbox', { name: 'What would you like to add or change?' })).toHaveValue('Idea');
  });

  it('Save without AI needs an idea', async () => {
    const { sheet } = await renderWizard(wizardCore());
    expect(within(sheet).getByRole('button', { name: 'Save without AI' })).toBeDisabled();
  });
});

describe('US-082 AC-4: closing keeps the draft; reopening resumes at the same step', () => {
  it('stores the current step on close, discards an empty draft and resumes a stored one', async () => {
    const core = wizardCore();
    const first = await renderWizard(core);
    await userEvent.type(within(first.sheet).getByRole('textbox', { name: 'What would you like to add or change?' }), 'Comments');
    await userEvent.click(within(first.sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(first.onClose).toHaveBeenCalled());
    expect(core.calls).toEqual(['create']);
    cleanupChecked();

    core.rows.set('w1', { ...core.rows.get('w1')!, step: 'save' });
    const resumed = await renderWizard(core, { resumeId: 'w1' });
    expect(await within(resumed.sheet).findByRole('textbox', { name: 'Title' })).toHaveValue('Users can comment on tasks');
    cleanupChecked();

    const empty = await renderWizard(core);
    await userEvent.click(within(empty.sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(empty.onClose).toHaveBeenCalled());
    expect(core.calls).toEqual(['create']);
  });
});
