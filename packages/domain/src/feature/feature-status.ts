// SPDX-License-Identifier: Apache-2.0
// Feature intent lifecycle (US-081, FR-104, ADR-021, data_model.md §1.5): derived by SpecForge; Withdrawn is set only
// by the user and is terminal.
import type { BoardStatus } from '../story/state-machine.js';

export const FEATURE_STATUSES = ['draft', 'approved', 'in_delivery', 'done', 'withdrawn'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export interface FeatureStatusInput {
  approval: 'draft' | 'approved';
  /** The status currently recorded in the file. */
  recorded: FeatureStatus;
  /** Board states of the stories linked with `feature: FI-xxx`. */
  linkedStories: readonly BoardStatus[];
  /** A delta change set of the feature was accepted (applied). */
  acceptedDelta: boolean;
}

export function featureStatus(input: FeatureStatusInput): FeatureStatus {
  if (input.recorded === 'withdrawn') return 'withdrawn';
  if (input.approval !== 'approved') return 'draft';
  const stories = input.linkedStories;
  if (stories.length > 0 && stories.every((s) => s === 'done')) return 'done';
  if (stories.length > 0 || input.acceptedDelta) return 'in_delivery';
  return 'approved';
}

/** Next free `FI-` number after the highest existing one (IDs are never reused). */
export function nextFeatureId(existing: readonly string[]): string {
  const highest = existing.reduce((max, id) => {
    const m = /^FI-(\d+)$/.exec(id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `FI-${String(highest + 1).padStart(3, '0')}`;
}
