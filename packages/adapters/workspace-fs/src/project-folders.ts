// SPDX-License-Identifier: Apache-2.0
// Project folders (US-017, US-018, US-019, US-078): existence checks, `.specforge/project.yaml` and the specification structure.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectDescriptor, ProjectFolders, ProjectWorkspace } from '@specforge/application';
import { DEFAULT_SPEC_ROOT } from '@specforge/domain';
import { parse, stringify } from 'yaml';

/** Specification folders created for a new project (data_model.md §1.1). */
export const SPEC_FOLDERS = ['01_intent', '02_requirements', '03_design', '04_user_stories', '05_test_concepts'] as const;
const DESCRIPTOR = join('.specforge', 'project.yaml');

export class ProjectFolderProbe implements ProjectFolders, ProjectWorkspace {
  async exists(path: string): Promise<boolean> {
    return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
  }

  async hasDescriptor(path: string): Promise<boolean> {
    return (await stat(join(path, DESCRIPTOR)).catch(() => undefined))?.isFile() ?? false;
  }

  async isEmptyOrMissing(path: string): Promise<boolean> {
    const entries = await readdir(path).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    });
    return entries.length === 0;
  }

  async createStructure(path: string, descriptor: ProjectDescriptor): Promise<void> {
    await mkdir(join(path, '.specforge'), { recursive: true });
    const specRoot = descriptor.specRoot ?? DEFAULT_SPEC_ROOT;
    await writeFile(join(path, DESCRIPTOR), stringify({ id: descriptor.id, name: descriptor.name, schemaVersion: 1, specRoot }), {
      flag: 'wx',
    });
    for (const folder of SPEC_FOLDERS) {
      await mkdir(join(path, ...specRoot.split('/'), folder), { recursive: true });
      // Keeps the empty folders in Git.
      await writeFile(join(path, ...specRoot.split('/'), folder, '.gitkeep'), '');
    }
  }

  async entries(path: string): Promise<string[]> {
    return readdir(path).catch(() => []);
  }

  async readDescriptor(path: string): Promise<ProjectDescriptor | undefined> {
    const content = await readFile(join(path, DESCRIPTOR), 'utf8').catch(() => undefined);
    if (content === undefined) return undefined;
    const data = parse(content) as { id?: unknown; name?: unknown; specRoot?: unknown } | null;
    if (typeof data?.id !== 'string' || data.id === '') return undefined;
    return {
      id: data.id,
      name: typeof data.name === 'string' && data.name.trim() !== '' ? data.name : data.id,
      // Validated by the ProjectService when the project is opened (US-078).
      ...(data.specRoot !== undefined ? { specRoot: String(data.specRoot) } : {}),
    };
  }
}
