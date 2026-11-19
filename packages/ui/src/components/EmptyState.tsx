// SPDX-License-Identifier: Apache-2.0
// Empty state (US-073 AC-3, ui_design_concept.md §4.2): icon, one-line title, one-line explanation, primary action.
import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icons.js';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: { label: string; onClick(): void };
  icon?: LucideIcon;
  /** Compact variant inside cards and panels. */
  compact?: boolean;
}

export function EmptyState({ title, description, action, icon = Inbox, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
      <Icon icon={icon} size={24} className="empty-state-icon" />
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-text">{description}</p>}
      {action && (
        <button type="button" className="btn btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
