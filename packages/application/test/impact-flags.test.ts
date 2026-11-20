// SPDX-License-Identifier: Apache-2.0
// US-086: Potentially impacted flags (FR-017 downstream impact, FR-071 cascade to dependents, ADR-025).
import { describe, expect, it } from 'vitest';
import type { BoardStatus } from '@specforge/domain';
import { ImpactFlagService, type ImpactFlagDeps, type ImpactFlagRecord } from '../src/index.js';

function setup() {
  const flags = new Map<string, ImpactFlagRecord>();
  const elements: Record<string, string> = {
    'FR-003': 'spec/02_requirements/fr.md',
    'UC-001': 'spec/03_design/uc.md',
    'US-001': 'spec/04_user_stories/US-001.md',
    'US-002': 'spec/04_user_stories/US-002.md',
    'US-005': 'spec/04_user_stories/US-005.md',
    'US-006': 'spec/04_user_stories/US-006.md',
  };
  // source → targets ("source references target")
  const links: Record<string, string[]> = { 'UC-001': ['FR-003'], 'US-001': ['FR-003', 'UC-001'] };
  const status: Record<string, BoardStatus> = { 'US-005': 'review', 'US-006': 'backlog', 'US-007': 'in_progress' };
  const dependents: Record<string, string[]> = { 'US-002': ['US-005', 'US-006', 'US-007'] };
  let clock = 0;
  const deps: ImpactFlagDeps = {
    store: {
      flag: (r) => void flags.set(`${r.projectId}:${r.elementId}`, r),
      clear: (projectId, elementId) => void flags.delete(`${projectId}:${elementId}`),
      list: (projectId) => [...flags.values()].filter((f) => f.projectId === projectId),
    },
    index: {
      linkSources: (_p, id) => Object.keys(links).filter((s) => links[s]!.includes(id)),
      dependents: (_p, id) => (dependents[id] ?? []).map((d) => ({ id: d, status: status[d] ?? 'backlog' })),
      elementPath: (_p, id) => elements[id],
    },
    now: () => `2026-11-20T10:00:0${clock++}.000Z`,
  };
  return { service: new ImpactFlagService(deps), flags };
}

describe('US-086 AC-1/AC-5 (FR-017): downstream elements of a changed approved element', () => {
  it('editing requirement FR-003 flags the design and stories linked to it; clearing removes the flag', () => {
    const { service } = setup();
    service.elementsChanged('p1', [{ elementId: 'FR-003', type: 'fr', wasApproved: true }]);

    expect(service.list('p1')).toEqual([
      {
        elementId: 'UC-001',
        sourceRef: 'FR-003',
        reason: 'FR-003 changed after it was approved.',
        flaggedAt: expect.any(String),
        path: 'spec/03_design/uc.md',
        orphaned: false,
      },
      {
        elementId: 'US-001',
        sourceRef: 'FR-003',
        reason: 'FR-003 changed after it was approved.',
        flaggedAt: expect.any(String),
        path: 'spec/04_user_stories/US-001.md',
        orphaned: false,
      },
    ]);
    service.clear('p1', 'US-001');
    expect(service.list('p1').map((f) => f.elementId)).toEqual(['UC-001']);
  });

  it('changes of Draft elements flag nothing downstream', () => {
    const { service } = setup();
    service.elementsChanged('p1', [{ elementId: 'FR-003', type: 'fr', wasApproved: false }]);
    expect(service.list('p1')).toEqual([]);
  });
});

describe('US-086 AC-2/AC-5 (FR-071): dependents of a changed story', () => {
  it('editing the acceptance criteria of US-002 flags US-005 (Review) and US-007 (In Progress), not the Backlog story', () => {
    const { service } = setup();
    service.elementsChanged('p1', [{ elementId: 'US-002', type: 'story', wasApproved: false }]);

    const flagged = service.list('p1');
    expect(flagged.map((f) => [f.elementId, f.sourceRef])).toEqual([
      ['US-005', 'US-002'],
      ['US-007', 'US-002'],
    ]);
    expect(flagged[0]!.reason).toBe('The description or acceptance criteria of US-002 changed.');
  });
});

describe('US-086 AC-4: orphaned flags', () => {
  it('flags of IDs that no longer exist are orphaned and can be cleared', () => {
    const { service } = setup();
    service.elementsChanged('p1', [{ elementId: 'US-002', type: 'story', wasApproved: false }]);
    expect(service.list('p1').find((f) => f.elementId === 'US-007')).toMatchObject({ path: null, orphaned: true });
    service.clear('p1', 'US-007');
    expect(service.isFlagged('p1', 'US-007')).toBe(false);
    expect(service.isFlagged('p1', 'US-005')).toBe(true);
  });
});
