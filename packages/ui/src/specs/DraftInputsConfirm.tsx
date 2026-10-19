// SPDX-License-Identifier: Apache-2.0
// Confirmation before generating from Draft inputs (US-026 AC-3, FR-013); used by the Generate actions (US-027).
import { useEffect, useRef } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';

export interface DraftInputsConfirmProps {
  check: QueryOutput<'artifacts.generationCheck'>;
  onConfirm(): void;
  onCancel(): void;
}

export function DraftInputsConfirm({ check, onConfirm, onCancel }: DraftInputsConfirmProps) {
  const confirmed = check.warning === null;
  const done = useRef(false);
  useEffect(() => {
    // Approved inputs need no confirmation; confirm exactly once per check (the callback may change on every render).
    if (confirmed && !done.current) {
      done.current = true;
      onConfirm();
    }
  }, [confirmed, onConfirm]);
  if (confirmed) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="draft-inputs-title" className="dialog">
      <h2 id="draft-inputs-title">Inputs are still Draft</h2>
      <p>{check.warning}</p>
      <ul>
        {check.drafts.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <button type="button" onClick={onConfirm}>
        Continue anyway
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
