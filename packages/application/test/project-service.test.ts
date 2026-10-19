// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ProjectRegistryError,
  ProjectService,
  type NewProjectRecord,
  type ProjectDescriptor,
  type ProjectStore,
  type ProjectWorkspace,
  type VcsInfo,
  type VcsPort,
} from '../src/index.js';

interface Fs {
  dirs: Map<string, { files: string[]; descriptor?: ProjectDescriptor }>;
}

function setup(
  options: { git?: boolean; existing?: Record<string, { files?: string[]; descriptor?: ProjectDescriptor; vcs?: VcsInfo }> } = {},
) {
  const fs: Fs = { dirs: new Map() };
  const vcs = new Map<string, VcsInfo>();
  for (const [path, d] of Object.entries(options.existing ?? {})) {
    fs.dirs.set(path, { files: d.files ?? [], ...(d.descriptor ? { descriptor: d.descriptor } : {}) });
    if (d.vcs) vcs.set(path, d.vcs);
  }
  const calls: string[] = [];
  const workspace: ProjectWorkspace = {
    isEmptyOrMissing: async (path) => (fs.dirs.get(path)?.files.length ?? 0) === 0,
    createStructure: async (path, descriptor) => {
      calls.push(`structure ${path}`);
      fs.dirs.set(path, { files: ['.specforge/project.yaml', 'spec/01_intent/.gitkeep'], descriptor });
    },
    readDescriptor: async (path) => fs.dirs.get(path)?.descriptor,
  };
  const git: VcsPort = {
    available: async () => options.git ?? true,
    detect: async (path) => vcs.get(path) ?? { mode: 'none' },
    init: async (path) => {
      calls.push(`git init ${path}`);
      vcs.set(path, { mode: 'git', branch: 'main' });
    },
    commitAll: async (path, message) => {
      calls.push(`git commit ${path} ${message}`);
    },
  };
  const rows = new Map<string, NewProjectRecord & { lastOpenedAt: string | null }>();
  const store: ProjectStore = {
    create: async (p) => void rows.set(p.id, { ...p, lastOpenedAt: null }),
    get: async (id) => rows.get(id),
    findByPath: async (path) => [...rows.values()].find((r) => r.workspacePath === path),
    updateVcs: async (id, mode, branch) => {
      const row = rows.get(id)!;
      rows.set(id, { ...row, vcsMode: mode, baseBranch: branch });
    },
    relocate: async (id, path) => void (rows.get(id)!.workspacePath = path),
    touch: async (id) => void (rows.get(id)!.lastOpenedAt = '2026-10-15T10:00:00.000Z'),
  };
  const indexed: string[] = [];
  let n = 0;
  const service = new ProjectService({
    workspace,
    git,
    store,
    indexer: { indexAll: async (id) => void indexed.push(id) },
    newId: () => `proj-${++n}`,
    join: (...parts) => parts.join('/'),
  });
  return { service, rows, calls, indexed };
}

describe('US-018: create a new project', () => {
  it('AC-2: creates the folder with SpecForge structure, git init and an initial commit, then registers and indexes it', async () => {
    const { service, rows, calls, indexed } = setup();

    const opened = await service.create({ name: 'Task Manager', parentDir: '/work', folderName: 'task-manager', initGit: true });

    expect(opened).toEqual({
      id: 'proj-1',
      name: 'Task Manager',
      path: '/work/task-manager',
      vcs: { mode: 'git', branch: 'main' },
      isolationWarning: null,
    });
    expect(calls).toEqual([
      'structure /work/task-manager',
      'git init /work/task-manager',
      'git commit /work/task-manager Initialise SpecForge project',
    ]);
    expect(rows.get('proj-1')).toMatchObject({
      workspacePath: '/work/task-manager',
      vcsMode: 'git',
      baseBranch: 'main',
      lastOpenedAt: expect.any(String),
    });
    expect(indexed).toEqual(['proj-1']);
  });

  it('AC-2: rejects an existing non-empty folder and empty names', async () => {
    const { service } = setup({ existing: { '/work/taken': { files: ['README.md'] } } });

    await expect(service.create({ name: 'X', parentDir: '/work', folderName: 'taken', initGit: true })).rejects.toMatchObject({
      code: 'FOLDER_NOT_EMPTY',
    });
    await expect(service.create({ name: ' ', parentDir: '/work', folderName: 'x', initGit: true })).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    await expect(service.create({ name: 'X', parentDir: '/work', folderName: '../escape', initGit: true })).rejects.toMatchObject({
      code: 'INVALID_FOLDER',
    });
  });

  it('AC-3: without Git the project is created in non-git mode with the isolation warning', async () => {
    const { service, calls } = setup({ git: false });

    expect(await service.gitAvailable()).toBe(false);
    const opened = await service.create({ name: 'Notes', parentDir: '/work', folderName: 'notes', initGit: true });

    expect(opened.vcs).toEqual({ mode: 'none' });
    expect(opened.isolationWarning).toMatch(/not isolated/i);
    expect(calls).toEqual(['structure /work/notes']);
  });

  it('AC-2: unticking "Initialise Git" creates a non-git project even when Git is installed', async () => {
    const { service, calls } = setup();

    const opened = await service.create({ name: 'Notes', parentDir: '/work', folderName: 'notes', initGit: false });

    expect(opened.vcs).toEqual({ mode: 'none' });
    expect(calls).toEqual(['structure /work/notes']);
  });
});

describe('US-019: open an existing project', () => {
  const descriptor = { id: 'abc', name: 'Billing' };

  it('AC-1: registers an unregistered folder with metadata (e.g. a clone) under the descriptor id and opens it', async () => {
    const { service, rows, indexed } = setup({
      existing: { '/clone/billing': { files: ['x'], descriptor, vcs: { mode: 'git', branch: 'develop' } } },
    });

    const opened = await service.open('/clone/billing');

    expect(opened).toEqual({
      id: 'abc',
      name: 'Billing',
      path: '/clone/billing',
      vcs: { mode: 'git', branch: 'develop' },
      isolationWarning: null,
    });
    expect(rows.get('abc')).toMatchObject({ workspacePath: '/clone/billing', vcsMode: 'git', baseBranch: 'develop' });
    expect(indexed).toEqual(['abc']);
  });

  it('AC-1: explains that a folder without metadata is not a SpecForge project', async () => {
    const { service } = setup({ existing: { '/plain': { files: ['main.c'] } } });

    const error = await service.open('/plain').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProjectRegistryError);
    expect(error).toMatchObject({ code: 'NOT_A_PROJECT', message: expect.stringMatching(/no SpecForge metadata/) });
  });

  it('AC-2: re-detects the VCS mode on every open and warns in non-git mode', async () => {
    const { service, rows } = setup({ existing: { '/p': { files: ['x'], descriptor, vcs: { mode: 'git', branch: 'main' } } } });
    await service.open('/p');

    // The user removed .git between two sessions.
    const s2 = setup({ existing: { '/p': { files: ['x'], descriptor } } });
    await s2.rows.set('abc', { ...rows.get('abc')! });
    const reopened = await s2.service.openById('abc');

    expect(reopened.vcs).toEqual({ mode: 'none' });
    expect(reopened.isolationWarning).toMatch(/not isolated/i);
    expect(s2.rows.get('abc')).toMatchObject({ vcsMode: 'none', baseBranch: null });
  });

  it('AC-1: a registered project found at a new path (moved clone) is relocated', async () => {
    const { service, rows } = setup({ existing: { '/new': { files: ['x'], descriptor } } });
    await rows.set('abc', { id: 'abc', name: 'Billing', workspacePath: '/old', vcsMode: 'none', baseBranch: null, lastOpenedAt: null });

    await service.open('/new');

    expect(rows.get('abc')!.workspacePath).toBe('/new');
  });

  it('openById refuses unknown projects', async () => {
    const { service } = setup();
    await expect(service.openById('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
