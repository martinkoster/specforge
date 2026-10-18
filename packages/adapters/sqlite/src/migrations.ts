// SPDX-License-Identifier: Apache-2.0
import type { Database as Sqlite } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    cause: unknown,
  ) {
    super(`Migration ${migration.version} (${migration.name}) failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
  }
}

/** Applies pending migrations in ascending order, each in its own transaction. Returns the applied versions. */
export function runMigrations(sqlite: Sqlite, migrations: readonly Migration[]): number[] {
  migrations.forEach((m, i) => {
    if (i > 0 && m.version <= migrations[i - 1]!.version) throw new Error('Migration versions must be strictly ascending.');
  });
  sqlite.exec('create table if not exists schema_migrations (version integer primary key, name text not null, applied_at text not null)');
  const applied = new Set(
    (sqlite.prepare('select version from schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );
  const record = sqlite.prepare('insert into schema_migrations (version, name, applied_at) values (?, ?, ?)');

  const done: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const apply = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
    });
    try {
      apply();
    } catch (e) {
      throw new MigrationError(migration, e);
    }
    done.push(migration.version);
  }
  return done;
}
