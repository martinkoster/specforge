// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceFiles, watchWorkspace, type WorkspaceWatcher } from '../src/index.js';

const watchers: WorkspaceWatcher[] = [];
afterEach(async () => {
  for (const w of watchers.splice(0)) await w.close();
});

function write(root: string, rel: string, content = 'x') {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('US-021 AC-1: workspace watcher', () => {
  it('reports only Markdown artifacts of the main workspace, debounced into one batch', async () => {
    // tmpdir() may contain Windows 8.3 short names; the watcher must cope (libuv fs-event assertion regression).
    const root = mkdtempSync(join(tmpdir(), 'sf-watch-unit-'));
    write(root, 'spec/a.md');
    write(root, 'spec/nested/.git', 'gitdir: elsewhere');
    write(root, 'spec/ignored-root/x.md');
    const batches: string[][] = [];
    const watcher = await watchWorkspace(root, { debounceMs: 150, ignore: [join(root, 'spec', 'ignored-root')] }, (paths) =>
      batches.push(paths),
    );
    watchers.push(watcher);
    // macOS (FSEvents) may replay the setup writes after 'ready' and miss changes made right after it: let the
    // watcher settle, then discard what it replayed — the test is about changes made while watching.
    await new Promise((r) => setTimeout(r, 500));
    batches.length = 0;

    write(root, 'spec/a.md', 'changed');
    write(root, 'spec/b.md', 'new');
    write(root, 'spec/notes.txt', 'not markdown');
    write(root, 'src/code.md', 'outside artifact roots');
    write(root, 'spec/node_modules/pkg/readme.md', 'dependency');
    write(root, 'spec/nested/inner.md', 'nested repository');
    write(root, 'spec/ignored-root/x.md', 'configured ignore');
    write(root, '.specforge/instructions.md', 'instructions');

    const deadline = Date.now() + 3000;
    while (batches.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 300));

    expect(batches).toEqual([['.specforge/instructions.md', 'spec/a.md', 'spec/b.md']]);
  });
});

describe('US-078 AC-2: watcher and file listing follow a nested specification root', () => {
  it('reports Markdown below docs/spec only, not a top-level spec/ folder or other docs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-watch-root-'));
    write(root, 'docs/spec/01_intent/intent.md');
    const batches: string[][] = [];
    const watcher = await watchWorkspace(root, { debounceMs: 150, artifactRoots: ['docs/spec', '.specforge'] }, (paths) =>
      batches.push(paths),
    );
    watchers.push(watcher);
    await new Promise((r) => setTimeout(r, 500));
    batches.length = 0;

    write(root, 'docs/spec/02_requirements/fr.md', 'new');
    write(root, 'docs/readme.md', 'other docs');
    write(root, 'spec/user_spec.md', 'rspec-style folder');

    const deadline = Date.now() + 3000;
    while (batches.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 300));

    expect(batches.flat()).toEqual(['docs/spec/02_requirements/fr.md']);
  });

  it('lists artifacts below the nested root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-list-root-'));
    write(root, 'docs/spec/01_intent/intent.md');
    write(root, 'spec/user_spec.md');
    write(root, '.specforge/instructions.md');
    const listed = await new WorkspaceFiles(root, { artifactRoots: ['docs/spec', '.specforge'] }).list();
    expect(listed).toEqual(['.specforge/instructions.md', 'docs/spec/01_intent/intent.md']);
  });
});
