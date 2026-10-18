// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionRuleRepository, ProjectRepository, openDatabase, type OpenDatabase } from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup() {
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-rules-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'P', name: 'P', workspacePath: '/w/p', vcsMode: 'git', baseBranch: 'main' });
  return new PermissionRuleRepository(db.sqlite);
}

describe('US-014 AC-3: effective rules with origin; projects can disable global rules', () => {
  it('stores global and project rules and returns the effective rules with their origin', async () => {
    const repo = await setup();
    const g = repo.create({ scope: 'global', effect: 'allow', toolName: 'Read', appliesTo: 'all', createdFrom: 'setup' });
    const p = repo.create({
      scope: 'project',
      projectId: 'P',
      effect: 'deny',
      toolName: 'Bash',
      pattern: 'npm publish',
      appliesTo: 'all',
      createdFrom: 'settings',
    });

    expect(repo.effective('P')).toEqual([
      { rule: { ...g, pattern: undefined, projectId: undefined }, origin: 'global', disabled: false },
      { rule: { ...p }, origin: 'project', disabled: false },
    ]);
    expect(g.id).toMatch(/\S/);
  });

  it('lets a project disable and re-enable a global rule', async () => {
    const repo = await setup();
    const g = repo.create({ scope: 'global', effect: 'allow', toolName: 'Read', appliesTo: 'all', createdFrom: 'setup' });

    repo.setGlobalDisabled('P', g.id, true);
    expect(repo.effective('P')[0]).toMatchObject({ origin: 'global', disabled: true });

    repo.setGlobalDisabled('P', g.id, false);
    expect(repo.effective('P')[0]).toMatchObject({ disabled: false });
  });

  it('does not show project rules of other projects and deletes rules', async () => {
    const repo = await setup();
    const p = repo.create({
      scope: 'project',
      projectId: 'P',
      effect: 'allow',
      toolName: 'Edit',
      appliesTo: 'implementation',
      createdFrom: 'prompt',
    });

    expect(repo.effective('OTHER')).toEqual([]);
    repo.delete(p.id);
    expect(repo.effective('P')).toEqual([]);
  });

  it('rejects project rules without a project and global rules with one', async () => {
    const repo = await setup();
    expect(() => repo.create({ scope: 'project', effect: 'allow', toolName: 'Edit', appliesTo: 'all', createdFrom: 'settings' })).toThrow(
      /project/,
    );
    expect(() =>
      repo.create({ scope: 'global', projectId: 'P', effect: 'allow', toolName: 'Edit', appliesTo: 'all', createdFrom: 'settings' }),
    ).toThrow(/global/);
  });
});
