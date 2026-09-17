'use strict';

const fs = require('fs');
const path = require('path');
const { createPgDatabase } = require('./pg-adapter');

const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.postgres.sql');

let db;

function requireDatabaseUrl() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required (PostgreSQL). Example: ' +
        'postgresql://webastral:webastral@127.0.0.1:5432/webastral'
    );
  }
  return url;
}

function getDb() {
  if (!db) {
    db = createPgDatabase(requireDatabaseUrl());
  }
  return db;
}

function tableExists(name) {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?`
    )
    .get(name);
  return Boolean(row);
}

function columns(table) {
  if (!tableExists(table)) return [];
  return getDb()
    .prepare(
      `SELECT column_name AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ?
       ORDER BY ordinal_position`
    )
    .all(table)
    .map((r) => r.name);
}

function hasColumn(table, col) {
  return columns(table).includes(col);
}

function execSchema() {
  getDb().exec(fs.readFileSync(schemaPath, 'utf8'));
}

function migrate() {
  execSchema();
  // Ensure optional columns exist on older PG DBs created mid-rollout
  if (tableExists('admin_google_tokens')) {
    if (!hasColumn('admin_google_tokens', 'google_email')) {
      getDb().exec(
        `ALTER TABLE admin_google_tokens ADD COLUMN IF NOT EXISTS google_email TEXT`
      );
    }
    if (!hasColumn('admin_google_tokens', 'google_sub')) {
      getDb().exec(
        `ALTER TABLE admin_google_tokens ADD COLUMN IF NOT EXISTS google_sub TEXT`
      );
    }
  }
  if (tableExists('connections') && !hasColumn('connections', 'data_identity_id')) {
    getDb().exec(
      `ALTER TABLE connections
       ADD COLUMN IF NOT EXISTS data_identity_id BIGINT
       REFERENCES data_identities(id) ON DELETE SET NULL`
    );
  }
  // Widen notifications.layer CHECK to include 'WEBSITE'
  if (tableExists('notifications')) {
    try {
      getDb().exec(
        `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_layer_check`
      );
      getDb().exec(
        `ALTER TABLE notifications ADD CONSTRAINT notifications_layer_check
         CHECK (layer IN ('PLATFORM', 'CLIENT', 'WEBSITE'))`
      );
    } catch {
      // constraint may already be correct
    }
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  migrate,
  closeDb,
  tableExists,
  columns,
  hasColumn,
  schemaPath,
  dbPath: null,
};
