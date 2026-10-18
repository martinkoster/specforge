// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDialog } from '../src/documents/ConflictDialog.js';

afterEach(cleanup);

const diff = ['--- spec/intent.md (on disk)', '+++ spec/intent.md (your changes)', '@@ -1 +1 @@', '-Old line', '+My line'].join('\n');

function renderDialog() {
  const onResolve = vi.fn();
  render(<ConflictDialog path="spec/intent.md" diff={diff} onResolve={onResolve} />);
  return { onResolve, dialog: screen.getByRole('alertdialog', { name: 'spec/intent.md changed on disk' }) };
}

describe('US-021 AC-3: conflict dialog for a document with unsaved changes that changed on disk', () => {
  it('offers keep mine and take theirs', async () => {
    const { onResolve, dialog } = renderDialog();

    expect(dialog).toHaveTextContent('You have unsaved changes');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep mine' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take theirs' }));

    expect(onResolve.mock.calls).toEqual([['keep-mine'], ['take-theirs']]);
  });

  it('shows the diff on request with added and removed lines marked', async () => {
    const { dialog } = renderDialog();
    expect(within(dialog).queryByRole('region', { name: 'Differences' })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Show diff' }));

    const region = within(dialog).getByRole('region', { name: 'Differences' });
    expect(within(region).getByText('+My line')).toHaveClass('diff-added');
    expect(within(region).getByText('-Old line')).toHaveClass('diff-removed');
    expect(within(dialog).getByRole('button', { name: 'Hide diff' })).toHaveAttribute('aria-expanded', 'true');
  });
});
