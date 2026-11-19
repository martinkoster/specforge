// SPDX-License-Identifier: Apache-2.0
// In-app toasts for run completion, failures and permission requests (US-053 AC-3, US-071 AC-3): bottom-right stack,
// status icon and stripe; info and success dismiss themselves after 5 s, warnings and errors stay until dismissed.
import { useEffect } from 'react';
import { CALLOUT_ICONS, Icon } from '../components/icons.js';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  action?: { label: string; onClick(): void };
}

export const TOAST_AUTO_DISMISS_MS = 5000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss(id: number): void }) {
  const transient = toast.tone === 'info' || toast.tone === 'success';
  useEffect(() => {
    if (!transient) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [transient, toast.id, onDismiss]);
  return (
    <div className={`toast toast-${toast.tone}`} {...(toast.tone === 'danger' ? { role: 'alert' } : {})}>
      <Icon icon={CALLOUT_ICONS[toast.tone]} className="toast-icon" />
      <span className="toast-text">{toast.text}</span>
      {toast.action && (
        <button className="btn btn-secondary btn-sm" type="button" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      )}
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => onDismiss(toast.id)}>
        Dismiss
      </button>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss(id: number): void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
