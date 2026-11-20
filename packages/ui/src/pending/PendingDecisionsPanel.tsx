// SPDX-License-Identifier: Apache-2.0
// Pending decisions (US-053 AC-2, UC-027): permission requests, reviews, failed/interrupted runs, blocked queue items and
// recommendations, grouped by story or run.
import { Drawer, EmptyState } from '../components/index.js';
import type { QueryOutput } from '@specforge/ipc-contract';
import { PermissionPrompt, type PermissionDecision, type PermissionPromptProps } from './PermissionPrompt.js';

export type PendingGroups = QueryOutput<'pending.list'>;

export type ImpactFlags = QueryOutput<'impact.flags'>;

export interface PendingDecisionsPanelProps {
  groups: PendingGroups;
  /** Potentially impacted elements and stories (US-086). */
  impacts?: ImpactFlags;
  onClearImpact?(elementId: string): Promise<void>;
  onDecide(permissionId: string, decision: PermissionDecision): ReturnType<PermissionPromptProps['onDecide']>;
  onOpenBoard(storyId: string): void;
  onClose(): void;
}

const LABELS: Record<'failed' | 'interrupted' | 'blocked' | 'review' | 'recommendation', string> = {
  failed: 'Run failed',
  interrupted: 'Run interrupted',
  blocked: 'Blocked (conflict)',
  review: 'In Review',
  recommendation: 'Recommendation',
};

export function PendingDecisionsPanel({ groups, impacts = [], onClearImpact, onDecide, onOpenBoard, onClose }: PendingDecisionsPanelProps) {
  const count = groups.reduce((n, g) => n + g.items.length, 0) + impacts.length;
  return (
    <Drawer title="Pending decisions" label={`Pending decisions (${count})`} onClose={onClose}>
      {impacts.length > 0 && (
        <section aria-label="Potentially impacted" className="pending-group">
          <h3>Potentially impacted</h3>
          {impacts.map((f) => (
            <div key={f.elementId} className="pending-item">
              <span className="badge badge-warning">Impacted</span>{' '}
              <span>
                {f.elementId}
                {f.orphaned ? ' (no longer exists)' : ''} — {f.reason}
              </span>{' '}
              {onClearImpact && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  aria-label={`Clear flag of ${f.elementId}`}
                  onClick={() => void onClearImpact(f.elementId)}
                >
                  Clear flag
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {groups.length === 0 && impacts.length === 0 && (
        <EmptyState compact title="Nothing is waiting for you." description="Permission requests, reviews and failed runs appear here." />
      )}
      {groups.map((group) => {
        const label = group.storyId ? `${group.storyId} ${group.title}` : group.title;
        return (
          <section key={group.storyId ?? group.runId} aria-label={label} className="pending-group">
            <h3>{label}</h3>
            {group.items.map((item, index) =>
              item.kind === 'permission' ? (
                <PermissionPrompt
                  key={item.permission.id}
                  storyId={group.storyId}
                  permission={item.permission}
                  onDecide={(decision) => onDecide(item.permission.id, decision)}
                />
              ) : (
                <div key={`${item.kind}-${index}`} className="pending-item">
                  <span className="badge">{LABELS[item.kind]}</span> <span>{item.detail}</span>
                </div>
              ),
            )}
            {group.storyId && group.items.some((i) => i.kind !== 'permission') && (
              <button className="btn btn-secondary" type="button" onClick={() => onOpenBoard(group.storyId!)}>
                Open on the board
              </button>
            )}
          </section>
        );
      })}
    </Drawer>
  );
}
