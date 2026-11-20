// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-095: capture ideas (popover) and the idea inbox widget — turn into feature, merge, dismiss.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { CaptureIdeaDialog } from '../src/features/CaptureIdeaDialog.js';
import { IdeaInbox } from '../src/features/IdeaInbox.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Idea = QueryOutput<'ideas.list'>['ideas'][number];
const idea = (id: string, text: string, over: Partial<Idea> = {}): Idea => ({
  id,
  text,
  note: null,
  source: 'shortcut',
  createdAt: '2026-11-20',
  state: 'new',
  featureId: null,
  dismissReason: null,
  ...over,
});

describe('US-095 AC-1: Capture idea popover', () => {
  it('saves a text line with an optional note on Enter', async () => {
    const capture = vi.fn(async () => idea('IDEA-001', 'Export board as PDF'));
    const session = await fakeCore({ 'ideas.capture': capture });
    const onClose = vi.fn();
    render(<CaptureIdeaDialog session={session} projectId="p1" source="shortcut" onClose={onClose} />);
    const text = screen.getByRole('textbox', { name: 'Idea' });
    expect(text).toHaveFocus();
    await userEvent.type(text, 'Export board as PDF{Enter}');
    expect(capture).toHaveBeenCalledWith({ projectId: 'p1', text: 'Export board as PDF', source: 'shortcut' });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: 'IDEA-001' })));
  });

  it('sends the note and refuses an empty idea', async () => {
    const capture = vi.fn(async () => idea('IDEA-002', 'Bulk edit'));
    const session = await fakeCore({ 'ideas.capture': capture });
    render(<CaptureIdeaDialog session={session} projectId="p1" source="menu" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save idea' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Note (optional)' }), 'From the retro');
    await userEvent.type(screen.getByRole('textbox', { name: 'Idea' }), 'Bulk edit');
    await userEvent.click(screen.getByRole('button', { name: 'Save idea' }));
    expect(capture).toHaveBeenCalledWith({ projectId: 'p1', text: 'Bulk edit', note: 'From the retro', source: 'menu' });
  });
});

describe('US-095 AC-3: the idea inbox widget', () => {
  async function renderInbox(ideas: Idea[], handlers = {}) {
    const onTurnIntoFeature = vi.fn();
    const session = await fakeCore({
      'ideas.list': async () => ({ ideas, untriaged: ideas.filter((i) => i.state === 'new').length }),
      ...handlers,
    });
    render(
      <IdeaInbox
        session={session}
        projectId="p1"
        features={[
          { id: 'FI-001', title: 'Comments' },
          { id: 'FI-002', title: 'Board export' },
        ]}
        onTurnIntoFeature={onTurnIntoFeature}
      />,
    );
    return { onTurnIntoFeature, widget: await screen.findByRole('region', { name: 'Idea inbox' }) };
  }

  it('shows the untriaged counter and captures from its input line', async () => {
    const capture = vi.fn(async () => idea('IDEA-003', 'Bulk edit'));
    const { widget } = await renderInbox(
      [idea('IDEA-001', 'Export board as PDF'), idea('IDEA-002', 'Old', { state: 'dismissed', dismissReason: 'No.' })],
      {
        'ideas.capture': capture,
      },
    );
    expect(await within(widget).findByText('1 untriaged')).toBeInTheDocument();
    await userEvent.type(within(widget).getByRole('textbox', { name: 'Capture an idea' }), 'Bulk edit{Enter}');
    expect(capture).toHaveBeenCalledWith({ projectId: 'p1', text: 'Bulk edit', source: 'dashboard' });
  });

  it('Turn into feature hands the idea to the wizard; triaged ideas show their outcome when expanded', async () => {
    const { widget, onTurnIntoFeature } = await renderInbox([
      idea('IDEA-001', 'Export board as PDF'),
      idea('IDEA-002', 'Comments on cards', { state: 'turned_into_feature', featureId: 'FI-002' }),
    ]);
    const row = await within(widget).findByRole('listitem', { name: 'IDEA-001 Export board as PDF' });
    await userEvent.click(within(row).getByRole('button', { name: 'Turn into feature' }));
    expect(onTurnIntoFeature).toHaveBeenCalledWith(expect.objectContaining({ id: 'IDEA-001', text: 'Export board as PDF' }));
    expect(within(widget).queryByText('→ FI-002')).not.toBeInTheDocument();
    await userEvent.click(within(widget).getByRole('button', { name: 'Show all (2)' }));
    expect(within(widget).getByText('→ FI-002')).toBeInTheDocument();
  });

  it('merges into a picked feature and dismisses with a reason', async () => {
    const merge = vi.fn(async () => idea('IDEA-001', 'A', { state: 'merged', featureId: 'FI-001' }));
    const dismiss = vi.fn(async () => idea('IDEA-002', 'B', { state: 'dismissed', dismissReason: 'Duplicate.' }));
    const { widget } = await renderInbox([idea('IDEA-001', 'A'), idea('IDEA-002', 'B')], {
      'ideas.merge': merge,
      'ideas.dismiss': dismiss,
    });

    const a = await within(widget).findByRole('listitem', { name: 'IDEA-001 A' });
    await userEvent.click(within(a).getByRole('button', { name: 'Merge into…' }));
    await userEvent.selectOptions(within(a).getByRole('combobox', { name: 'Feature for IDEA-001' }), 'FI-001');
    await userEvent.click(within(a).getByRole('button', { name: 'Merge' }));
    expect(merge).toHaveBeenCalledWith({ projectId: 'p1', ideaId: 'IDEA-001', featureId: 'FI-001' });

    const b = within(widget).getByRole('listitem', { name: 'IDEA-002 B' });
    await userEvent.click(within(b).getByRole('button', { name: 'Dismiss…' }));
    expect(within(b).getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    await userEvent.type(within(b).getByRole('textbox', { name: 'Reason for IDEA-002' }), 'Duplicate.');
    await userEvent.click(within(b).getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalledWith({ projectId: 'p1', ideaId: 'IDEA-002', reason: 'Duplicate.' });
  });
});
