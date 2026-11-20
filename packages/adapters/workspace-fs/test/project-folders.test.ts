// SPDX-License-Identifier: Apache-2.0
// US-078 AC-1: project.yaml carries the specification root; the structure is created below it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectFolderProbe } from '../src/index.js';

const temp = () => mkdtempSync(join(tmpdir(), 'sf-folders-'));

describe('US-078 AC-1: specification root in project.yaml', () => {
  it('writes specRoot and creates the phase folders below it', async () => {
    const dir = join(temp(), 'p');
    await new ProjectFolderProbe().createStructure(dir, { id: 'p1', name: 'P', specRoot: 'docs/spec' });
    expect(readFileSync(join(dir, '.specforge', 'project.yaml'), 'utf8')).toMatch(/specRoot: docs\/spec/);
    expect(existsSync(join(dir, 'docs', 'spec', '04_user_stories', '.gitkeep'))).toBe(true);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('defaults to spec when no root is given', async () => {
    const dir = join(temp(), 'p');
    await new ProjectFolderProbe().createStructure(dir, { id: 'p1', name: 'P' });
    expect(readFileSync(join(dir, '.specforge', 'project.yaml'), 'utf8')).toMatch(/specRoot: spec/);
    expect(existsSync(join(dir, 'spec', '01_intent', '.gitkeep'))).toBe(true);
  });

  it('reads specRoot from project.yaml; Release 1 descriptors have none', async () => {
    const dir = temp();
    mkdirSync(join(dir, '.specforge'));
    writeFileSync(join(dir, '.specforge', 'project.yaml'), 'id: p1\nname: P\nschemaVersion: 1\nspecRoot: docs/spec\n');
    expect(await new ProjectFolderProbe().readDescriptor(dir)).toEqual({ id: 'p1', name: 'P', specRoot: 'docs/spec' });
    writeFileSync(join(dir, '.specforge', 'project.yaml'), 'id: p1\nname: P\nschemaVersion: 1\n');
    expect(await new ProjectFolderProbe().readDescriptor(dir)).toEqual({ id: 'p1', name: 'P' });
  });
});

describe('US-080 AC-1: top-level entries of a workspace', () => {
  it('lists the entries; a missing folder has none', async () => {
    const dir = temp();
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'Gemfile'), '');
    expect((await new ProjectFolderProbe().entries(dir)).sort()).toEqual(['Gemfile', 'app']);
    expect(await new ProjectFolderProbe().entries(join(dir, 'missing'))).toEqual([]);
  });
});
