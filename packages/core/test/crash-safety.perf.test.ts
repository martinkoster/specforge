// SPDX-License-Identifier: Apache-2.0
// US-064 (NFR-015, FR-040): kill the real core at random points during artifact saves and run-event persistence; no
// artifact may be corrupt, the database must stay readable and at most the last second of log output may be lost.
// Uses the built packages (run `pnpm build` first); part of `pnpm test:perf` because it depends on timing.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killTree } from '@specforge/process';
import { ExecutionStore, openDatabase } from '@specforge/sqlite';
import { describe, expect, it } from 'vitest';

const CHILD = join(import.meta.dirname, 'fault', 'core-child.mjs');
const CYCLES = 20;

interface CycleResult {
  ops: number;
  runId: string;
  events: Array<{ seq: number; at: number }>;
  killedAt: number;
}

function runCycle(appDataDir: string, workspaceParent: string, cycle: number): Promise<CycleResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, appDataDir, workspaceParent, String(cycle)], {
      cwd: join(import.meta.dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ops = 0;
    let buffer = '';
    let killedAt = 0;
    let runId = '';
    const events: Array<{ seq: number; at: number }> = [];
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.stdout.on('data', (d: Buffer) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith('ready') && !killedAt) {
          runId = line.split(' ')[1]!;
          // Kill at a random point while saves and the run's output are in flight.
          setTimeout(
            () => {
              killedAt = Date.now();
              void killTree(child.pid!);
            },
            150 + Math.random() * 600,
          );
        } else if (line.startsWith('saved')) ops += 1;
        else if (line.startsWith('event')) {
          const [, eventRunId, seq, at] = line.split(' ');
          if (eventRunId === runId) events.push({ seq: Number(seq), at: Number(at) });
        }
      }
    });
    child.on('exit', () => {
      if (!killedAt) return reject(new Error(`child exited on its own: ${stderr}`));
      resolve({ ops, runId, events, killedAt });
    });
  });
}

describe('US-064: fault injection during saves and runs', () => {
  it('AC-1/AC-2: after random kills no artifact is corrupt, the database is readable and ≤ 1 s of log output is lost', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'sf-crash-app-'));
    const workspaceParent = mkdtempSync(join(tmpdir(), 'sf-crash-ws-'));
    const workspace = join(workspaceParent, 'crash');
    let totalOps = 0;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const result = await runCycle(appDataDir, workspaceParent, cycle);
      expect(result.events.length, 'the run streamed output before the kill').toBeGreaterThan(0);
      totalOps += result.ops;

      // Artifacts: every file is one complete version (header and trailer agree).
      const dir = join(workspace, 'spec', '02_requirements');
      for (const name of readdirSync(dir).filter((n) => /^file-\d\.md$/.test(n))) {
        const content = readFileSync(join(dir, name), 'utf8');
        const header = /^---\nkind: requirements\nversion: (\S+)\n---\n/.exec(content)?.[1];
        expect(header, `${name} has no valid front-matter`).toBeDefined();
        expect(content.endsWith(`\nEND ${header}\n`), `${name} is incomplete`).toBe(true);
      }

      // Database: integrity intact and readable; events older than 1 s before the kill were persisted.
      const db = openDatabase({ dir: appDataDir });
      try {
        expect(db.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
        const store = new ExecutionStore(db.sqlite);
        const persisted = new Set(store.runEvents(result.runId).map((e) => e.seq));
        const required = result.events.filter((e) => e.at < result.killedAt - 1000);
        expect(required.filter((e) => !persisted.has(e.seq))).toEqual([]);
      } finally {
        db.close();
      }
    }

    expect(totalOps).toBeGreaterThanOrEqual(100);
  }, 300_000);
});
