// SPDX-License-Identifier: Apache-2.0
// Story dependencies on the IPC contract (US-040 AC-1): list, add, remove — written to the story front-matter.
import type { DependencyIndex, StoryDependencyService } from '@specforge/application';
import type { ContractHandlers } from '@specforge/ipc-contract';

export interface DependencyHandlerDeps {
  service: Pick<StoryDependencyService, 'add' | 'remove'>;
  index: Pick<DependencyIndex, 'storyIds' | 'dependencies'>;
}

export function createDependencyHandlers({ service, index }: DependencyHandlerDeps): ContractHandlers {
  return {
    'stories.dependencies': async ({ projectId, storyId }) => ({
      dependencies: index
        .dependencies(projectId)
        .filter((d) => d.from === storyId)
        .map(({ to, type }) => ({ to, type })),
      storyIds: index.storyIds(projectId),
    }),
    'stories.addDependency': ({ projectId, from, to, type, rationale }) =>
      service.add(projectId, rationale === undefined ? { from, to, type } : { from, to, type, rationale }),
    'stories.removeDependency': ({ projectId, from, to, type }) => service.remove(projectId, { from, to, type }),
  };
}
