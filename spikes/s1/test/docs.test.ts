// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC = join(__dirname, '..', '..', '..', 'docs', 'spikes', 'S1-claude-code-adapter.md');

describe('US-001 AC-6: spike results are documented with a go/no-go recommendation', () => {
  it('has a results document', () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it('documents results per OS and a recommendation for ADR-006', () => {
    const doc = readFileSync(DOC, 'utf8');
    for (const os of ['Windows', 'macOS', 'Linux']) {
      expect(doc).toMatch(new RegExp(`### ${os}\\n+\\*\\*Status\\*\\*: `));
    }
    expect(doc).toMatch(/### Windows\n+\*\*Status\*\*: verified/);
    expect(doc).toMatch(/## Recommendation\n+\*\*(Go|No-go)\*\*/);
  });
});
