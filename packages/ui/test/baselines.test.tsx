// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-096: spec baselines — create dialog, dashboard history, compare an artifact with a baseline.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { BaselineDialog } from '../src/features/BaselineDialog.js';
import { SpecHistory } from '../src/features/SpecHistory.js';
import { ArtifactEditor } from '../src/specs/ArtifactEditor.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Offer = QueryOutput<'baselines.offer'>;
const offer = (over: Partial<Offer> = {}): Offer => ({
  available: true,
  reason: null,
  uncommitted: [],
  nextTag: 'spec-v1.1',
  features: [{ id: 'FI-001', title: 'Task comments' }],
  epics: [{ id: 'EP-003', title: 'Task comments' }],
  ...over,
});
const baseline = (tag: string, createdAt: string, featureIds: string[] = []) => ({
  projectId: 'p1',
  tag,
  commit: `c-${tag}`,
  createdAt,
  featureIds,
  epicIds: [],
  notes: `Spec baseline ${tag}`,
});

describe('US-096 AC-1/AC-2: the Create baseline dialog', () => {
  it('proposes the next tag (editable) with the included features and epics and creates it', async () => {
    const create = vi.fn(async () => baseline('spec-v1.2', 't'));
    const onCreated = vi.fn();
    const session = await fakeCore({ 'baselines.offer': async () => offer(), 'baselines.create': create });
    render(<BaselineDialog session={session} projectId="p1" onClose={vi.fn()} onCreated={onCreated} onCommitSpecChanges={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Create spec baseline' });
    const tag = await within(dialog).findByRole('textbox', { name: 'Tag' });
    expect(tag).toHaveValue('spec-v1.1');
    expect(dialog).toHaveTextContent('FI-001 Task comments');
    expect(dialog).toHaveTextContent('EP-003 Task comments');
    await userEvent.clear(tag);
    await userEvent.type(tag, 'spec-v1.2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create baseline' }));
    expect(create).toHaveBeenCalledWith({ projectId: 'p1', tag: 'spec-v1.2' });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('AC-2: uncommitted spec changes are committed first', async () => {
    const onCommit = vi.fn();
    const session = await fakeCore({ 'baselines.offer': async () => offer({ uncommitted: ['spec/02_requirements/fr.md'] }) });
    render(<BaselineDialog session={session} projectId="p1" onClose={vi.fn()} onCreated={vi.fn()} onCommitSpecChanges={onCommit} />);
    const dialog = await screen.findByRole('dialog', { name: 'Create spec baseline' });
    expect(await within(dialog).findByText(/spec\/02_requirements\/fr.md/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create baseline' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Commit spec changes' }));
    expect(onCommit).toHaveBeenCalled();
  });

  it('AC-4: without Git the action is unavailable with an explanation', async () => {
    const session = await fakeCore({
      'baselines.offer': async () =>
        offer({ available: false, reason: 'Spec baselines are Git tags — this project has no Git repository.' }),
    });
    render(<BaselineDialog session={session} projectId="p1" onClose={vi.fn()} onCreated={vi.fn()} onCommitSpecChanges={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Create spec baseline' });
    expect(await within(dialog).findByText(/no Git repository/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Create baseline' })).not.toBeInTheDocument();
  });
});

describe('US-096 AC-3/AC-4: the dashboard history', () => {
  it('lists baselines newest first and offers Create baseline', async () => {
    const onCreate = vi.fn();
    const session = await fakeCore({
      'baselines.list': async () => [
        baseline('spec-v1.1', '2026-11-20T15:00:00.000Z', ['FI-001']),
        baseline('spec-v1.0', '2026-11-19T09:00:00.000Z'),
      ],
      'baselines.offer': async () => offer(),
    });
    render(<SpecHistory session={session} projectId="p1" onCreate={onCreate} />);
    const widget = await screen.findByRole('region', { name: 'Spec history' });
    const items = await within(widget).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['spec-v1.1 · 2026-11-20 · FI-001', 'spec-v1.0 · 2026-11-19']);
    await userEvent.click(within(widget).getByRole('button', { name: 'Create baseline' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('hides the action without Git and says why', async () => {
    const session = await fakeCore({
      'baselines.list': async () => [],
      'baselines.offer': async () =>
        offer({ available: false, reason: 'Spec baselines are Git tags — this project has no Git repository.' }),
    });
    render(<SpecHistory session={session} projectId="p1" onCreate={vi.fn()} />);
    const widget = await screen.findByRole('region', { name: 'Spec history' });
    expect(await within(widget).findByText(/no Git repository/)).toBeInTheDocument();
    expect(within(widget).queryByRole('button', { name: 'Create baseline' })).not.toBeInTheDocument();
  });
});

describe('US-096 AC-3: Compare with baseline in the artifact editor', () => {
  it('shows the diff of the file between the baseline and the current content', async () => {
    const compare = vi.fn(async () => ({ before: '### FR-034: Task details\n', after: '### FR-034: Task details\nChanged by FI-001.\n' }));
    render(
      <ArtifactEditor
        path="spec/02_requirements/fr.md"
        initial={{ content: '### FR-034: Task details\nChanged by FI-001.\n', hash: 'h' }}
        onSave={vi.fn()}
        baselines={['spec-v1.1', 'spec-v1.0']}
        onCompare={compare}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Compare with baseline…' }), 'spec-v1.0');
    expect(compare).toHaveBeenCalledWith('spec-v1.0');
    const diff = await screen.findByRole('region', { name: 'Compared with spec-v1.0' });
    expect(diff).toHaveTextContent('Changed by FI-001.');
    await userEvent.click(within(diff).getByRole('button', { name: 'Close comparison' }));
    expect(screen.queryByRole('region', { name: 'Compared with spec-v1.0' })).not.toBeInTheDocument();
  });

  it('offers no comparison without baselines', () => {
    render(<ArtifactEditor path="spec/x.md" initial={{ content: '', hash: 'h' }} onSave={vi.fn()} baselines={[]} onCompare={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Compare with baseline…' })).not.toBeInTheDocument();
  });
});
