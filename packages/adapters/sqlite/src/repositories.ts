// SPDX-License-Identifier: Apache-2.0
import type { Kysely, Transaction } from 'kysely';
import type { DatabaseSchema, ProjectTable } from './schema.js';

/** Base class for Kysely-typed repositories; `transaction` runs `fn` with a repository bound to one transaction. */
export abstract class KyselyRepository<Self> {
  constructor(protected readonly db: Kysely<DatabaseSchema>) {}

  protected abstract bind(db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>): Self;

  transaction<T>(fn: (repository: Self) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((trx) => fn(this.bind(trx)));
  }
}

export interface Project {
  id: string;
  name: string;
  workspacePath: string;
  vcsMode: 'git' | 'none';
  baseBranch: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
}

export type NewProject = Pick<Project, 'id' | 'name' | 'workspacePath' | 'vcsMode' | 'baseBranch'>;

function toProject(row: ProjectTable): Project {
  return {
    id: row.id,
    name: row.name,
    workspacePath: row.workspace_path,
    vcsMode: row.vcs_mode,
    baseBranch: row.base_branch,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
  };
}

/** Project registry (data_model.md §2.1). */
export class ProjectRepository extends KyselyRepository<ProjectRepository> {
  protected bind(db: Kysely<DatabaseSchema>): ProjectRepository {
    return new ProjectRepository(db);
  }

  async create(project: NewProject): Promise<void> {
    await this.db
      .insertInto('project')
      .values({
        id: project.id,
        name: project.name,
        workspace_path: project.workspacePath,
        vcs_mode: project.vcsMode,
        base_branch: project.baseBranch,
        created_at: new Date().toISOString(),
        last_opened_at: null,
      })
      .execute();
  }

  async get(id: string): Promise<Project | undefined> {
    const row = await this.db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toProject(row) : undefined;
  }

  async list(): Promise<Project[]> {
    return (await this.db.selectFrom('project').selectAll().orderBy('created_at').orderBy('id').execute()).map(toProject);
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.updateTable('project').set({ name }).where('id', '=', id).execute();
  }

  async remove(id: string): Promise<void> {
    await this.db.deleteFrom('project').where('id', '=', id).execute();
  }

  /** Records that the project was opened (sorts the recent-projects list). */
  async touch(id: string, at: string = new Date().toISOString()): Promise<void> {
    await this.db.updateTable('project').set({ last_opened_at: at }).where('id', '=', id).execute();
  }

  async findByPath(workspacePath: string): Promise<Project | undefined> {
    const row = await this.db.selectFrom('project').selectAll().where('workspace_path', '=', workspacePath).executeTakeFirst();
    return row ? toProject(row) : undefined;
  }

  /**
   * Records the VCS mode detected on open (FR-004). The detected branch becomes the base branch only if none is set
   * yet — a base branch configured in the project settings (US-016) is kept; non-git mode has no base branch.
   */
  async updateVcs(id: string, vcsMode: 'git' | 'none', detectedBranch: string | null): Promise<void> {
    await this.db
      .updateTable('project')
      .set((eb) => ({
        vcs_mode: vcsMode,
        base_branch: vcsMode === 'none' ? null : eb.fn.coalesce('base_branch', eb.val(detectedBranch)),
      }))
      .where('id', '=', id)
      .execute();
  }

  async setBaseBranch(id: string, baseBranch: string): Promise<void> {
    await this.db.updateTable('project').set({ base_branch: baseBranch }).where('id', '=', id).execute();
  }

  /** Points the project at its moved workspace folder. */
  async relocate(id: string, workspacePath: string): Promise<void> {
    await this.db.updateTable('project').set({ workspace_path: workspacePath }).where('id', '=', id).execute();
  }
}
