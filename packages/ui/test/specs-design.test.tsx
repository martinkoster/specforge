// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-075 (UF-02, UF-06, NFR-033, ui_design_concept.md §3, §4.2): document layout, editor and diff themes, review cards.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffView } from '../src/review/DiffView.js';
import { editorThemeSpec } from '../src/specs/editor-theme.js';
import { ArtifactList } from '../src/specs/ArtifactList.js';
import { MarkdownEditor } from '../src/specs/MarkdownEditor.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(cleanupChecked);

const values = (spec: Record<string, Record<string, string>>) => Object.values(spec).flatMap((rule) => Object.entries(rule));

describe('US-075 AC-2/AC-3: CodeMirror theme from tokens', () => {
  it('styles background, text, gutter, selection, cursor, search matches and diff lines only with tokens', () => {
    for (const selector of [
      '&',
      '.cm-gutters',
      '.cm-activeLine',
      '.cm-selectionBackground',
      '.cm-cursor',
      '.cm-searchMatch',
      '.cm-insertedLine',
      '.cm-deletedChunk',
    ]) {
      expect(Object.keys(editorThemeSpec), selector).toContain(selector);
    }
    for (const [property, value] of values(editorThemeSpec)) {
      if (/color|background|border|caret/i.test(property))
        expect(value, `${property}: ${value}`).toMatch(
          /^(var\(--[\w-]+\)|transparent|none|inherit|1px solid var\(--[\w-]+\)|2px solid var\(--[\w-]+\))$/,
        );
    }
    expect(editorThemeSpec['.cm-insertedLine']!.backgroundColor).toBe('var(--success-subtle)');
    expect(editorThemeSpec['.cm-deletedChunk']!.backgroundColor).toBe('var(--danger-subtle)');
    expect(editorThemeSpec['.cm-insertedLine::before']!.content).toBe('"+"');
    expect(editorThemeSpec['.cm-deletedChunk .cm-deletedLine::before']!.content).toBe('"−"');
  });

  it('the Markdown editor and both diff layouts use the shared appearance', () => {
    const { container } = render(
      <>
        <MarkdownEditor value="# Intent" onChange={() => undefined} label="Edit intent.md" />
        <DiffView before={'a\n'} after={'b\n'} mode="side-by-side" label="README.md" />
        <DiffView before={'a\n'} after={'b\n'} mode="unified" label="NOTES.md" />
      </>,
    );
    expect(container.querySelectorAll('.cm-editor.sf-editor').length).toBeGreaterThanOrEqual(4);
  });
});

describe('US-075 AC-1: document layout', () => {
  it('the artifact list uses list rows with status badges', () => {
    render(
      <ArtifactList
        groups={
          [
            {
              kind: 'requirements',
              label: 'Requirements',
              artifacts: [
                { path: 'spec/02_requirements/functional_requirements.md', approval: 'approved', invalid: null },
                { path: 'spec/02_requirements/constraints.md', approval: 'draft', invalid: 'missing kind' },
              ],
            },
          ] as never
        }
        selected="spec/02_requirements/constraints.md"
        onSelect={() => undefined}
      />,
    );
    const item = screen.getByRole('button', { name: 'functional_requirements.md' });
    expect(item).toHaveClass('artifact-item');
    expect(within(item.closest('li')!).getByText('Approved').closest('.badge')).toHaveClass('badge-success');
    expect(screen.getByText('Draft').closest('.badge')).toHaveClass('badge-neutral');
    expect(screen.getByText('Invalid: missing kind').closest('.badge')).toHaveClass('badge-danger');
    expect(screen.getByRole('button', { name: 'constraints.md' })).toHaveAttribute('aria-current', 'true');
  });

  it('the Markdown preview reads like a document; the specification styles define the readable column', () => {
    const specs = readFileSync(join(__dirname, '..', 'src', 'styles', 'areas', 'specs.css'), 'utf8');
    expect(specs).toMatch(/\.markdown-preview \{[^}]*max-width: 72ch/);
    expect(specs).toMatch(/\.finding \{[^}]*border-radius: var\(--radius-lg\)/);
    expect(specs).toMatch(/\.clarify-item \{[^}]*border-radius: var\(--radius-lg\)/);
  });
});
