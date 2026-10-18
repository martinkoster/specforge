// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC = join(__dirname, '..', '..', '..', 'docs', 'spikes', 'S3-process-trees.md');

describe('US-003 AC-3: findings are documented', () => {
  it('documents Windows and POSIX results and a recommendation', () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, 'utf8');
    expect(doc).toMatch(/Windows/);
    expect(doc).toMatch(/POSIX|Linux/);
    expect(doc).toMatch(/## Recommendation\n+\*\*(Go|No-go)\*\*/);
  });
});
