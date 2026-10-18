// SPDX-License-Identifier: Apache-2.0
// CodeMirror 6 Markdown editor (US-025). Controlled from outside only when `value` changes (e.g. "take theirs").
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

function styleNonce(): string {
  return (window as { specforgeShell?: { styleNonce?: string } }).specforgeShell?.styleNonce ?? '';
}

export interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  label: string;
  /** Moves the cursor to this 1-based line and scrolls it into view (jump to a finding, US-029); `seq` repeats a jump. */
  focusLine?: { line: number; seq: number } | null;
}

export function MarkdownEditor({ value, onChange, label, focusLine = null }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          markdown(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          // The renderer CSP admits CodeMirror's style element only with the session nonce.
          EditorView.cspNonce.of(styleNonce()),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
    // The editor is created once; later `value` changes are applied by the effect below.
  }, []);

  useEffect(() => {
    const current = view.current;
    if (current && current.state.doc.toString() !== value) {
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const current = view.current;
    if (!current || !focusLine) return;
    const line = current.state.doc.line(Math.min(Math.max(focusLine.line, 1), current.state.doc.lines));
    current.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start' }) });
    current.focus();
  }, [focusLine]);

  return <div ref={host} className="markdown-editor" />;
}
