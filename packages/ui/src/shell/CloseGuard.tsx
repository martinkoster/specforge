// SPDX-License-Identifier: Apache-2.0
// Close dialog (US-049 AC-2, FR-041): closing with active runs lists them; confirming stops them (Interrupted).
import { Dialog } from '../components/index.js';
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';

export interface CloseBridge {
  onCloseRequested(listener: () => void): void;
  acknowledge(): void;
  confirm(): void;
  cancel(): void;
}

type ActiveRun = QueryOutput<'runs.active'>[number];

export function CloseGuard({ session, bridge }: { session: CoreSession; bridge: CloseBridge }) {
  const [runs, setRuns] = useState<ActiveRun[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bridge.onCloseRequested(() => {
      bridge.acknowledge();
      session
        .client()
        .query('runs.active', {})
        .then(
          (active) => (active.length === 0 ? bridge.confirm() : setRuns(active)),
          // Without a core connection there is nothing to stop.
          () => bridge.confirm(),
        );
    });
  }, [session, bridge]);

  if (!runs) return null;
  const keepRunning = () => {
    setRuns(null);
    bridge.cancel();
  };

  return (
    <Dialog
      role="alertdialog"
      tone="danger"
      title="Runs are still active"
      description="Closing SpecForge stops these runs; they are marked Interrupted and can be retried later."
      busy={busy}
      onClose={keepRunning}
    >
      <ul>
        {runs.map((r) => (
          <li key={r.runId}>
            {r.storyId} {r.title}
          </li>
        ))}
      </ul>
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={keepRunning}>
          Keep running
        </button>
        <button
          className="btn btn-danger"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void session
              .client()
              .command('runs.interruptAll', {})
              .finally(() => bridge.confirm());
          }}
        >
          Stop runs and close
        </button>
      </div>
    </Dialog>
  );
}
