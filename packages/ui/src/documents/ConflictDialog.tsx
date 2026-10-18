// SPDX-License-Identifier: Apache-2.0
// Conflict between unsaved editor changes and a file changed on disk: keep mine / take theirs / diff (US-021 AC-3, FR-018).
import { useId, useState } from 'react';

export type ConflictResolution = 'keep-mine' | 'take-theirs';

export interface ConflictDialogProps {
  path: string;
  /** Unified diff from the disk version to the unsaved draft. */
  diff: string;
  onResolve(resolution: ConflictResolution): void;
}

function lineClass(line: string): string | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-header';
  if (line.startsWith('+')) return 'diff-added';
  if (line.startsWith('-')) return 'diff-removed';
  return undefined;
}

export function ConflictDialog({ path, diff, onResolve }: ConflictDialogProps) {
  const [showDiff, setShowDiff] = useState(false);
  const titleId = useId();
  const diffId = useId();

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="dialog">
      <h3 id={titleId}>{path} changed on disk</h3>
      <p>You have unsaved changes. Keep your version (overwrites the file) or take the version on disk (discards your changes)?</p>
      <button type="button" onClick={() => onResolve('keep-mine')}>
        Keep mine
      </button>
      <button type="button" onClick={() => onResolve('take-theirs')}>
        Take theirs
      </button>
      <button type="button" aria-expanded={showDiff} aria-controls={diffId} onClick={() => setShowDiff((s) => !s)}>
        {showDiff ? 'Hide diff' : 'Show diff'}
      </button>
      {showDiff && (
        <section id={diffId} aria-label="Differences" className="diff">
          <pre>
            {diff.split('\n').map((line, index) => (
              <div key={index} className={lineClass(line)}>
                {line}
              </div>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}
