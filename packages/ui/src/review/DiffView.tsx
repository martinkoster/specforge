// SPDX-License-Identifier: Apache-2.0
// Read-only diff of one file (US-057 AC-2): side-by-side (MergeView) or unified, with CodeMirror 6 (@codemirror/merge).
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

function styleNonce(): string {
  return (window as { specforgeShell?: { styleNonce?: string } }).specforgeShell?.styleNonce ?? '';
}

export interface DiffViewProps {
  before: string;
  after: string;
  mode: 'side-by-side' | 'unified';
  label: string;
}

export function DiffView({ before, after, mode, label }: DiffViewProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base: Extension[] = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      // The renderer CSP admits CodeMirror's style element only with the session nonce.
      EditorView.cspNonce.of(styleNonce()),
    ];
    if (mode === 'side-by-side') {
      const view = new MergeView({
        a: { doc: before, extensions: [...base, EditorView.contentAttributes.of({ 'aria-label': `${label} (before)` })] },
        b: { doc: after, extensions: [...base, EditorView.contentAttributes.of({ 'aria-label': `${label} (after)` })] },
        parent: host.current!,
      });
      return () => view.destroy();
    }
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: after,
        extensions: [
          ...base,
          unifiedMergeView({ original: before, mergeControls: false }),
          EditorView.contentAttributes.of({ 'aria-label': label }),
        ],
      }),
    });
    return () => view.destroy();
  }, [before, after, mode, label]);

  return <div ref={host} className={`diff-view diff-view-${mode}`} data-testid="diff-view" />;
}
