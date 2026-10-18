// SPDX-License-Identifier: Apache-2.0
import type { PhaseInputs } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import {
  ProjectRegistry,
  ProjectRegistryError,
  type ProjectActivity,
  type ProjectFolders,
  type ProjectRecord,
  type ProjectRecords,
} from '../src/index.js';

const noPhase: PhaseInputs = {
  intent: { approvals: [], impacted: false },
  requirements: { approvals: [], impacted: false },
  design: { approvals: [], impacted: false },
  stories: { approvals: [], impacted: false },
};

interface SetupOptions {
  folders?: string[];
  descriptors?: string[];
  runs?: Record<string, number>;
}

function setup(projects: ProjectRecord[], options: SetupOptions = {}) {
  const rows = new Map(projects.map((p) => [p.id, { ...p }]));
  const records: ProjectRecords = {
    list: async () => [...rows.values()],
    get: async (id) => rows.get(id),
    rename: async (id, name) => {
      rows.get(id)!.name = name;
    },
    remove: async (id) => {
      rows.delete(id);
    },
    relocate: async (id, path) => {
      rows.get(id)!.workspacePath = path;
    },
  };
  const folders: ProjectFolders = {
    exists: async (path) => (options.folders ?? projects.map((p) => p.workspacePath)).includes(path),
    hasDescriptor: async (path) => (options.descriptors ?? []).includes(path),
  };
  const activity: ProjectActivity = {
    activeRuns: async (id) => options.runs?.[id] ?? 0,
    phaseInputs: async (id) =>
      id === 'p2'
        ? { ...noPhase, intent: { approvals: ['approved'], impacted: false }, requirements: { approvals: ['draft'], impacted: false } }
        : noPhase,
    generatingPhases: async () => [],
  };
  return { rows, registry: new ProjectRegistry(records, folders, activity) };
}

const project = (id: string, name: string, lastOpenedAt: string | null): ProjectRecord => ({
  id,
  name,
  workspacePath: `/work/${id}`,
  lastOpenedAt,
});

describe('US-017 AC-1: recent projects for the start wizard', () => {
  it('lists name, path, last opened and phase, most recently opened first', async () => {
    const { registry } = setup([
      project('p1', 'Billing', '2026-10-01T10:00:00Z'),
      project('p2', 'Tasks', '2026-10-14T09:00:00Z'),
      project('p3', 'New', null),
    ]);

    const recent = await registry.recent();

    expect(recent.map((r) => r.id)).toEqual(['p2', 'p1', 'p3']);
    expect(recent[0]).toEqual({
      id: 'p2',
      name: 'Tasks',
      path: '/work/p2',
      lastOpenedAt: '2026-10-14T09:00:00Z',
      phase: { phase: 'requirements', state: 'awaiting_approval' },
      phaseLabel: 'Requirements · awaiting approval',
      missing: false,
    });
  });
});

describe('US-017 AC-2: rename and remove', () => {
  it('renames a project (trimmed) and rejects empty names and unknown projects', async () => {
    const { registry, rows } = setup([project('p1', 'Billing', null)]);

    await registry.rename('p1', '  Billing v2 ');
    expect(rows.get('p1')!.name).toBe('Billing v2');
    await expect(registry.rename('p1', '   ')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(registry.rename('nope', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('removes (unlinks) a project from the registry', async () => {
    const { registry, rows } = setup([project('p1', 'Billing', null)]);

    await registry.remove('p1');

    expect(rows.has('p1')).toBe(false);
  });

  it('blocks removal while runs are active', async () => {
    const { registry, rows } = setup([project('p1', 'Billing', null)], { runs: { p1: 2 } });

    const error = await registry.remove('p1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProjectRegistryError);
    expect(error).toMatchObject({ code: 'RUNS_ACTIVE', message: expect.stringMatching(/2 active runs/) });
    expect(rows.has('p1')).toBe(true);
  });
});

describe('US-017 AC-3: missing project folders', () => {
  it('flags a recent project whose folder is missing', async () => {
    const { registry } = setup([project('p1', 'Billing', null)], { folders: [] });

    const [entry] = await registry.recent();

    expect(entry).toMatchObject({ id: 'p1', missing: true, phase: null, phaseLabel: null });
  });

  it('locates a moved project folder that contains the project descriptor', async () => {
    const { registry, rows } = setup([project('p1', 'Billing', null)], { folders: ['/moved/billing'], descriptors: ['/moved/billing'] });

    await registry.locate('p1', '/moved/billing');

    expect(rows.get('p1')!.workspacePath).toBe('/moved/billing');
  });

  it('refuses a folder that is missing or not a SpecForge project', async () => {
    const { registry } = setup([project('p1', 'Billing', null)], { folders: ['/other'], descriptors: [] });

    await expect(registry.locate('p1', '/gone')).rejects.toMatchObject({ code: 'FOLDER_MISSING' });
    await expect(registry.locate('p1', '/other')).rejects.toMatchObject({ code: 'NOT_A_PROJECT' });
    await expect(registry.locate('nope', '/other')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
