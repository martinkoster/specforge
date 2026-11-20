// SPDX-License-Identifier: Apache-2.0
// Potentially impacted flags (US-086, FR-017, FR-071, UC-010, ADR-025): when an approved element changes, its downstream
// elements and stories are flagged; when a story's description or acceptance criteria change, its started dependents
// are flagged. Flags are workflow state (`impact_flag`), cleared only by the user.
import type { BoardStatus } from '@specforge/domain';

export interface ElementChange {
  elementId: string;
  /** Element type (`fr`, `uc`, `story`, …). */
  type: string;
  /** The artifact was approved before the change. */
  wasApproved: boolean;
}

export interface ImpactFlagRecord {
  projectId: string;
  elementId: string;
  sourceRef: string;
  reason: string;
  flaggedAt: string;
}

export interface ImpactFlagView {
  elementId: string;
  sourceRef: string;
  reason: string;
  flaggedAt: string;
  /** Artifact of the flagged element; null when the ID no longer exists. */
  path: string | null;
  orphaned: boolean;
}

export interface ImpactFlagDeps {
  store: {
    flag(record: ImpactFlagRecord): void;
    clear(projectId: string, elementId: string): void;
    list(projectId: string): ImpactFlagRecord[];
  };
  index: {
    /** Elements and stories that reference `id` (downstream). */
    linkSources(projectId: string, id: string): string[];
    /** Stories that depend on `storyId`. */
    dependents(projectId: string, storyId: string): { id: string; status: BoardStatus }[];
    elementPath(projectId: string, id: string): string | undefined;
  };
  now(): string;
}

/** FR-071: dependents that are queued or running (In Progress), in Review or Done. */
const STARTED: ReadonlySet<BoardStatus> = new Set(['in_progress', 'review', 'done']);
const byId = (a: { elementId: string }, b: { elementId: string }) => (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0);

export class ImpactFlagService {
  constructor(private readonly deps: ImpactFlagDeps) {}

  /** Called by the index when element contents changed (in the app, by an agent or externally). */
  elementsChanged(projectId: string, changes: readonly ElementChange[]): void {
    for (const change of changes) {
      const id = change.elementId;
      if (change.type === 'story') {
        for (const dependent of this.deps.index.dependents(projectId, id)) {
          if (STARTED.has(dependent.status))
            this.flag(projectId, dependent.id, id, `The description or acceptance criteria of ${id} changed.`);
        }
      }
      if (change.wasApproved) {
        for (const downstream of this.deps.index.linkSources(projectId, id)) {
          if (downstream !== id) this.flag(projectId, downstream, id, `${id} changed after it was approved.`);
        }
      }
    }
  }

  list(projectId: string): ImpactFlagView[] {
    return this.deps.store
      .list(projectId)
      .map((f) => {
        const path = this.deps.index.elementPath(projectId, f.elementId) ?? null;
        return { elementId: f.elementId, sourceRef: f.sourceRef, reason: f.reason, flaggedAt: f.flaggedAt, path, orphaned: path === null };
      })
      .sort(byId);
  }

  isFlagged(projectId: string, elementId: string): boolean {
    return this.deps.store.list(projectId).some((f) => f.elementId === elementId);
  }

  /** Flags an element or story directly (e.g. an in-flight story kept unchanged, US-091). */
  flagDirect(projectId: string, elementId: string, sourceRef: string, reason: string): void {
    this.flag(projectId, elementId, sourceRef, reason);
  }

  /** *Clear flag* (AC-4). */
  clear(projectId: string, elementId: string): void {
    this.deps.store.clear(projectId, elementId);
  }

  private flag(projectId: string, elementId: string, sourceRef: string, reason: string): void {
    this.deps.store.flag({ projectId, elementId, sourceRef, reason, flaggedAt: this.deps.now() });
  }
}
