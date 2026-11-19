// SPDX-License-Identifier: Apache-2.0
// Conflict between unsaved editor changes and a file changed on disk: keep mine / take theirs / diff (US-021 AC-3, FR-018).
import { Dialog } from '../components/index.js';
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
  const diffId = useId();

  return (
    <Dialog
      role="alertdialog"
      title={`${path} changed on disk`}
      description="You have unsaved changes. Keep your version (overwrites the file) or take the version on disk (discards your changes)?"
      busy
      onClose={() => undefined}
    >
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={() => onResolve('keep-mine')}>
          Keep mine
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => onResolve('take-theirs')}>
          Take theirs
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          aria-expanded={showDiff}
          aria-controls={diffId}
          onClick={() => setShowDiff((s) => !s)}
        >
          {showDiff ? 'Hide diff' : 'Show diff'}
        </button>
      </div>
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
    </Dialog>
  );
}
