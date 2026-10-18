// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactEditor } from '../src/specs/ArtifactEditor.js';
import { DraftInputsConfirm } from '../src/specs/DraftInputsConfirm.js';

afterEach(cleanup);

const doc = { content: '---\nkind: requirements\napproval: draft\n---\n# FR\n', hash: 'h1' };

describe('US-026 AC-1: Draft/Approved badge and Approve', () => {
  it('shows the Draft badge and approves', async () => {
    const onApprove = vi.fn(async () => undefined);
    render(<ArtifactEditor path="spec/02_requirements/fr.md" initial={doc} approval="draft" onApprove={onApprove} onSave={vi.fn()} />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalled();
  });

  it('asks to save first while there are unsaved changes; an approved artifact has no Approve button', () => {
    const { unmount } = render(<ArtifactEditor path="a.md" initial={doc} approval="draft" onApprove={vi.fn()} onSave={vi.fn()} />);
    const view = EditorView.findFromDOM(document.querySelector('.cm-content') as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: 'x' } }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('title', 'Save your changes before approving.');
    unmount();

    render(<ArtifactEditor path="a.md" initial={doc} approval="approved" onApprove={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});

describe('US-026 AC-3: confirmation before generating from Draft inputs', () => {
  it('shows the warning with the Draft inputs and continues only on confirmation', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DraftInputsConfirm
        check={{
          drafts: ['spec/02_requirements/fr.md'],
          warning: 'Some inputs are still Draft: spec/02_requirements/fr.md. Continue anyway?',
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Inputs are still Draft' });
    expect(dialog).toHaveTextContent('spec/02_requirements/fr.md');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('confirms immediately when all inputs are approved', () => {
    const onConfirm = vi.fn();
    render(<DraftInputsConfirm check={{ drafts: [], warning: null }} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
