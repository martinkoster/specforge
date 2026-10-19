// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionStore, ProjectRepository, openDatabase, type OpenDatabase, type RunEventRecord } from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const WORDS = ['compile', 'module', 'request', 'handler', 'vitest', 'render', 'schema', 'widget', 'config', 'stream', 'parser', 'cache'];

describe('US-054 AC-3 / NFR-005: search in a 100 MB run log in < 2 s', () => {
  it('finds matches in a 100 MB log in under 2 seconds and pages it without loading everything', async () => {
    const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-logperf-')) });
    opened.push(db);
    await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: '/p', vcsMode: 'git', baseBranch: 'main' });
    const store = new ExecutionStore(db.sqlite);
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });

    // ~1 KB output events until the log holds 100 MB of text; one rare marker near the end.
    const total = 100 * 1024;
    let seq = 0;
    for (let batch = 0; batch < total / 1024; batch++) {
      const events: RunEventRecord[] = [];
      for (let i = 0; i < 1024; i++) {
        seq++;
        const words: string[] = [];
        for (let w = 0; words.join(' ').length < 1000; w++) words.push(`${WORDS[(seq * 7 + w) % WORDS.length]}${(seq + w) % 997}`);
        if (seq === total - 10) words.push('needle-xyzzy');
        events.push({ seq, ts: 't', type: 'output', payload: { type: 'output', text: words.join(' ') } });
      }
      store.appendEvents(runId, events);
    }

    const started = performance.now();
    const rare = store.searchEvents(runId, 'xyzzy');
    const common = store.searchEvents(runId, 'vitest*');
    const elapsed = performance.now() - started;

    expect(rare).toEqual([total - 10]);
    expect(common).toHaveLength(1000);
    expect(elapsed).toBeLessThan(2000);
    expect(store.runEvents(runId, total - 5, 100).map((e) => e.seq)).toEqual([total - 4, total - 3, total - 2, total - 1, total]);
  }, 300_000);
});
