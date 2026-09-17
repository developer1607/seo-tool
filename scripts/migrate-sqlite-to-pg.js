'use strict';

/**
 * One-shot copy from legacy db/app.sqlite → PostgreSQL (DATABASE_URL).
 * Preserves primary key IDs. Leaves SQLite file untouched as backup.
 *
 * Usage: npm run db:migrate-sqlite
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createPgDatabase } = require('../src/lib/pg-adapter');
const { migrate, closeDb } = require('../src/lib/db');

const sqlitePath =
  process.env.SQLITE_PATH ||
  path.join(__dirname, '..', 'db', 'app.sqlite');

if (!fs.existsSync(sqlitePath)) {
  console.error('SQLite file not found:', sqlitePath);
  process.exit(1);
}

const url = String(process.env.DATABASE_URL || '').trim();
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const TABLES = [
  'users',
  'auth_identities',
  'clients',
  'websites',
  'data_identities',
  'connections',
  'metric_snapshots',
  'reports',
  'notifications',
  'admin_google_tokens',
  'admin_meta_tokens',
];

migrate();
const pg = createPgDatabase(url);
const sqlite = new DatabaseSync(sqlitePath);

function sqliteTables() {
  return new Set(
    sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all()
      .map((r) => r.name)
  );
}

function pgColumns(table) {
  return pg
    .prepare(
      `SELECT column_name AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ?
       ORDER BY ordinal_position`
    )
    .all(table)
    .map((r) => r.name);
}

function sqliteColumns(table) {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

const present = sqliteTables();

pg.exec('BEGIN');
try {
  for (const table of [...TABLES].reverse()) {
    if (present.has(table)) {
      pg.prepare(`DELETE FROM ${table}`).run();
    }
  }

  for (const table of TABLES) {
    if (!present.has(table)) {
      console.log(`skip (missing in sqlite): ${table}`);
      continue;
    }
    const cols = pgColumns(table).filter((c) =>
      sqliteColumns(table).includes(c)
    );
    if (!cols.length) {
      console.log(`skip (no overlapping columns): ${table}`);
      continue;
    }
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.join(', ');
    const insert = pg.prepare(
      `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`
    );
    for (const row of rows) {
      insert.run(...cols.map((c) => row[c]));
    }
    console.log(`${table}: ${rows.length} rows`);

    if (cols.includes('id')) {
      pg.prepare(
        `SELECT setval(
           pg_get_serial_sequence(?, 'id'),
           COALESCE((SELECT MAX(id) FROM ${table}), 1),
           true
         )`
      ).get(`public.${table}`);
    }
  }

  pg.exec('COMMIT');
  console.log('Migration complete. SQLite left at', sqlitePath);
} catch (e) {
  try {
    pg.exec('ROLLBACK');
  } catch {
    /* ignore */
  }
  console.error('Migration failed:', e.message || e);
  process.exitCode = 1;
} finally {
  try {
    sqlite.close();
  } catch {
    /* ignore */
  }
  try {
    pg.close();
  } catch {
    /* ignore */
  }
  closeDb();
}
