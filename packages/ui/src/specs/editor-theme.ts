// SPDX-License-Identifier: Apache-2.0
// CodeMirror appearance from the design tokens (US-075 AC-2/AC-3, ui_design_concept.md §3): editor, gutter, selection,
// cursor, search matches, Markdown highlighting and merge-view changes. All colours are CSS variables, so the editor
// follows the light/dark switch without being recreated; CodeMirror injects these rules with the CSP nonce.
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const editorThemeSpec: Record<string, Record<string, string>> = {
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    fontSize: 'var(--text-sm)',
  },
  '&.cm-focused': { outline: '2px solid var(--focus)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--text)' },
  '.cm-gutters': {
    color: 'var(--text-subtle)',
    backgroundColor: 'var(--bg-subtle)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--surface-hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface-hover)', color: 'var(--text)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent-subtle)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-subtle)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'var(--highlight)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--highlight-strong)' },
  // Merge view (side by side and unified): changed lines with background and a +/− marker (not colour alone).
  '.cm-insertedLine': { backgroundColor: 'var(--success-subtle)', position: 'relative', paddingLeft: '1.25em' },
  '.cm-insertedLine::before': { content: '"+"', position: 'absolute', left: '0.35em', color: 'var(--success)' },
  '.cm-changedLine': { backgroundColor: 'var(--success-subtle)' },
  '.cm-changedText': { backgroundColor: 'var(--success-subtle)', textDecoration: 'underline' },
  '.cm-deletedChunk': { backgroundColor: 'var(--danger-subtle)' },
  '.cm-deletedChunk .cm-deletedLine': { position: 'relative', paddingLeft: '1.25em' },
  '.cm-deletedChunk .cm-deletedLine::before': { content: '"−"', position: 'absolute', left: '0.35em', color: 'var(--danger)' },
  '.cm-deletedText': { backgroundColor: 'var(--danger-subtle)', textDecoration: 'line-through' },
  '.cm-merge-a .cm-changedLine': { backgroundColor: 'var(--danger-subtle)' },
  '.cm-merge-b .cm-changedLine': { backgroundColor: 'var(--success-subtle)' },
};

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent-text)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--accent-text)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--info)' },
  { tag: [tags.monospace, tags.processingInstruction], color: 'var(--review)' },
  { tag: [tags.meta, tags.comment], color: 'var(--text-subtle)' },
  { tag: tags.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
]);

/** Shared editor appearance for the Markdown editor and the diff views. */
export const editorAppearance: Extension = [
  EditorView.theme(editorThemeSpec),
  EditorView.editorAttributes.of({ class: 'sf-editor' }),
  syntaxHighlighting(markdownHighlight),
];
