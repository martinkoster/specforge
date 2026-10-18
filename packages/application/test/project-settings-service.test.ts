// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_PROJECT_SETTINGS } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { ArtifactConflictError, ProjectSettingsService, type StoredProjectSettings } from '../src/index.js';

function setup(vcsMode: 'git' | 'none' = 'git') {
  const stored = new Map<string, StoredProjectSettings>();
  const files = new Map<string, string>();
  const project = { workspacePath: 'C:/work/app', vcsMode, baseBranch: 'main' as string | null };
  const limitChanged: string[] = [];
  const service = new ProjectSettingsService({
    store: {
      projectSettings: (id) => stored.get(id),
      setProjectSettings: (id, s) => void stored.set(id, s),
    },
    projects: {
      get: async () => project,
      setBaseBranch: async (_id, branch) => void (project.baseBranch = branch),
    },
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content, { expectedHash }) => {
        const current = files.get(path);
        if (current !== undefined && expectedHash !== `h${current.length}`) throw new ArtifactConflictError(path);
        files.set(path, content);
        return `h${content.length}`;
      },
    }),
    branchExists: async (_path, branch) => ['main', 'develop'].includes(branch),
    defaultWorktreeRoot: (id) => `C:/Users/u/AppData/Roaming/SpecForge/wt/${id.slice(0, 8)}`,
    onLimitChanged: (id) => void limitChanged.push(id),
  });
  return { service, stored, files, project, limitChanged };
}

describe('US-016 AC-1: project instructions', () => {
  it('stores instructions & conventions in .specforge/instructions.md', async () => {
    const { service, files } = setup();
    expect((await service.get('p1234567x')).instructions).toEqual({ content: '', hash: null });

    await expect(service.saveInstructions('p1234567x', '# Conventions\nUse TypeScript.\n', null)).resolves.toEqual({
      ok: true,
      hash: expect.any(String),
    });

    expect(files.get('.specforge/instructions.md')).toBe('# Conventions\nUse TypeScript.\n');
    expect((await service.get('p1234567x')).instructions.content).toContain('Use TypeScript.');
  });

  it('reports a conflict when the file changed elsewhere', async () => {
    const { service, files } = setup();
    files.set('.specforge/instructions.md', 'edited elsewhere');
    await expect(service.saveInstructions('p1', 'mine', 'stale')).resolves.toEqual({
      ok: false,
      error: expect.stringMatching(/changed since it was read/),
    });
  });
});

describe('US-016 AC-2: Git and workspace settings', () => {
  it('returns defaults (worktree root in app data, base branch from the project)', async () => {
    const { service } = setup();
    expect((await service.get('p1234567x')).settings).toEqual({
      ...DEFAULT_PROJECT_SETTINGS,
      baseBranch: 'main',
      worktreeRoot: 'C:/Users/u/AppData/Roaming/SpecForge/wt/p1234567',
    });
  });

  it('saves validated settings; the base branch must exist', async () => {
    const { service, stored, project } = setup();
    const view = await service.get('p1');

    await expect(service.save('p1', { ...view.settings, baseBranch: 'release' })).resolves.toEqual({
      ok: false,
      errors: ['The branch "release" does not exist in this repository.'],
    });
    await expect(
      service.save('p1', { ...view.settings, baseBranch: 'develop', branchPattern: 'story/{storyId}', concurrencyLimit: 5 }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(project.baseBranch).toBe('develop');
    expect(stored.get('p1')).toMatchObject({ branchPattern: 'story/{storyId}', concurrencyLimit: 5 });
    await expect(service.save('p1', { ...view.settings, branchPattern: 'x' })).resolves.toMatchObject({ ok: false });
  });
});

describe('US-016 AC-3: parallel runs', () => {
  it('changes notify the scheduler; non-git mode shows 1 with an explanation', async () => {
    const git = setup();
    await git.service.save('p1', { ...(await git.service.get('p1')).settings, concurrencyLimit: 4 });
    expect(git.limitChanged).toEqual(['p1']);
    expect(await git.service.get('p1')).toMatchObject({ effectiveConcurrency: 4, concurrencyNote: null });
    expect(git.service.limit('p1', 'git')).toBe(4);

    const none = setup('none');
    const view = await none.service.get('p1');
    expect(view).toMatchObject({ vcsMode: 'none', effectiveConcurrency: 1, concurrencyNote: expect.stringMatching(/without Git/) });
    expect(none.service.limit('p1', 'none')).toBe(1);
  });
});
