// SPDX-License-Identifier: Apache-2.0
// In-app toasts for run completion, failures and permission requests (US-053 AC-3).
export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warning';
}

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss(id: number): void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span>{t.text}</span>
          <button type="button" onClick={() => onDismiss(t.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
