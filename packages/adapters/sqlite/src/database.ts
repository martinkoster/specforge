// SPDX-License-Identifier: Apache-2.0
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database, { type Database as Sqlite } from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { runMigrations } from './migrations.js';
import { MIGRATIONS, type DatabaseSchema } from './schema.js';

export interface OpenDatabase {
  sqlite: Sqlite;
  db: Kysely<DatabaseSchema>;
  close(): void;
}

export interface OpenOptions {
  /** App-data directory (see `resolveAppDataDir`). */
  dir: string;
  fileName?: string;
}

const POSIX = process.platform !== 'win32';

/**
 * Opens (and creates) the SpecForge database: user-only permissions on POSIX (Windows: the per-user
 * app-data directory is already restricted by its inherited ACL), WAL mode, foreign keys, pending migrations applied.
 */
export function openDatabase({ dir, fileName = 'specforge.db' }: OpenOptions): OpenDatabase {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (POSIX) chmodSync(dir, 0o700);
  const file = join(dir, fileName);
  const sqlite = new Database(file);
  if (POSIX) chmodSync(file, 0o600);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  runMigrations(sqlite, MIGRATIONS);
  const db = new Kysely<DatabaseSchema>({ dialect: new SqliteDialect({ database: sqlite }) });
  return {
    sqlite,
    db,
    close: () => sqlite.close(),
  };
}
