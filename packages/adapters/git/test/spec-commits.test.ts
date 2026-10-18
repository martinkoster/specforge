// SPDX-License-Identifier: Apache-2.0
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SpecCommits } from '../src/index.js';
import { commitFile, makeRepo, sh } from './helpers.js';

// Many Git invocations per test (~0.4 s each on Windows), slower under the parallel suite.
vi.setConfig({ testTimeout: 120_000 });

function repoWithSpecs() {
  const repo = makeRepo('sf-speccommit-');
  commitFile(repo, 'spec/02_requirements/fr.md', '# FR\n', 'spec');
  commitFile(repo, 'spec/03_design/old.md', 'old\n', 'design');
  return repo;
}

const write = (repo: string, path: string, content: string) => {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), content);
};

describe('US-023 AC-1: uncommitted specification files', () => {
  it('lists added, modified and deleted files under spec/ and .specforge/ only', async () => {
    const repo = repoWithSpecs();
    write(repo, 'spec/02_requirements/fr.md', '# FR\nchanged\n');
    write(repo, 'spec/02_requirements/new folder/nfr.md', '# NFR\n');
    rmSync(join(repo, 'spec/03_design/old.md'));
    write(repo, '.specforge/project.yaml', 'id: p\n');
    write(repo, 'src/app.ts', 'export {};\n');

    expect(await new SpecCommits().status(repo)).toEqual([
      { path: '.specforge/project.yaml', change: 'A' },
      { path: 'spec/02_requirements/fr.md', change: 'M' },
      { path: 'spec/02_requirements/new folder/nfr.md', change: 'A' },
      { path: 'spec/03_design/old.md', change: 'D' },
    ]);
  });

  it('is empty for a clean working copy', async () => {
    expect(await new SpecCommits().status(repoWithSpecs())).toEqual([]);
  });
});

describe('US-023 AC-2: diffs and commit of exactly these paths', () => {
  it('shows a unified diff for tracked and new files', async () => {
    const repo = repoWithSpecs();
    write(repo, 'spec/02_requirements/fr.md', '# FR\nchanged\n');
    write(repo, 'spec/02_requirements/nfr.md', '# NFR\n');
    const commits = new SpecCommits();

    expect(await commits.diff(repo, 'spec/02_requirements/fr.md')).toContain('+changed');
    const added = await commits.diff(repo, 'spec/02_requirements/nfr.md');
    expect(added).toContain('+++ b/spec/02_requirements/nfr.md');
    expect(added).toContain('+# NFR');
  });

  it('commits only the given spec paths on the current branch; other changes stay uncommitted', async () => {
    const repo = repoWithSpecs();
    write(repo, 'spec/02_requirements/fr.md', '# FR\nchanged\n');
    write(repo, 'spec/02_requirements/nfr.md', '# NFR\n');
    rmSync(join(repo, 'spec/03_design/old.md'));
    write(repo, 'src/app.ts', 'export {};\n');
    sh(repo, 'add', 'src/app.ts');

    const result = await new SpecCommits().commit(
      repo,
      ['spec/02_requirements/fr.md', 'spec/02_requirements/nfr.md', 'spec/03_design/old.md'],
      'Update specification',
    );

    expect(result).toEqual({ ok: true, commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(sh(repo, 'log', '-1', '--format=%s')).toBe('Update specification');
    expect(sh(repo, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual([
      'A\tspec/02_requirements/nfr.md',
      'D\tspec/03_design/old.md',
      'M\tspec/02_requirements/fr.md',
    ]);
    expect(sh(repo, 'status', '--porcelain')).toBe('A  src/app.ts');
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
  });

  it('refuses paths outside spec/ and .specforge/', async () => {
    const repo = repoWithSpecs();
    await expect(new SpecCommits().commit(repo, ['src/app.ts'], 'x')).rejects.toThrow(/only specification files/);
    await expect(new SpecCommits().commit(repo, ['spec/../src/app.ts'], 'x')).rejects.toThrow(/only specification files/);
  });
});

describe('US-023 AC-3: failing Git hooks', () => {
  it('returns the hook output; nothing is committed and the index is left as it was', async () => {
    const repo = repoWithSpecs();
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\necho "lint failed: trailing whitespace" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    write(repo, 'spec/02_requirements/nfr.md', '# NFR\n');
    const head = sh(repo, 'rev-parse', 'HEAD');

    const result = await new SpecCommits().commit(repo, ['spec/02_requirements/nfr.md'], 'Update specification');

    expect(result).toEqual({ ok: false, output: expect.stringContaining('lint failed: trailing whitespace') });
    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(sh(repo, 'status', '--porcelain')).toBe('?? spec/02_requirements/nfr.md');
  });
});
