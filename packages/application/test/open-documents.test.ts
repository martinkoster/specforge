// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { OpenDocuments } from '../src/index.js';

function setup() {
  const writes: Array<{ path: string; content: string; expectedHash: string | null }> = [];
  const conflicts: unknown[] = [];
  const docs = new OpenDocuments(
    {
      writeAtomic: vi.fn(async (path: string, content: string, options: { expectedHash: string | null }) => {
        writes.push({ path, content, expectedHash: options.expectedHash });
        return `hash-of:${content}`;
      }),
    },
    (c) => conflicts.push(c),
  );
  docs.open('spec/intent.md', 'original\n', 'h1');
  return { docs, writes, conflicts };
}

describe('US-021 AC-3: conflicts between unsaved edits and external changes', () => {
  it('raises a conflict with both versions and a diff when a dirty document changes on disk', () => {
    const { docs, conflicts } = setup();
    docs.edit('spec/intent.md', 'mine\n');

    docs.externalChange('spec/intent.md', 'theirs\n', 'h2');

    expect(conflicts).toEqual([
      expect.objectContaining({
        path: 'spec/intent.md',
        mine: 'mine\n',
        theirs: 'theirs\n',
        options: ['keep-mine', 'take-theirs', 'diff'],
      }),
    ]);
    const conflict = conflicts[0] as { diff: string };
    expect(conflict.diff).toContain('-theirs');
    expect(conflict.diff).toContain('+mine');
  });

  it('silently reloads a clean document', () => {
    const { docs, conflicts } = setup();

    docs.externalChange('spec/intent.md', 'theirs\n', 'h2');

    expect(conflicts).toEqual([]);
    expect(docs.get('spec/intent.md')).toEqual({ path: 'spec/intent.md', content: 'theirs\n', baseHash: 'h2', dirty: false });
  });

  it('ignores external changes that match the document base', () => {
    const { docs, conflicts } = setup();
    docs.edit('spec/intent.md', 'mine\n');

    docs.externalChange('spec/intent.md', 'original\n', 'h1');

    expect(conflicts).toEqual([]);
  });

  it('keep mine writes the draft over the new disk version', async () => {
    const { docs, writes } = setup();
    docs.edit('spec/intent.md', 'mine\n');
    docs.externalChange('spec/intent.md', 'theirs\n', 'h2');

    await docs.resolve('spec/intent.md', 'keep-mine');

    expect(writes).toEqual([{ path: 'spec/intent.md', content: 'mine\n', expectedHash: 'h2' }]);
    expect(docs.get('spec/intent.md')).toMatchObject({ content: 'mine\n', dirty: false, baseHash: 'hash-of:mine\n' });
  });

  it('take theirs discards the draft', async () => {
    const { docs, writes } = setup();
    docs.edit('spec/intent.md', 'mine\n');
    docs.externalChange('spec/intent.md', 'theirs\n', 'h2');

    await docs.resolve('spec/intent.md', 'take-theirs');

    expect(writes).toEqual([]);
    expect(docs.get('spec/intent.md')).toMatchObject({ content: 'theirs\n', dirty: false, baseHash: 'h2' });
  });

  it('refuses to resolve without a pending conflict and closes documents', async () => {
    const { docs } = setup();

    await expect(docs.resolve('spec/intent.md', 'keep-mine')).rejects.toThrow(/No conflict/);
    docs.close('spec/intent.md');
    expect(docs.get('spec/intent.md')).toBeUndefined();
  });
});
