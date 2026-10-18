// SPDX-License-Identifier: Apache-2.0
// Project registry on the IPC contract (US-017): recent projects, rename, remove, locate.
import { ProjectRegistry, ProjectRegistryError, type ProjectFolders, type ProjectRecords } from '@specforge/application';
import type { PhaseInputs } from '@specforge/domain';
import { IpcError, type ContractHandlers } from '@specforge/ipc-contract';

export interface ProjectHandlerDeps {
  projects: ProjectRecords;
  index: { phaseInputs(projectId: string): PhaseInputs };
  folders: ProjectFolders;
  activeRuns(projectId: string): Promise<number>;
}

/** Reports registry errors with their own code so the UI can react (e.g. RUNS_ACTIVE). */
async function mapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProjectRegistryError) throw new IpcError(e.code, e.message);
    throw e;
  }
}

export function createProjectHandlers(deps: ProjectHandlerDeps): ContractHandlers {
  const registry = new ProjectRegistry(deps.projects, deps.folders, {
    activeRuns: deps.activeRuns,
    phaseInputs: async (id) => deps.index.phaseInputs(id),
    // Generation runs are not tracked yet (execution store); phases show their approval state meanwhile.
    generatingPhases: async () => [],
  });
  return {
    'projects.recent': () => mapped(() => registry.recent()),
    'projects.rename': ({ projectId, name }) => mapped(async () => (await registry.rename(projectId, name), {})),
    'projects.remove': ({ projectId }) => mapped(async () => (await registry.remove(projectId), {})),
    'projects.locate': ({ projectId, path }) => mapped(async () => (await registry.locate(projectId, path), {})),
  };
}
