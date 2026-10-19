// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC = join(__dirname, '..', '..', '..', 'docs', 'spikes', 'S2-stacked-worktrees.md');

describe('US-002 AC-5: findings and go/no-go for ADR-010 are documented', () => {
  it('documents findings, path-length behaviour and a recommendation', () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, 'utf8');
    expect(doc).toMatch(/## Findings/);
    expect(doc).toMatch(/path length/i);
    expect(doc).toMatch(/## Recommendation\n+\*\*(Go|No-go)\*\*/);
  });
});
