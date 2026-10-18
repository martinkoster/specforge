// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordResult, resultsFile } from '../src/record.js';

describe('US-001 AC-6 (support): live results are recorded as evidence per OS', () => {
  it('merges scenario outcomes into one JSON file with timestamps', () => {
    const file = join(mkdtempSync(join(tmpdir(), 's1-rec-')), 'live-test.json');

    recordResult('a', { ok: true }, file);
    recordResult('b', { ok: false }, file);

    const data = JSON.parse(readFileSync(file, 'utf8'));
    expect(data.a).toMatchObject({ ok: true });
    expect(data.b).toMatchObject({ ok: false });
    expect(typeof data.a.recordedAt).toBe('string');
  });

  it('names the results file after the platform', () => {
    expect(resultsFile('linux')).toMatch(/results[\\/]live-linux\.json$/);
  });
});
