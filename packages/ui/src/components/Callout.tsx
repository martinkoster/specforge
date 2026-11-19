// SPDX-License-Identifier: Apache-2.0
// Callout / banner (US-070 AC-3, ui_design_concept.md §5): icon, optional title, text, optional action. Warnings and
// dangers are announced as alerts, information as status, unless the caller chooses a role (e.g. a labelled region).
import type { ReactNode } from 'react';
import { CALLOUT_ICONS, Icon } from './icons.js';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

export interface CalloutProps {
  tone: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: { label: string; onClick(): void };
  role?: 'alert' | 'status' | 'region' | 'note';
  /** Accessible name (for `role="region"`). */
  label?: string;
  className?: string;
}

export function Callout({ tone, title, children, action, role, label, className }: CalloutProps) {
  const resolvedRole = role ?? (tone === 'warning' || tone === 'danger' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      {...(label ? { 'aria-label': label } : {})}
      className={`callout callout-${tone}${className ? ` ${className}` : ''}`}
    >
      <Icon icon={CALLOUT_ICONS[tone]} className="callout-icon" />
      <div className="callout-body">
        {title && <strong className="callout-title">{title}</strong>}
        {children && <div className="callout-text">{children}</div>}
      </div>
      {action && (
        <button type="button" className="btn btn-secondary btn-sm callout-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
