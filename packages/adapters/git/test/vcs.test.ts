// SPDX-License-Identifier: Apache-2.0
// GitVcs (US-079): repository location of a folder and commits limited to SpecForge files.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitVcs } from '../src/vcs.js';
import { makeRepo, sh } from './helpers.js';

describe('US-079: GitVcs for adopted folders', () => {
  const vcs = new GitVcs();

  it('AC-2: reports none, root or subfolder', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'sf-vcs-plain-'));
    const repo = makeRepo('sf-vcs-repo-');
    mkdirSync(join(repo, 'pkg'));

    expect(await vcs.location(plain)).toBe('none');
    expect(await vcs.location(repo)).toBe('root');
    expect(await vcs.location(join(repo, 'pkg'))).toBe('subfolder');
  }, 30_000);

  it('AC-4: commits only the given paths; other files stay untracked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-vcs-adopt-'));
    writeFileSync(join(dir, 'main.c'), 'int main(void) { return 0; }\n');
    mkdirSync(join(dir, '.specforge'));
    writeFileSync(join(dir, '.specforge', 'project.yaml'), 'id: x\n');
    mkdirSync(join(dir, 'docs', 'spec', '01_intent'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'spec', '01_intent', '.gitkeep'), '');
    await vcs.init(dir);

    await vcs.commitPaths(dir, ['.specforge', 'docs/spec'], 'Initialise SpecForge project');

    expect(sh(dir, 'ls-files').split('\n').sort()).toEqual(['.specforge/project.yaml', 'docs/spec/01_intent/.gitkeep']);
    expect(sh(dir, 'status', '--porcelain')).toBe('?? main.c');
    expect(sh(dir, 'log', '--format=%s')).toBe('Initialise SpecForge project');
  }, 30_000);
});
