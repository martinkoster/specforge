// SPDX-License-Identifier: Apache-2.0
// Create and open projects (US-018, US-019, UC-001, UC-002, UC-029): structure, Git, registration, VCS detection, indexing.
import { NON_GIT_PROJECT_WARNING } from '@specforge/domain';
import { ProjectRegistryError } from './project-registry.js';

export interface ProjectDescriptor {
  id: string;
  name: string;
}

export type VcsInfo = { mode: 'git'; branch: string | null } | { mode: 'none' };

/** Workspace folder operations (`.specforge/project.yaml`, `spec/` structure). */
export interface ProjectWorkspace {
  isEmptyOrMissing(path: string): Promise<boolean>;
  /** Creates the folder, the `spec/01_intent` … `spec/05_test_concepts` structure and the descriptor. */
  createStructure(path: string, descriptor: ProjectDescriptor): Promise<void>;
  readDescriptor(path: string): Promise<ProjectDescriptor | undefined>;
}

export interface VcsPort {
  available(): Promise<boolean>;
  detect(path: string): Promise<VcsInfo>;
  init(path: string): Promise<void>;
  commitAll(path: string, message: string): Promise<void>;
}

export interface NewProjectRecord {
  id: string;
  name: string;
  workspacePath: string;
  vcsMode: 'git' | 'none';
  baseBranch: string | null;
}

export interface ProjectStore {
  create(project: NewProjectRecord): Promise<void>;
  get(id: string): Promise<(NewProjectRecord & { lastOpenedAt: string | null }) | undefined>;
  findByPath(path: string): Promise<NewProjectRecord | undefined>;
  updateVcs(id: string, mode: 'git' | 'none', branch: string | null): Promise<void>;
  relocate(id: string, path: string): Promise<void>;
  touch(id: string): Promise<void>;
}

export interface OpenedProject {
  id: string;
  name: string;
  path: string;
  vcs: VcsInfo;
  /** Non-git mode: runs are not isolated (FR-004, D12). */
  isolationWarning: string | null;
}

export interface CreateProjectInput {
  name: string;
  parentDir: string;
  folderName: string;
  initGit: boolean;
}

export interface ProjectServiceDeps {
  workspace: ProjectWorkspace;
  git: VcsPort;
  store: ProjectStore;
  indexer: { indexAll(projectId: string): Promise<unknown> };
  newId(): string;
  join(...parts: string[]): string;
}

const INITIAL_COMMIT = 'Initialise SpecForge project';
/** Characters not allowed in a folder name (separators and characters invalid on Windows). */
const INVALID_FOLDER_CHARS = /[<>:"/\\|?*]/;

/** A single folder name: no separators, no traversal, no control or Windows-invalid characters. */
function isValidFolderName(name: string): boolean {
  if (name === '' || name === '.' || name === '..' || name.endsWith('.') || name.endsWith(' ')) return false;
  return !INVALID_FOLDER_CHARS.test(name) && ![...name].some((c) => c.charCodeAt(0) < 32);
}

export class ProjectService {
  constructor(private readonly deps: ProjectServiceDeps) {}

  gitAvailable(): Promise<boolean> {
    return this.deps.git.available();
  }

  async create(input: CreateProjectInput): Promise<OpenedProject> {
    const name = input.name.trim();
    if (name === '') throw new ProjectRegistryError('INVALID_NAME', 'The project name must not be empty.');
    const folderName = input.folderName.trim();
    if (!isValidFolderName(folderName)) {
      throw new ProjectRegistryError('INVALID_FOLDER', `"${input.folderName}" is not a valid folder name.`);
    }
    const path = this.deps.join(input.parentDir, folderName);
    if (!(await this.deps.workspace.isEmptyOrMissing(path))) {
      throw new ProjectRegistryError('FOLDER_NOT_EMPTY', `The folder ${path} already exists and is not empty. Choose another name.`);
    }
    const descriptor = { id: this.deps.newId(), name };
    await this.deps.workspace.createStructure(path, descriptor);
    if (input.initGit && (await this.deps.git.available())) {
      await this.deps.git.init(path);
      await this.deps.git.commitAll(path, INITIAL_COMMIT);
    }
    const vcs = await this.deps.git.detect(path);
    await this.deps.store.create({ ...descriptor, workspacePath: path, ...vcsColumns(vcs) });
    return this.finishOpen(descriptor, path, vcs);
  }

  /** Opens (and registers, if needed) the SpecForge project in `path`. */
  async open(path: string): Promise<OpenedProject> {
    const descriptor = await this.deps.workspace.readDescriptor(path);
    if (!descriptor) {
      throw new ProjectRegistryError(
        'NOT_A_PROJECT',
        `The folder ${path} has no SpecForge metadata (.specforge/project.yaml). Choose a SpecForge project folder or create a new project.`,
      );
    }
    const vcs = await this.deps.git.detect(path);
    const registered = await this.deps.store.get(descriptor.id);
    if (!registered) {
      await this.deps.store.create({ ...descriptor, workspacePath: path, ...vcsColumns(vcs) });
    } else {
      if (registered.workspacePath !== path) await this.deps.store.relocate(descriptor.id, path);
      await this.deps.store.updateVcs(descriptor.id, ...vcsArgs(vcs));
    }
    return this.finishOpen({ id: descriptor.id, name: registered?.name ?? descriptor.name }, path, vcs);
  }

  async openById(id: string): Promise<OpenedProject> {
    const project = await this.deps.store.get(id);
    if (!project) throw new ProjectRegistryError('NOT_FOUND', `Unknown project ${id}.`);
    const vcs = await this.deps.git.detect(project.workspacePath);
    await this.deps.store.updateVcs(id, ...vcsArgs(vcs));
    return this.finishOpen(project, project.workspacePath, vcs);
  }

  private async finishOpen(project: ProjectDescriptor, path: string, vcs: VcsInfo): Promise<OpenedProject> {
    await this.deps.indexer.indexAll(project.id);
    await this.deps.store.touch(project.id);
    return { id: project.id, name: project.name, path, vcs, isolationWarning: vcs.mode === 'none' ? NON_GIT_PROJECT_WARNING : null };
  }
}

function vcsArgs(vcs: VcsInfo): ['git' | 'none', string | null] {
  return vcs.mode === 'git' ? ['git', vcs.branch] : ['none', null];
}

function vcsColumns(vcs: VcsInfo): Pick<NewProjectRecord, 'vcsMode' | 'baseBranch'> {
  const [vcsMode, baseBranch] = vcsArgs(vcs);
  return { vcsMode, baseBranch };
}
