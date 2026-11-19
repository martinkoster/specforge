// SPDX-License-Identifier: Apache-2.0
// Status badge (US-070 AC-3, ui_design_concept.md §2.1): one tone per status, always with icon and text (NFR-020).
import { LoaderCircle } from 'lucide-react';
import { Icon, STATUS_ICONS, type Tone } from './icons.js';

const TONES: Record<string, Tone> = {
  // Stories (board) and epics
  backlog: 'neutral',
  ready: 'info',
  in_progress: 'info',
  review: 'review',
  done: 'success',
  merged: 'success',
  ready_for_review: 'review',
  // Runs and execution sub-states
  none: 'neutral',
  queued: 'info',
  preparing: 'info',
  running: 'info',
  awaiting_approval: 'warning',
  awaiting_permission: 'warning',
  awaiting_answers: 'warning',
  blocked_conflict: 'warning',
  completed: 'success',
  completed_no_result: 'warning',
  failed: 'danger',
  interrupted: 'danger',
  cancelled: 'neutral',
  open: 'info',
  complete: 'success',
  finished: 'success',
  kept: 'success',
  discarded: 'neutral',
  superseded: 'neutral',
  applied: 'success',
  dismissed: 'neutral',
  // Artifacts and phases
  draft: 'neutral',
  approved: 'success',
  impacted: 'warning',
  not_started: 'neutral',
  // Setup
  ok: 'success',
  warning: 'warning',
  missing: 'danger',
  skipped: 'neutral',
  incomplete: 'warning',
};

/** Tone of a status; unknown statuses are neutral. */
export function statusTone(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

/** "in_progress" → "In progress". */
export function statusLabel(status: string): string {
  const text = status.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface StatusBadgeProps {
  status: string;
  /** Visible text; defaults to the humanised status. */
  label?: string;
  /** Overrides the tone derived from the status. */
  tone?: Tone;
  title?: string;
}

export function StatusBadge({ status, label, tone, title }: StatusBadgeProps) {
  const resolved = tone ?? statusTone(status);
  const spinning = status === 'running' || status === 'preparing';
  return (
    <span className={`badge badge-${resolved}`} {...(title ? { title } : {})}>
      {spinning ? <Icon icon={LoaderCircle} className="icon-spin" /> : <Icon icon={STATUS_ICONS[resolved]} />}
      <span>{label ?? statusLabel(status)}</span>
    </span>
  );
}
