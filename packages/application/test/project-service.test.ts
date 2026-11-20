// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ADOPT_HINT,
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
  options: {
    git?: boolean;
    existing?: Record<string, { files?: string[]; descriptor?: ProjectDescriptor; vcs?: VcsInfo }>;
    /** Folders inside a Git repository that are not its root. */
    subfolders?: string[];
  } = {},
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
    entries: async (path) => fs.dirs.get(path)?.files ?? [],
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
    location: async (path) => (options.subfolders?.includes(path) ? 'subfolder' : vcs.has(path) ? 'root' : 'none'),
    commitPaths: async (path, paths, message) => {
      calls.push(`git commit ${path} [${paths.join(', ')}] ${message}`);
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
    setSpecRoot: async (id, specRoot) => void (rows.get(id)!.specRoot = specRoot),
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
    isAbsolute: (path) => path.startsWith('/'),
  });
  return { service, rows, calls, indexed };
}

describe('US-018: create a new project', () => {
  it('AC-2: creates the folder with SpecForge structure, git init and an initial commit, then registers and indexes it', async () => {
    const { service, rows, calls, indexed } = setup();

    const opened = await service.create({ name: 'Task Manager', path: '/work/task-manager', initGit: true });

    expect(opened).toEqual({
      id: 'proj-1',
      name: 'Task Manager',
      path: '/work/task-manager',
      vcs: { mode: 'git', branch: 'main' },
      specRoot: 'spec',
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

    await expect(service.create({ name: 'X', path: '/work/taken', initGit: true })).rejects.toMatchObject({
      code: 'FOLDER_NOT_EMPTY',
    });
    await expect(service.create({ name: ' ', path: '/work/x', initGit: true })).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    await expect(service.create({ name: 'X', path: 'relative/escape', initGit: true })).rejects.toMatchObject({
      code: 'INVALID_FOLDER',
    });
  });

  it('AC-3: without Git the project is created in non-git mode with the isolation warning', async () => {
    const { service, calls } = setup({ git: false });

    expect(await service.gitAvailable()).toBe(false);
    const opened = await service.create({ name: 'Notes', path: '/work/notes', initGit: true });

    expect(opened.vcs).toEqual({ mode: 'none' });
    expect(opened.isolationWarning).toMatch(/not isolated/i);
    expect(calls).toEqual(['structure /work/notes']);
  });

  it('AC-2: unticking "Initialise Git" creates a non-git project even when Git is installed', async () => {
    const { service, calls } = setup();

    const opened = await service.create({ name: 'Notes', path: '/work/notes', initGit: false });

    expect(opened.vcs).toEqual({ mode: 'none' });
    expect(calls).toEqual(['structure /work/notes']);
  });
});

describe('US-068: folder-first project creation', () => {
  it('AC-2: creates the project in the picked (existing, empty) folder with the entered name', async () => {
    const { service, calls, rows } = setup({ existing: { '/work/notes': { files: [] } } });

    const opened = await service.create({ name: 'My Notes', path: '/work/notes', initGit: true });

    expect(opened).toMatchObject({ name: 'My Notes', path: '/work/notes', vcs: { mode: 'git', branch: 'main' } });
    expect(calls[0]).toBe('structure /work/notes');
    expect(rows.get(opened.id)).toMatchObject({ name: 'My Notes', workspacePath: '/work/notes' });
  });

  it('AC-3: rejects a non-empty folder with the adopt hint and writes nothing', async () => {
    const { service, calls } = setup({ existing: { '/code/app': { files: ['main.c'] } } });

    const error = await service.create({ name: 'App', path: '/code/app', initGit: true }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'FOLDER_NOT_EMPTY',
      message: expect.stringContaining(ADOPT_HINT),
    });
    expect(calls).toEqual([]);
  });

  it('AC-3/AC-4: classifies a picked folder as SpecForge project, empty or not empty', async () => {
    const { service } = setup({
      existing: {
        '/p': { files: ['.specforge/project.yaml'], descriptor: { id: 'abc', name: 'Billing' } },
        '/empty': { files: [] },
        '/code': { files: ['main.c'] },
      },
    });

    expect(await service.inspectFolder('/p')).toEqual({ kind: 'project' });
    expect(await service.inspectFolder('/empty')).toEqual({ kind: 'empty' });
    expect(await service.inspectFolder('/code')).toMatchObject({ kind: 'notEmpty' });
  });

  it('AC-4: opening a non-empty folder without metadata explains that it can be adopted (US-079)', async () => {
    const { service } = setup({ existing: { '/code': { files: ['main.c'] } } });

    await expect(service.open('/code')).rejects.toMatchObject({
      code: 'NOT_A_PROJECT',
      message: expect.stringMatching(/no SpecForge metadata.*Adopt this folder/s),
    });
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
      specRoot: 'spec',
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

describe('US-078 AC-1: the specification root of a project', () => {
  it('creates new projects with the default root spec and reports it', async () => {
    const { service, rows } = setup({ git: false });
    const opened = await service.create({ name: 'Shop', path: '/ws/shop', initGit: false });
    expect(opened.specRoot).toBe('spec');
    expect(rows.get(opened.id)?.specRoot).toBe('spec');
  });

  it('opens a project with the root from project.yaml and caches it in the registry', async () => {
    const { service, rows } = setup({
      existing: { '/ws/legacy': { files: ['x'], descriptor: { id: 'p-legacy', name: 'Legacy', specRoot: 'docs/spec' } } },
    });
    const opened = await service.open('/ws/legacy');
    expect(opened.specRoot).toBe('docs/spec');
    expect(rows.get('p-legacy')?.specRoot).toBe('docs/spec');
  });

  it('treats a missing specRoot as spec (Release 1 projects open unchanged)', async () => {
    const { service } = setup({ existing: { '/ws/r1': { files: ['x'], descriptor: { id: 'p-r1', name: 'R1' } } } });
    expect((await service.open('/ws/r1')).specRoot).toBe('spec');
  });

  it('updates the cached root when project.yaml changed and refuses an invalid root', async () => {
    const descriptor: ProjectDescriptor = { id: 'p-x', name: 'X', specRoot: 'spec' };
    const { service, rows } = setup({ existing: { '/ws/x': { files: ['x'], descriptor } } });
    await service.open('/ws/x');
    descriptor.specRoot = 'docs/spec';
    expect((await service.openById('p-x')).specRoot).toBe('docs/spec');
    expect(rows.get('p-x')?.specRoot).toBe('docs/spec');
    descriptor.specRoot = '../outside';
    await expect(service.open('/ws/x')).rejects.toMatchObject({ code: 'INVALID_SPEC_ROOT' });
  });
});

describe('US-079: adopt an existing code folder', () => {
  it('AC-2: inspecting a non-empty folder returns the Git state and a suggested specification folder', async () => {
    const { service } = setup({
      existing: {
        '/code/plain': { files: ['main.c'] },
        '/code/repo': { files: ['main.c'], vcs: { mode: 'git', branch: 'main' } },
        '/code/rails': { files: ['Gemfile', 'spec/user_spec.rb'] },
        '/code/rails/spec': { files: ['user_spec.rb'] },
        '/code/mono/pkg': { files: ['index.ts'], vcs: { mode: 'git', branch: 'main' } },
      },
      subfolders: ['/code/mono/pkg'],
    });

    expect(await service.inspectFolder('/code/plain')).toEqual({ kind: 'notEmpty', git: 'none', suggestedSpecRoot: 'spec' });
    expect(await service.inspectFolder('/code/repo')).toEqual({ kind: 'notEmpty', git: 'root', suggestedSpecRoot: 'spec' });
    expect(await service.inspectFolder('/code/rails')).toEqual({ kind: 'notEmpty', git: 'none', suggestedSpecRoot: 'docs/spec' });
    expect(await service.inspectFolder('/code/mono/pkg')).toMatchObject({ git: 'subfolder' });
  });

  it('AC-3: validates the specification folder (relative, inside the workspace, not .specforge, not a non-empty folder)', async () => {
    const { service } = setup({
      existing: { '/code/rails': { files: ['spec/user_spec.rb'] }, '/code/rails/spec': { files: ['user_spec.rb'] } },
    });

    expect(await service.specRootProblem('/code/rails', 'docs/spec')).toBeNull();
    expect(await service.specRootProblem('/code/rails', 'spec')).toMatch(/not empty/);
    expect(await service.specRootProblem('/code/rails', '../spec')).not.toBeNull();
    expect(await service.specRootProblem('/code/rails', '/abs')).toMatch(/relative/);
    expect(await service.specRootProblem('/code/rails', '.specforge/spec')).toMatch(/\.specforge/);
    expect(await service.specRootProblem('/code/rails', '')).not.toBeNull();
  });

  it('AC-4: adopting writes the descriptor with the root and the structure, registers and opens the project; Git init commits only SpecForge files', async () => {
    const { service, rows, calls, indexed } = setup({
      existing: { '/code/rails': { files: ['Gemfile', 'spec/user_spec.rb'] }, '/code/rails/spec': { files: ['user_spec.rb'] } },
    });

    const opened = await service.adopt({ name: ' Rails App ', path: '/code/rails', specRoot: 'docs/spec/', initGit: true });

    expect(opened).toMatchObject({ name: 'Rails App', path: '/code/rails', specRoot: 'docs/spec', vcs: { mode: 'git' } });
    expect(calls).toEqual([
      'structure /code/rails',
      'git init /code/rails',
      'git commit /code/rails [.specforge, docs/spec] Initialise SpecForge project',
    ]);
    expect(rows.get(opened.id)).toMatchObject({ workspacePath: '/code/rails', specRoot: 'docs/spec', vcsMode: 'git' });
    expect(indexed).toEqual([opened.id]);
  });

  it('AC-4: in an existing repository nothing is committed; without Git init the project stays non-git', async () => {
    const repo = setup({ existing: { '/code/repo': { files: ['main.c'], vcs: { mode: 'git', branch: 'develop' } } } });
    const inRepo = await repo.service.adopt({ name: 'Repo', path: '/code/repo', specRoot: 'spec', initGit: true });
    expect(inRepo.vcs).toEqual({ mode: 'git', branch: 'develop' });
    expect(repo.calls).toEqual(['structure /code/repo']);

    const plain = setup({ existing: { '/code/plain': { files: ['main.c'] } } });
    const noGit = await plain.service.adopt({ name: 'Plain', path: '/code/plain', specRoot: 'spec', initGit: false });
    expect(noGit.vcs).toEqual({ mode: 'none' });
    expect(plain.calls).toEqual(['structure /code/plain']);
  });

  it('AC-3/AC-4: rejects an invalid name, a relative path and an invalid specification folder without writing', async () => {
    const { service, calls } = setup({
      existing: { '/code/rails': { files: ['spec/a.rb'] }, '/code/rails/spec': { files: ['a.rb'] } },
    });

    await expect(service.adopt({ name: ' ', path: '/code/rails', specRoot: 'docs/spec', initGit: false })).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    await expect(service.adopt({ name: 'R', path: 'code/rails', specRoot: 'docs/spec', initGit: false })).rejects.toMatchObject({
      code: 'INVALID_FOLDER',
    });
    await expect(service.adopt({ name: 'R', path: '/code/rails', specRoot: 'spec', initGit: false })).rejects.toMatchObject({
      code: 'INVALID_SPEC_ROOT',
    });
    expect(calls).toEqual([]);
  });

  it('AC-5: a subfolder of a Git repository is rejected with "Choose the repository root"', async () => {
    const { service, calls } = setup({
      existing: { '/code/mono/pkg': { files: ['index.ts'], vcs: { mode: 'git', branch: 'main' } } },
      subfolders: ['/code/mono/pkg'],
    });

    await expect(service.adopt({ name: 'Pkg', path: '/code/mono/pkg', specRoot: 'spec', initGit: false })).rejects.toMatchObject({
      code: 'NOT_REPOSITORY_ROOT',
      message: expect.stringContaining('Choose the repository root'),
    });
    expect(calls).toEqual([]);
  });

  it('AC-5: a folder that meanwhile holds .specforge/project.yaml is opened as an existing project', async () => {
    const { service, calls } = setup({
      existing: { '/code/app': { files: ['.specforge/project.yaml'], descriptor: { id: 'p-app', name: 'App', specRoot: 'docs/spec' } } },
    });

    const opened = await service.adopt({ name: 'Other', path: '/code/app', specRoot: 'spec', initGit: true });

    expect(opened).toMatchObject({ id: 'p-app', name: 'App', specRoot: 'docs/spec' });
    expect(calls).toEqual([]);
  });

  it('AC-1: the Release 1 hints now point to adopting the folder', async () => {
    const { service } = setup({ existing: { '/code': { files: ['main.c'] } } });
    await expect(service.create({ name: 'X', path: '/code', initGit: false })).rejects.toMatchObject({
      message: expect.stringContaining(ADOPT_HINT),
    });
    await expect(service.open('/code')).rejects.toMatchObject({ message: expect.stringContaining('Adopt') });
    expect(ADOPT_HINT).not.toMatch(/Release 2/);
  });
});

describe('US-080 AC-1: a project with existing code can be analysed', () => {
  it('reports code when the workspace has entries besides the specification folder, .specforge and Git metadata', async () => {
    const { service } = setup({
      existing: {
        '/code/shop': { files: ['.specforge', '.git', 'docs', 'app', 'Gemfile'] },
        '/new/notes': { files: ['.specforge', '.git', 'spec', '.gitignore'] },
        '/new/docs': { files: ['.specforge', 'docs'] },
      },
    });

    expect(await service.hasCode('/code/shop', 'docs/spec')).toBe(true);
    expect(await service.hasCode('/new/notes', 'spec')).toBe(false);
    expect(await service.hasCode('/new/docs', 'docs/spec')).toBe(false);
  });
});
