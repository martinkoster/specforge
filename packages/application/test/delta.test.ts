// SPDX-License-Identifier: Apache-2.0
// US-089 AC-2/AC-4: splitting a delta run's file changes into change items per element (ADR-021).
import { describe, expect, it } from 'vitest';
import { elementSections, nextFreeIds, splitDelta } from '../src/index.js';

const BEFORE = [
  '---',
  'kind: requirements',
  'approval: approved',
  '---',
  '# Functional requirements',
  '### FR-020: Export',
  'Users export tasks.',
  '### FR-034: Task details',
  'Details show title and description.',
  '',
].join('\n');

describe('US-089: element sections', () => {
  it('splits a file into the preamble and the element sections', () => {
    const { preamble, sections } = elementSections(BEFORE);
    expect(preamble).toContain('# Functional requirements');
    expect([...sections.keys()]).toEqual(['FR-020', 'FR-034']);
    expect(sections.get('FR-034')).toBe('### FR-034: Task details\nDetails show title and description.\n');
  });

  it('computes the next free IDs per prefix', () => {
    expect(nextFreeIds(['FR-020', 'FR-117', 'NFR-003', 'ADR-009', 'US-001'], ['FR', 'NFR', 'ADR'])).toEqual({
      FR: 'FR-118',
      NFR: 'NFR-004',
      ADR: 'ADR-010',
    });
    expect(nextFreeIds([], ['CON'])).toEqual({ CON: 'CON-001' });
  });
});

describe('US-089 AC-2: change items new / modified / deprecated', () => {
  it('turns the agent changes into one item per element with a patch', () => {
    const after = BEFORE.replace(
      '### FR-020: Export\nUsers export tasks.',
      '### FR-020: [DEPRECATED] Export — replaced by FI-001\nUsers export tasks.',
    )
      .replace('Details show title and description.', 'Changed by FI-001: details also show comments.\nDetails show title and description.')
      .concat('### FR-118: Comment on tasks\n**Feature**: FI-001\nUsers comment on tasks.\n');
    const { items, issues } = splitDelta({ path: 'spec/02_requirements/fr.md', before: BEFORE, after, existingIds: ['FR-020', 'FR-034'] });

    expect(issues).toEqual([]);
    expect(items.map((i) => [i.kind, i.elementId])).toEqual([
      ['deprecated', 'FR-020'],
      ['modified', 'FR-034'],
      ['new', 'FR-118'],
    ]);
    const modified = items.find((i) => i.elementId === 'FR-034')!;
    expect(modified.before).toBe('### FR-034: Task details\nDetails show title and description.\n');
    expect(modified.after).toContain('Changed by FI-001');
    expect(modified.patch).toContain('+Changed by FI-001: details also show comments.');
    expect(items.find((i) => i.kind === 'new')).toMatchObject({ before: null, after: expect.stringContaining('### FR-118') });
  });

  it('reports changes outside element sections as one file-level item', () => {
    const after = BEFORE.replace('# Functional requirements', '# Functional requirements\n\nChangelog: FI-001 added comments.');
    const { items } = splitDelta({ path: 'p.md', before: BEFORE, after, existingIds: ['FR-020', 'FR-034'] });
    expect(items).toEqual([
      expect.objectContaining({ kind: 'modified', elementId: null, patch: expect.stringContaining('+Changelog: FI-001 added comments.') }),
    ]);
  });

  it('a new file yields new items; unchanged files yield none', () => {
    const created = '---\nkind: design\n---\n### UC-020: Comment\n**Feature**: FI-001\nx\n';
    // US-090: the front-matter of a new file is a file-level item, so applying recreates the whole file.
    expect(splitDelta({ path: 'n.md', before: null, after: created, existingIds: [] }).items.map((i) => [i.kind, i.elementId])).toEqual([
      ['new', null],
      ['new', 'UC-020'],
    ]);
    expect(splitDelta({ path: 'p.md', before: BEFORE, after: BEFORE, existingIds: [] })).toEqual({ items: [], issues: [] });
  });

  it('validation rejects deleted elements, deleted files and reused IDs', () => {
    const deleted = BEFORE.replace('### FR-020: Export\nUsers export tasks.\n', '');
    expect(splitDelta({ path: 'p.md', before: BEFORE, after: deleted, existingIds: [] }).issues).toEqual([
      'p.md: FR-020 was deleted — deprecate elements instead of deleting them.',
    ]);
    expect(splitDelta({ path: 'p.md', before: BEFORE, after: null, existingIds: [] }).issues).toEqual(['p.md: the file was deleted.']);
    const reused = `${BEFORE}### FR-099: Duplicate\nx\n`;
    expect(splitDelta({ path: 'p.md', before: BEFORE, after: reused, existingIds: ['FR-099'] }).issues).toEqual([
      'p.md: FR-099 is already used elsewhere — new elements need the next free ID.',
    ]);
  });
});

describe('US-089 AC-4: new ADRs are Proposed', () => {
  it('sets the status of a new ADR to Proposed', () => {
    const after = `${BEFORE}### ADR-010: Comment storage\n**Status**: Accepted\n**Context**: Comments need storage.\n`;
    const adr = splitDelta({ path: 'p.md', before: BEFORE, after, existingIds: [] }).items.find((i) => i.elementId === 'ADR-010')!;
    expect(adr.after).toContain('**Status**: Proposed');
    expect(adr.after).not.toContain('Accepted');
    const without = splitDelta({ path: 'p.md', before: BEFORE, after: `${BEFORE}### ADR-011: X\n**Context**: c\n`, existingIds: [] })
      .items[0]!;
    expect(without.after).toBe('### ADR-011: X\n**Status**: Proposed\n**Context**: c\n');
  });
});
