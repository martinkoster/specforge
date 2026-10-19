// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactEditor } from '../src/specs/ArtifactEditor.js';
import { ArtifactList } from '../src/specs/ArtifactList.js';

afterEach(cleanup);

const doc = { content: '---\nkind: intent\napproval: draft\n---\n# Task Manager\n\nA **small** app.\n', hash: 'h1' };

/** Edits through CodeMirror's own update path (what typing does). */
function typeInEditor(text: string): void {
  const content = document.querySelector('.cm-content') as HTMLElement;
  const view = EditorView.findFromDOM(content)!;
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: text } }));
}

describe('US-025 AC-1: split view with editor and rendered preview; Save writes the file', () => {
  it('renders the Markdown (without front-matter) next to the CodeMirror editor', () => {
    render(<ArtifactEditor path="spec/01_intent/intent.md" initial={doc} onSave={vi.fn()} />);

    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('heading', { name: 'Task Manager' })).toBeInTheDocument();
    expect(within(preview).getByText('small').tagName).toBe('STRONG');
    expect(preview).not.toHaveTextContent('approval: draft');
    expect(screen.getByRole('region', { name: 'Editor' }).querySelector('.cm-editor')).not.toBeNull();
  });

  it('updates the preview while editing and saves with the expected hash', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, hash: 'h2' }));
    render(<ArtifactEditor path="spec/01_intent/intent.md" initial={doc} onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    typeInEditor('\n## Goals\n');

    expect(within(screen.getByRole('region', { name: 'Preview' })).getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(`${doc.content}\n## Goals\n`, 'h1');
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    typeInEditor('More.\n');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.stringContaining('More.'), 'h2');
  });

  it('saves with Ctrl+S', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, hash: 'h2' }));
    render(<ArtifactEditor path="a.md" initial={doc} onSave={onSave} />);
    typeInEditor('x');

    await userEvent.keyboard('{Control>}s{/Control}');

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('does not render raw HTML from the document (XSS-safe preview)', () => {
    render(<ArtifactEditor path="a.md" initial={{ content: '<img src=x onerror="alert(1)"> text', hash: 'h' }} onSave={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Preview' }).querySelector('img')).toBeNull();
  });
});

describe('US-025 AC-3: saving over an externally changed file shows the conflict dialog', () => {
  const conflict = {
    ok: false as const,
    conflict: { theirs: '# Theirs\n', theirsHash: 'h9', diff: '--- a (on disk)\n+++ a (your changes)\n-# Theirs\n+# Mine\n' },
  };

  it('"Keep mine" saves again over the disk version', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(conflict).mockResolvedValueOnce({ ok: true, hash: 'h10' });
    render(<ArtifactEditor path="spec/01_intent/intent.md" initial={doc} onSave={onSave} />);
    typeInEditor('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'spec/01_intent/intent.md changed on disk' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep mine' }));

    expect(onSave).toHaveBeenLastCalledWith(expect.stringContaining('mine'), 'h9');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('"Take theirs" replaces the editor content with the disk version', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(conflict);
    render(<ArtifactEditor path="spec/01_intent/intent.md" initial={doc} onSave={onSave} />);
    typeInEditor('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Take theirs' }));

    expect(within(screen.getByRole('region', { name: 'Preview' })).getByRole('heading', { name: 'Theirs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSave).toHaveBeenCalledOnce();
  });
});

describe('US-025 AC-2: artifacts by type with approval state', () => {
  it('lists groups and artifacts and selects one', async () => {
    const onSelect = vi.fn();
    render(
      <ArtifactList
        groups={[
          { kind: 'intent', label: 'Intent', artifacts: [{ path: 'spec/01_intent/intent.md', approval: 'approved', invalid: null }] },
          {
            kind: 'requirements',
            label: 'Requirements',
            artifacts: [{ path: 'spec/02_requirements/fr.md', approval: 'draft', invalid: null }],
          },
          { kind: 'other', label: 'Other', artifacts: [{ path: 'spec/x.md', approval: 'draft', invalid: 'bad yaml' }] },
        ]}
        selected="spec/01_intent/intent.md"
        onSelect={onSelect}
      />,
    );

    const requirements = screen.getByRole('group', { name: 'Requirements' });
    expect(within(requirements).getByText('Draft')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Intent' })).getByText('Approved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /intent\.md/ })).toHaveAttribute('aria-current', 'true');
    expect(within(screen.getByRole('group', { name: 'Other' })).getByText('Invalid: bad yaml')).toBeInTheDocument();
    await userEvent.click(within(requirements).getByRole('button', { name: /fr\.md/ }));
    expect(onSelect).toHaveBeenCalledWith('spec/02_requirements/fr.md');
  });

  it('explains an empty specification', () => {
    render(<ArtifactList groups={[]} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/No specifications yet/)).toBeInTheDocument();
  });
});
