// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-093: the Epic & stories tab of the feature page — epic choice, generated stories with badges, Open on Kanban.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { StoriesPanel } from '../src/features/StoriesPanel.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Proposal = QueryOutput<'delta.epicProposal'>;
type View = NonNullable<QueryOutput<'delta.changeSet'>>;
const S = 'spec/04_user_stories';

const proposal = (choice: Proposal['choice'] = null): Proposal => ({
  newEpic: { id: 'EP-003', title: 'Task comments' },
  extend: [{ id: 'EP-002', title: 'Tasks', reason: 'The task epic' }],
  choice,
});
const chosen = {
  projectId: 'p1',
  featureId: 'FI-001',
  mode: 'new' as const,
  epicIds: ['EP-003'],
  title: 'Task comments',
  decidedAt: 't',
};
const item = (id: string, kind: 'new' | 'modified', elementId: string, path: string, after: string) => ({
  id,
  changeSetId: 'cs1',
  path,
  elementId,
  kind,
  before: kind === 'new' ? null : 'old\n',
  after,
  patch: `@@ -1 +1 @@\n+${id}\n`,
  state: 'open' as const,
});
const changeSet = (state: View['state'] = 'open'): View => ({
  id: 'cs1',
  projectId: 'p1',
  featureId: 'FI-001',
  phase: 'stories',
  runId: 'r1',
  state,
  reason: null,
  createdAt: 't',
  items: [
    item('i1', 'new', 'EP-003', `${S}/epics/EP-003.md`, '---\nkind: epic\nid: EP-003\n---\n'),
    item('i2', 'new', 'US-013', `${S}/US-013-list.md`, '---\nkind: story\nid: US-013\n---\n'),
    item('i3', 'new', 'US-014', `${S}/US-014-view.md`, '---\nkind: story\nid: US-014\nreworks: [US-008]\n---\n'),
    item('i4', 'modified', 'US-011', `${S}/US-011.md`, '---\nkind: story\nid: US-011\n---\n'),
  ].map((i) => (state === 'applied' ? { ...i, state: 'applied' as const } : i)),
});

describe('US-093 AC-1: the epic choice is approved first', () => {
  it('proposes a new epic (default) or extending an impacted epic and approves the choice', async () => {
    const chooseEpic = vi.fn(async () => proposal(chosen));
    const session = await fakeCore({
      'delta.epicProposal': async () => proposal(),
      'delta.changeSet': async () => null,
      'delta.chooseEpic': chooseEpic,
    });
    render(<StoriesPanel session={session} projectId="p1" featureId="FI-001" stories={[]} />);

    const group = await screen.findByRole('radiogroup', { name: 'Epic' });
    expect(within(group).getByRole('radio', { name: /New epic EP-003/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /Extend EP-002 Tasks/ })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Generate stories' })).not.toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: 'Epic title' });
    expect(title).toHaveValue('Task comments');
    await userEvent.clear(title);
    await userEvent.type(title, 'Comments');
    await userEvent.click(screen.getByRole('button', { name: 'Approve epic choice' }));

    expect(chooseEpic).toHaveBeenCalledWith({ projectId: 'p1', featureId: 'FI-001', choice: { mode: 'new', title: 'Comments' } });
    expect(await screen.findByText('Epic: new EP-003 "Task comments"')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Generate stories' })).toBeInTheDocument();
  });

  it('extends an epic of the impact list', async () => {
    const chooseEpic = vi.fn(async () => proposal({ ...chosen, mode: 'extend', epicIds: ['EP-002'], title: null }));
    const session = await fakeCore({
      'delta.epicProposal': async () => proposal(),
      'delta.changeSet': async () => null,
      'delta.chooseEpic': chooseEpic,
    });
    render(<StoriesPanel session={session} projectId="p1" featureId="FI-001" stories={[]} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Extend EP-002 Tasks/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve epic choice' }));
    expect(chooseEpic).toHaveBeenCalledWith({ projectId: 'p1', featureId: 'FI-001', choice: { mode: 'extend', epicIds: ['EP-002'] } });
    expect(await screen.findByText('Epic: extend EP-002')).toBeInTheDocument();
  });
});

describe('US-093 AC-2: proposed stories with badges', () => {
  it('shows New / Adjusted / Rework of badges per proposed file', async () => {
    const session = await fakeCore({
      'delta.epicProposal': async () => proposal(chosen),
      'delta.changeSet': async () => changeSet(),
    });
    render(<StoriesPanel session={session} projectId="p1" featureId="FI-001" stories={[]} />);
    expect(await screen.findByText('New EP-003')).toBeInTheDocument();
    expect(screen.getByText('New US-013')).toBeInTheDocument();
    expect(screen.getByText('Rework of US-008')).toBeInTheDocument();
    expect(screen.getByText('Adjusted US-011')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Delta phase' })).not.toBeInTheDocument();
  });
});

describe('US-093 AC-4: after applying, Open on Kanban', () => {
  it('jumps to the board and lists the feature stories', async () => {
    const onOpenKanban = vi.fn();
    const session = await fakeCore({
      'delta.epicProposal': async () => proposal(chosen),
      'delta.changeSet': async () => changeSet('applied'),
    });
    render(<StoriesPanel session={session} projectId="p1" featureId="FI-001" stories={['US-013', 'US-014']} onOpenKanban={onOpenKanban} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open on Kanban' }));
    expect(onOpenKanban).toHaveBeenCalled();
    expect(screen.getByRole('list', { name: 'Feature stories' })).toHaveTextContent('US-013');
  });
});
