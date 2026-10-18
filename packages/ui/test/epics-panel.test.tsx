// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { EpicsPanel } from '../src/specs/EpicsPanel.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const list = {
  epics: [
    {
      id: 'EP-001',
      title: 'Login',
      approval: 'draft' as const,
      path: 'spec/04_user_stories/epics/EP-001-login.md',
      stories: ['US-001', 'US-002'],
      requirements: ['FR-001'],
    },
    {
      id: 'EP-002',
      title: 'Profile',
      approval: 'approved' as const,
      path: 'spec/04_user_stories/epics/EP-002-profile.md',
      stories: [],
      requirements: [],
    },
  ],
  uncovered: ['FR-002', 'NFR-001'],
};

async function renderPanel(handlers: ContractHandlers = {}) {
  const onOpen = vi.fn();
  const onChanged = vi.fn();
  const session = await fakeCore({ 'epics.list': async () => list, ...handlers });
  render(<EpicsPanel session={session} projectId="p1" onOpen={onOpen} onChanged={onChanged} />);
  return { onOpen, onChanged, panel: await screen.findByRole('region', { name: 'Epics' }) };
}

describe('US-035 AC-2: coverage strip', () => {
  it('lists the Must-have requirements without an epic', async () => {
    const { panel } = await renderPanel();
    expect(await within(panel).findByRole('status')).toHaveTextContent('Must-have requirements without an epic: FR-002, NFR-001');
  });
});

describe('US-035 AC-3: managing epics', () => {
  it('lists epics with approval and story count; opens one; reorders', async () => {
    const reorder = vi.fn(async () => ({}));
    const { panel, onOpen } = await renderPanel({ 'epics.reorder': reorder });
    const rows = await within(panel).findAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('strong')?.textContent)).toEqual(['EP-001 Login', 'EP-002 Profile']);
    expect(rows[0]).toHaveTextContent('Draft · 2 stories');
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Open EP-001' }));
    expect(onOpen).toHaveBeenCalledWith('spec/04_user_stories/epics/EP-001-login.md');
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Move EP-002 up' }));
    expect(reorder).toHaveBeenCalledWith(expect.objectContaining({ epicIds: ['EP-002', 'EP-001'] }));
  });

  it('creates an epic', async () => {
    const create = vi.fn(async () => ({ id: 'EP-003', path: 'p' }));
    const { panel, onChanged } = await renderPanel({ 'epics.create': create });
    await userEvent.type(within(panel).getByRole('textbox', { name: 'New epic title' }), 'Export');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create epic' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', title: 'Export' }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('merges an epic into another', async () => {
    const merge = vi.fn(async () => ({}));
    const { panel } = await renderPanel({ 'epics.merge': merge });
    const row = (await within(panel).findAllByRole('listitem'))[0]!;
    await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Merge EP-001 into' }), 'EP-002');
    await userEvent.click(within(row).getByRole('button', { name: 'Merge' }));
    expect(merge).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'EP-001', targetId: 'EP-002' }));
  });

  it('splits chosen stories into a new epic', async () => {
    const split = vi.fn(async () => ({ id: 'EP-003', path: 'p' }));
    const { panel } = await renderPanel({ 'epics.split': split });
    const row = (await within(panel).findAllByRole('listitem'))[0]!;
    await userEvent.click(within(row).getByRole('button', { name: 'Split EP-001…' }));
    await userEvent.click(within(row).getByRole('checkbox', { name: 'US-002' }));
    await userEvent.type(within(row).getByRole('textbox', { name: 'Title of the new epic' }), 'Remember me');
    await userEvent.click(within(row).getByRole('button', { name: 'Split' }));
    expect(split).toHaveBeenCalledWith(expect.objectContaining({ epicId: 'EP-001', storyIds: ['US-002'], title: 'Remember me' }));
  });

  it('deleting asks for confirmation naming the stories that move to No epic', async () => {
    const del = vi.fn(async () => ({}));
    const { panel } = await renderPanel({ 'epics.delete': del });
    const row = (await within(panel).findAllByRole('listitem'))[0]!;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete EP-001' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete EP-001?' });
    expect(confirm).toHaveTextContent('US-001, US-002 move to No epic.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ epicId: 'EP-001' }));
  });
});

describe('US-035 AC-4: approve epic structure', () => {
  it('approves all epics', async () => {
    const approveAll = vi.fn(async () => ({ approved: ['EP-001'] }));
    const { panel } = await renderPanel({ 'epics.approveAll': approveAll });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Approve epic structure' }));
    expect(approveAll).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
  });

  it('shows failed operations', async () => {
    const { panel } = await renderPanel({
      'epics.create': async () => {
        throw new Error('Unknown epic EP-9.');
      },
    });
    await userEvent.type(within(panel).getByRole('textbox', { name: 'New epic title' }), 'X');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create epic' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Unknown epic EP-9.');
  });
});
