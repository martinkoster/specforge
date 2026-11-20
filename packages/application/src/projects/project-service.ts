// SPDX-License-Identifier: Apache-2.0
// Create and open projects (US-018, US-019, US-068, UC-001, UC-002, UC-029, UC-030): structure, Git, registration, VCS detection, indexing.
import { DEFAULT_SPEC_ROOT, NON_GIT_PROJECT_WARNING, specLayout, specRootError } from '@specforge/domain';
import { ProjectRegistryError } from './project-registry.js';

export interface ProjectDescriptor {
  id: string;
  name: string;
  /** Specification root (US-078, ADR-024); missing in `project.yaml` means `spec`. */
  specRoot?: string;
}

export type VcsInfo = { mode: 'git'; branch: string | null } | { mode: 'none' };

/** Workspace folder operations (`.specforge/project.yaml`, specification folder structure). */
export interface ProjectWorkspace {
  isEmptyOrMissing(path: string): Promise<boolean>;
  /** Creates the folder, the `<specRoot>/01_intent` … `<specRoot>/05_test_concepts` structure and the descriptor. */
  createStructure(path: string, descriptor: ProjectDescriptor): Promise<void>;
  readDescriptor(path: string): Promise<ProjectDescriptor | undefined>;
  /** Names of the top-level entries of the folder (US-080). */
  entries(path: string): Promise<string[]>;
}

export interface VcsPort {
  available(): Promise<boolean>;
  detect(path: string): Promise<VcsInfo>;
  init(path: string): Promise<void>;
  commitAll(path: string, message: string): Promise<void>;
  /** Where the folder lies relative to a Git repository (US-079). */
  location(path: string): Promise<GitLocation>;
  /** Stages and commits only the given workspace-relative paths (US-079: adoption leaves existing files untracked). */
  commitPaths(path: string, paths: readonly string[], message: string): Promise<void>;
}

/** Git state of a folder: no repository, the repository root, or a folder inside a repository (US-079). */
export type GitLocation = 'none' | 'root' | 'subfolder';

export interface NewProjectRecord {
  id: string;
  name: string;
  workspacePath: string;
  vcsMode: 'git' | 'none';
  baseBranch: string | null;
  /** Cached from `project.yaml` (US-078). */
  specRoot: string;
}

export interface ProjectStore {
  create(project: NewProjectRecord): Promise<void>;
  get(id: string): Promise<(NewProjectRecord & { lastOpenedAt: string | null }) | undefined>;
  findByPath(path: string): Promise<NewProjectRecord | undefined>;
  updateVcs(id: string, mode: 'git' | 'none', branch: string | null): Promise<void>;
  relocate(id: string, path: string): Promise<void>;
  setSpecRoot(id: string, specRoot: string): Promise<void>;
  touch(id: string): Promise<void>;
}

export interface OpenedProject {
  id: string;
  name: string;
  path: string;
  vcs: VcsInfo;
  /** Specification root, workspace-relative (US-078). */
  specRoot: string;
  /** Non-git mode: runs are not isolated (FR-004, D12). */
  isolationWarning: string | null;
}

export interface CreateProjectInput {
  name: string;
  /** Absolute path of the picked folder (empty or missing; D24). */
  path: string;
  initGit: boolean;
}

export interface AdoptProjectInput {
  name: string;
  /** Absolute path of the folder with existing code (US-079, UC-030). */
  path: string;
  /** Specification folder, workspace-relative (ADR-024, D27). */
  specRoot: string;
  /** Only honoured when the folder has no repository. */
  initGit: boolean;
}

/** What a picked folder holds (US-068); a folder with other content also reports its Git state and a suggested root (US-079). */
export type FolderKind = 'project' | 'empty' | 'notEmpty';
export type FolderInspection = { kind: 'project' | 'empty' } | { kind: 'notEmpty'; git: GitLocation; suggestedSpecRoot: string };

/** Hint for folders with other content when creating a project (FR-079). */
export const ADOPT_HINT = 'Choose an empty folder, or use "Adopt existing code" for a folder that already contains code.';

/** Rejection of a folder inside a repository (US-079 AC-5, UC-030 1a). */
export const REPOSITORY_ROOT_HINT = 'Choose the repository root (or a folder without version control).';

/** Suggested specification folders, in order (D27): `spec`, or `docs/spec` when `spec/` is taken. */
const SPEC_ROOT_SUGGESTIONS = [DEFAULT_SPEC_ROOT, 'docs/spec', 'specforge/spec'] as const;

export interface ProjectServiceDeps {
  workspace: ProjectWorkspace;
  git: VcsPort;
  store: ProjectStore;
  indexer: { indexAll(projectId: string): Promise<unknown> };
  newId(): string;
  isAbsolute(path: string): boolean;
}

const INITIAL_COMMIT = 'Initialise SpecForge project';

export class ProjectService {
  constructor(private readonly deps: ProjectServiceDeps) {}

  gitAvailable(): Promise<boolean> {
    return this.deps.git.available();
  }

  async create(input: CreateProjectInput): Promise<OpenedProject> {
    const name = input.name.trim();
    if (name === '') throw new ProjectRegistryError('INVALID_NAME', 'The project name must not be empty.');
    const path = input.path;
    if (!this.deps.isAbsolute(path)) {
      throw new ProjectRegistryError('INVALID_FOLDER', `"${path}" is not an absolute folder path.`);
    }
    if (!(await this.deps.workspace.isEmptyOrMissing(path))) {
      throw new ProjectRegistryError('FOLDER_NOT_EMPTY', `The folder ${path} is not empty. ${ADOPT_HINT}`);
    }
    const descriptor = { id: this.deps.newId(), name, specRoot: DEFAULT_SPEC_ROOT };
    await this.deps.workspace.createStructure(path, descriptor);
    if (input.initGit && (await this.deps.git.available())) {
      await this.deps.git.init(path);
      await this.deps.git.commitAll(path, INITIAL_COMMIT);
    }
    const vcs = await this.deps.git.detect(path);
    await this.deps.store.create({ ...descriptor, workspacePath: path, ...vcsColumns(vcs) });
    return this.finishOpen(descriptor, path, vcs, DEFAULT_SPEC_ROOT);
  }

  /** Classifies a picked folder: SpecForge project, empty (or missing), or other content with Git state and root (US-068, US-079). */
  async inspectFolder(path: string): Promise<FolderInspection> {
    if (await this.deps.workspace.readDescriptor(path)) return { kind: 'project' };
    if (await this.deps.workspace.isEmptyOrMissing(path)) return { kind: 'empty' };
    let suggestedSpecRoot: string = DEFAULT_SPEC_ROOT;
    for (const candidate of SPEC_ROOT_SUGGESTIONS) {
      if ((await this.specRootProblem(path, candidate)) === null) {
        suggestedSpecRoot = candidate;
        break;
      }
    }
    return { kind: 'notEmpty', git: await this.gitLocation(path), suggestedSpecRoot };
  }

  /** Why `specRoot` cannot hold the specifications of the workspace `path`, or null (US-079 AC-3). */
  async specRootProblem(path: string, specRoot: string): Promise<string | null> {
    const error = specRootError(specRoot);
    if (error) return error;
    const root = specLayout(specRoot).root;
    if (!(await this.deps.workspace.isEmptyOrMissing(`${path}/${root}`))) {
      return `${root}/ already exists and is not empty — choose another specification folder.`;
    }
    return null;
  }

  /** Brings a folder with existing code under SpecForge (US-079, UC-030); no existing file is modified. */
  async adopt(input: AdoptProjectInput): Promise<OpenedProject> {
    const name = input.name.trim();
    if (name === '') throw new ProjectRegistryError('INVALID_NAME', 'The project name must not be empty.');
    const path = input.path;
    if (!this.deps.isAbsolute(path)) {
      throw new ProjectRegistryError('INVALID_FOLDER', `"${path}" is not an absolute folder path.`);
    }
    // UC-030 1c: created meanwhile (e.g. by a clone) — open it as an existing project.
    if (await this.deps.workspace.readDescriptor(path)) return this.open(path);
    const location = await this.gitLocation(path);
    if (location === 'subfolder') {
      throw new ProjectRegistryError('NOT_REPOSITORY_ROOT', `${path} lies inside a Git repository. ${REPOSITORY_ROOT_HINT}`);
    }
    const problem = await this.specRootProblem(path, input.specRoot);
    if (problem) throw new ProjectRegistryError('INVALID_SPEC_ROOT', problem);
    const specRoot = specLayout(input.specRoot).root;
    const descriptor = { id: this.deps.newId(), name, specRoot };
    await this.deps.workspace.createStructure(path, descriptor);
    if (location === 'none' && input.initGit && (await this.deps.git.available())) {
      await this.deps.git.init(path);
      await this.deps.git.commitPaths(path, ['.specforge', specRoot], INITIAL_COMMIT);
    }
    const vcs = await this.deps.git.detect(path);
    await this.deps.store.create({ ...descriptor, workspacePath: path, ...vcsColumns(vcs) });
    return this.finishOpen(descriptor, path, vcs, specRoot);
  }

  /**
   * US-080 AC-1: the workspace holds code to analyse — a top-level entry other than hidden ones (`.git`, `.specforge`, …)
   * and the folder holding the specification root.
   */
  async hasCode(path: string, specRoot: string): Promise<boolean> {
    const specTop = specLayout(specRoot).root.split('/')[0];
    return (await this.deps.workspace.entries(path)).some((e) => !e.startsWith('.') && e !== specTop);
  }

  private async gitLocation(path: string): Promise<GitLocation> {
    return (await this.deps.git.available()) ? this.deps.git.location(path) : 'none';
  }

  /** Opens (and registers, if needed) the SpecForge project in `path`. */
  async open(path: string): Promise<OpenedProject> {
    const descriptor = await this.deps.workspace.readDescriptor(path);
    if (!descriptor) {
      throw new ProjectRegistryError(
        'NOT_A_PROJECT',
        `The folder ${path} has no SpecForge metadata (.specforge/project.yaml). Choose a SpecForge project folder, an empty folder for a new project, or Adopt this folder to bring its code under SpecForge.`,
      );
    }
    const specRoot = validSpecRoot(descriptor);
    const vcs = await this.deps.git.detect(path);
    const registered = await this.deps.store.get(descriptor.id);
    if (!registered) {
      await this.deps.store.create({ id: descriptor.id, name: descriptor.name, workspacePath: path, specRoot, ...vcsColumns(vcs) });
    } else {
      if (registered.workspacePath !== path) await this.deps.store.relocate(descriptor.id, path);
      await this.deps.store.updateVcs(descriptor.id, ...vcsArgs(vcs));
      if (registered.specRoot !== specRoot) await this.deps.store.setSpecRoot(descriptor.id, specRoot);
    }
    return this.finishOpen({ id: descriptor.id, name: registered?.name ?? descriptor.name }, path, vcs, specRoot);
  }

  async openById(id: string): Promise<OpenedProject> {
    const project = await this.deps.store.get(id);
    if (!project) throw new ProjectRegistryError('NOT_FOUND', `Unknown project ${id}.`);
    // project.yaml is authoritative for the specification root; the registry only caches it.
    const descriptor = await this.deps.workspace.readDescriptor(project.workspacePath);
    const specRoot = descriptor ? validSpecRoot(descriptor) : project.specRoot;
    const vcs = await this.deps.git.detect(project.workspacePath);
    await this.deps.store.updateVcs(id, ...vcsArgs(vcs));
    if (project.specRoot !== specRoot) await this.deps.store.setSpecRoot(id, specRoot);
    return this.finishOpen(project, project.workspacePath, vcs, specRoot);
  }

  private async finishOpen(project: ProjectDescriptor, path: string, vcs: VcsInfo, specRoot: string): Promise<OpenedProject> {
    await this.deps.indexer.indexAll(project.id);
    await this.deps.store.touch(project.id);
    return {
      id: project.id,
      name: project.name,
      path,
      vcs,
      specRoot,
      isolationWarning: vcs.mode === 'none' ? NON_GIT_PROJECT_WARNING : null,
    };
  }
}

/** The descriptor's specification root, normalised; `spec` when absent (US-078). */
function validSpecRoot(descriptor: ProjectDescriptor): string {
  const root = descriptor.specRoot ?? DEFAULT_SPEC_ROOT;
  const error = specRootError(root);
  if (error) throw new ProjectRegistryError('INVALID_SPEC_ROOT', `.specforge/project.yaml: ${error}`);
  return specLayout(root).root;
}

function vcsArgs(vcs: VcsInfo): ['git' | 'none', string | null] {
  return vcs.mode === 'git' ? ['git', vcs.branch] : ['none', null];
}

function vcsColumns(vcs: VcsInfo): Pick<NewProjectRecord, 'vcsMode' | 'baseBranch'> {
  const [vcsMode, baseBranch] = vcsArgs(vcs);
  return { vcsMode, baseBranch };
}
