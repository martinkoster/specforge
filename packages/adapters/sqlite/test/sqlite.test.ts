// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INDEX_TABLES,
  MIGRATIONS,
  MigrationError,
  ProjectRepository,
  openDatabase,
  rebuildIndex,
  resolveAppDataDir,
  runMigrations,
  type Migration,
  type OpenDatabase,
} from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function open(dir = mkdtempSync(join(tmpdir(), 'sf-db-'))): OpenDatabase {
  const db = openDatabase({ dir });
  opened.push(db);
  return db;
}

const tables = (db: OpenDatabase) =>
  (db.sqlite.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>).map(
    (r) => r.name,
  );

describe('US-007 AC-1: database in the per-user app-data directory, WAL, foreign keys, user-only permissions', () => {
  it.each([
    ['win32', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, 'C:\\Users\\u', 'C:\\Users\\u\\AppData\\Roaming/SpecForge'],
    ['darwin', {}, '/Users/u', '/Users/u/Library/Application Support/SpecForge'],
    ['linux', {}, '/home/u', '/home/u/.config/SpecForge'],
    ['linux', { XDG_CONFIG_HOME: '/data/cfg' }, '/home/u', '/data/cfg/SpecForge'],
  ] as const)('resolves the app-data directory on %s', (platform, env, home, expected) => {
    expect(resolveAppDataDir({ platform, env, homedir: home }).replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
  });

  it('creates specforge.db with WAL journal and foreign keys enabled', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sf-db-')), 'nested', 'SpecForge');
    const db = open(dir);

    expect(existsSync(join(dir, 'specforge.db'))).toBe(true);
    expect(db.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it.skipIf(process.platform === 'win32')('restricts directory and file to the current user (POSIX)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sf-db-')), 'SpecForge');
    open(dir);

    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'specforge.db')).mode & 0o777).toBe(0o600);
  });

  it('applies all migrations when opening', () => {
    const db = open();
    const applied = db.sqlite.prepare('select version from schema_migrations order by version').all() as Array<{ version: number }>;

    expect(applied.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(tables(db)).toEqual(expect.arrayContaining(['project', ...INDEX_TABLES.map((t) => t.name)]));
  });
});

describe('US-007 AC-2: numbered migrations in transactions', () => {
  const ok: Migration = { version: 1, name: 'create_a', sql: 'create table a (id integer primary key);' };

  it('applies pending migrations in order once', () => {
    const db = open();
    const extra: Migration[] = [ok, { version: 2, name: 'create_b', sql: 'create table b (id integer primary key);' }];
    db.sqlite.exec('drop table schema_migrations');

    expect(runMigrations(db.sqlite, extra)).toEqual([1, 2]);
    expect(runMigrations(db.sqlite, extra)).toEqual([]);
    expect(tables(db)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('rolls back a failing migration completely and reports which one failed', () => {
    const db = open();
    db.sqlite.exec('drop table schema_migrations');
    const failing: Migration = { version: 2, name: 'broken', sql: 'create table c (id integer primary key); create tabel oops;' };

    let error: unknown;
    try {
      runMigrations(db.sqlite, [ok, failing]);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).message).toMatch(/Migration 2 \(broken\) failed/);
    expect(tables(db)).toContain('a');
    expect(tables(db)).not.toContain('c');
    expect((db.sqlite.prepare('select version from schema_migrations').all() as Array<{ version: number }>).map((r) => r.version)).toEqual([
      1,
    ]);
  });

  it('rejects duplicate or unordered migration versions', () => {
    const db = open();
    expect(() => runMigrations(db.sqlite, [ok, { ...ok, name: 'dup' }])).toThrow(/strictly ascending/);
    expect(() =>
      runMigrations(db.sqlite, [
        { ...ok, version: 3 },
        { ...ok, version: 2 },
      ]),
    ).toThrow(/strictly ascending/);
  });
});

describe('US-007 AC-3: Kysely-typed repositories', () => {
  it('creates, reads, lists, renames and removes projects', async () => {
    const repo = new ProjectRepository(open().db);

    await repo.create({ id: 'p1', name: 'Alpha', workspacePath: '/w/alpha', vcsMode: 'git', baseBranch: 'main' });
    await repo.create({ id: 'p2', name: 'Beta', workspacePath: '/w/beta', vcsMode: 'none', baseBranch: null });
    await repo.rename('p1', 'Alpha 2');

    expect(await repo.get('p1')).toMatchObject({
      id: 'p1',
      name: 'Alpha 2',
      workspacePath: '/w/alpha',
      vcsMode: 'git',
      baseBranch: 'main',
    });
    expect((await repo.list()).map((p) => p.id)).toEqual(['p1', 'p2']);
    await repo.remove('p2');
    expect(await repo.get('p2')).toBeUndefined();
  });

  it('enforces a unique workspace path', async () => {
    const repo = new ProjectRepository(open().db);
    await repo.create({ id: 'p1', name: 'A', workspacePath: '/w/x', vcsMode: 'git', baseBranch: 'main' });

    await expect(repo.create({ id: 'p2', name: 'B', workspacePath: '/w/x', vcsMode: 'git', baseBranch: 'main' })).rejects.toThrow(/UNIQUE/);
  });

  it('rolls back all writes of a failed transaction', async () => {
    const repo = new ProjectRepository(open().db);

    await expect(
      repo.transaction(async (tx) => {
        await tx.create({ id: 'p1', name: 'A', workspacePath: '/w/a', vcsMode: 'git', baseBranch: 'main' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.list()).toEqual([]);
  });
});

describe('US-007 AC-4: index tables can be dropped and rebuilt', () => {
  it('empties and recreates every index table while keeping registry data', async () => {
    const db = open();
    const repo = new ProjectRepository(db.db);
    await repo.create({ id: 'p1', name: 'A', workspacePath: '/w/a', vcsMode: 'git', baseBranch: 'main' });
    db.sqlite
      .prepare(
        "insert into artifact (project_id, path, kind, approval_state, content_hash, parse_state, indexed_at) values ('p1', 'spec/a.md', 'intent', 'draft', 'h', 'valid', 't')",
      )
      .run();

    rebuildIndex(db.sqlite);

    expect(tables(db)).toEqual(expect.arrayContaining(INDEX_TABLES.map((t) => t.name)));
    for (const t of INDEX_TABLES) expect(db.sqlite.prepare(`select count(*) n from ${t.name}`).get()).toEqual({ n: 0 });
    expect(await repo.list()).toHaveLength(1);
  });
});
