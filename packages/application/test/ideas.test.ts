// SPDX-License-Identifier: Apache-2.0
// US-095 AC-2: the idea inbox file `01_intent/ideas.md` (data_model.md §1.6).
import { describe, expect, it } from 'vitest';
import { appendIdea, nextIdeaId, parseIdeas, updateIdea } from '../src/specs/ideas.js';
import { parseArtifact } from '../src/indexing/parse-artifact.js';

const FILE = [
  '---',
  'kind: ideas',
  '---',
  '# Idea inbox',
  '',
  '## IDEA-007: Export board as PDF',
  '- created: 2026-10-20 · source: chat · state: turned_into_feature → FI-004',
  'Optional note text.',
  '',
  '## IDEA-008: Dark mode for print',
  '- created: 2026-10-21 · source: shortcut · state: dismissed — Covered by the theme setting.',
  '',
  '## IDEA-009: Keyboard board moves',
  '- created: 2026-10-22 · source: dashboard · state: new',
  '',
].join('\n');

describe('US-095 AC-2: ideas.md format', () => {
  it('parses ideas with date, source, state, feature link, note and dismiss reason', () => {
    expect(parseIdeas(FILE)).toEqual([
      {
        id: 'IDEA-007',
        text: 'Export board as PDF',
        note: 'Optional note text.',
        source: 'chat',
        createdAt: '2026-10-20',
        state: 'turned_into_feature',
        featureId: 'FI-004',
        dismissReason: null,
      },
      {
        id: 'IDEA-008',
        text: 'Dark mode for print',
        note: null,
        source: 'shortcut',
        createdAt: '2026-10-21',
        state: 'dismissed',
        featureId: null,
        dismissReason: 'Covered by the theme setting.',
      },
      {
        id: 'IDEA-009',
        text: 'Keyboard board moves',
        note: null,
        source: 'dashboard',
        createdAt: '2026-10-22',
        state: 'new',
        featureId: null,
        dismissReason: null,
      },
    ]);
  });

  it('appends an idea (creating the file) and assigns the next free ID', () => {
    const created = appendIdea(null, {
      id: 'IDEA-001',
      text: 'Export  board\nas PDF',
      note: 'From the retro',
      source: 'menu',
      createdAt: '2026-11-20',
    });
    expect(created).toBe(
      '---\nkind: ideas\n---\n# Idea inbox\n\n## IDEA-001: Export board as PDF\n- created: 2026-11-20 · source: menu · state: new\nFrom the retro\n',
    );
    const appended = appendIdea(FILE, {
      id: nextIdeaId(parseIdeas(FILE).map((i) => i.id)),
      text: 'Bulk edit',
      note: null,
      source: 'shortcut',
      createdAt: '2026-11-20',
    });
    expect(
      appended.endsWith(
        '## IDEA-009: Keyboard board moves\n- created: 2026-10-22 · source: dashboard · state: new\n\n## IDEA-010: Bulk edit\n- created: 2026-11-20 · source: shortcut · state: new\n',
      ),
    ).toBe(true);
    expect(nextIdeaId([])).toBe('IDEA-001');
  });

  it('updates the state line of one idea; unknown ideas return null', () => {
    const merged = updateIdea(FILE, 'IDEA-009', { state: 'merged', featureId: 'FI-002' })!;
    expect(merged).toContain('## IDEA-009: Keyboard board moves\n- created: 2026-10-22 · source: dashboard · state: merged → FI-002');
    const dismissed = updateIdea(FILE, 'IDEA-009', { state: 'dismissed', dismissReason: 'Out of scope.' })!;
    expect(parseIdeas(dismissed).find((i) => i.id === 'IDEA-009')).toMatchObject({ state: 'dismissed', dismissReason: 'Out of scope.' });
    expect(parseIdeas(updateIdea(FILE, 'IDEA-007', { state: 'new' })!)[0]).toMatchObject({ state: 'new', note: 'Optional note text.' });
    expect(updateIdea(FILE, 'IDEA-404', { state: 'new' })).toBeNull();
  });

  it('the artifact parser indexes the ideas of a `kind: ideas` file and links them to their feature', () => {
    const parsed = parseArtifact('spec/01_intent/ideas.md', FILE);
    expect(parsed.kind).toBe('ideas');
    expect(parsed.ideas?.map((i) => [i.id, i.state])).toEqual([
      ['IDEA-007', 'turned_into_feature'],
      ['IDEA-008', 'dismissed'],
      ['IDEA-009', 'new'],
    ]);
    expect(parsed.links).toContainEqual({ source: 'IDEA-007', target: 'FI-004' });
  });
});
