// SPDX-License-Identifier: Apache-2.0
// Confirmation before generating from Draft inputs (US-026 AC-3, FR-013); used by the Generate actions (US-027).
import { Dialog } from '../components/index.js';
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
    <Dialog role="alertdialog" title={<>Inputs are still Draft</>} onClose={onCancel}>
      <p>{check.warning}</p>
      <ul>
        {check.drafts.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" onClick={onConfirm}>
          Continue anyway
        </button>
      </div>
    </Dialog>
  );
}
