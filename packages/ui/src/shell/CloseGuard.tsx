// SPDX-License-Identifier: Apache-2.0
// Close dialog (US-049 AC-2, FR-041): closing with active runs lists them; confirming stops them (Interrupted).
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
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="close-title" className="dialog">
      <h2 id="close-title">Runs are still active</h2>
      <p>Closing SpecForge stops these runs; they are marked Interrupted and can be retried later.</p>
      <ul>
        {runs.map((r) => (
          <li key={r.runId}>
            {r.storyId} {r.title}
          </li>
        ))}
      </ul>
      <button
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
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setRuns(null);
          bridge.cancel();
        }}
      >
        Keep running
      </button>
    </div>
  );
}
