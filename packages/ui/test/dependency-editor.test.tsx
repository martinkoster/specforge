// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DependencyEditor } from '../src/stories/DependencyEditor.js';

afterEach(cleanup);

function renderEditor(onAdd = vi.fn(async () => ({ ok: true as const }))) {
  const onRemove = vi.fn(async () => ({ ok: true as const }));
  render(
    <DependencyEditor
      storyId="US-002"
      dependencies={[{ to: 'US-001', type: 'blocking' }]}
      storyIds={['US-001', 'US-002', 'US-003']}
      onAdd={onAdd}
      onRemove={onRemove}
    />,
  );
  return { onAdd, onRemove };
}

describe('US-040 AC-1: add and remove dependencies in the story drawer', () => {
  it('lists dependencies and removes one', async () => {
    const { onRemove } = renderEditor();
    const list = screen.getByRole('list', { name: 'Dependencies of US-002' });

    expect(within(list).getByText('depends on US-001')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Remove dependency on US-001' }));

    expect(onRemove).toHaveBeenCalledWith({ to: 'US-001', type: 'blocking' });
  });

  it('adds a blocking dependency with rationale or a related link; the story itself is not offered', async () => {
    const { onAdd } = renderEditor();
    const target = screen.getByRole('combobox', { name: 'Story' });

    expect(within(target).queryByRole('option', { name: 'US-002' })).not.toBeInTheDocument();
    await userEvent.selectOptions(target, 'US-003');
    await userEvent.type(screen.getByRole('textbox', { name: 'Rationale' }), 'Needs the API');
    await userEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    expect(onAdd).toHaveBeenLastCalledWith({ to: 'US-003', type: 'blocking', rationale: 'Needs the API' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'related');
    expect(screen.queryByRole('textbox', { name: 'Rationale' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    expect(onAdd).toHaveBeenLastCalledWith({ to: 'US-003', type: 'related' });
  });

  it('shows why a dependency was rejected (cycle path)', async () => {
    renderEditor(vi.fn(async () => ({ ok: false as const, reason: 'Cycle: US-003 → US-002 → US-003' })));

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Story' }), 'US-003');
    await userEvent.click(screen.getByRole('button', { name: 'Add dependency' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cycle: US-003 → US-002 → US-003');
  });
});
