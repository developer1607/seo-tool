'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', '..', 'db', 'app.sqlite');
const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function tableExists(name) {
  return Boolean(
    getDb()
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(name)
  );
}

function columns(table) {
  if (!tableExists(table)) return [];
  return getDb()
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

function hasColumn(table, col) {
  return columns(table).includes(col);
}

function isLegacyPoc() {
  if (!tableExists('users')) return false;
  if (!tableExists('clients')) return true;
  const roles = getDb()
    .prepare(`SELECT DISTINCT role FROM users`)
    .all()
    .map((r) => r.role);
  return roles.some((r) => r !== 'ADMIN');
}

function execSchema() {
  getDb().exec(fs.readFileSync(schemaPath, 'utf8'));
}

function createIndexes() {
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_websites_client ON websites(client_id);
    CREATE INDEX IF NOT EXISTS idx_connections_client ON connections(client_id);
    CREATE INDEX IF NOT EXISTS idx_connections_website ON connections(website_id);
    CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);
    CREATE INDEX IF NOT EXISTS idx_snapshots_website_date ON metric_snapshots(website_id, date);
    CREATE INDEX IF NOT EXISTS idx_snapshots_client_date ON metric_snapshots(client_id, date);
    CREATE INDEX IF NOT EXISTS idx_snapshots_source ON metric_snapshots(website_id, source);
    CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
    CREATE INDEX IF NOT EXISTS idx_reports_website ON reports(website_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id);
    CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
    CREATE INDEX IF NOT EXISTS idx_data_identities_user ON data_identities(user_id, provider);
    CREATE INDEX IF NOT EXISTS idx_connections_data_identity ON connections(data_identity_id);
  `);
}

function rebuildConnectionsWithWebsite() {
  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS connections_new;
    CREATE TABLE connections_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      encrypted_refresh_token TEXT,
      token_expires_at TEXT,
      external_account_id TEXT,
      external_account_name TEXT,
      login_customer_id TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      scopes_json TEXT NOT NULL DEFAULT '[]',
      last_verified_at TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      connected_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (website_id, provider)
    );
    INSERT INTO connections_new (
      id, client_id, website_id, provider, status, encrypted_refresh_token,
      token_expires_at, external_account_id, external_account_name, login_customer_id,
      config_json, scopes_json, last_verified_at, last_sync_at, last_error,
      connected_by_user_id, created_at, updated_at
    )
    SELECT
      o.id, o.client_id,
      (SELECT id FROM websites w WHERE w.client_id = o.client_id ORDER BY w.id LIMIT 1),
      o.provider, o.status, o.encrypted_refresh_token,
      o.token_expires_at, o.external_account_id, o.external_account_name, o.login_customer_id,
      o.config_json, o.scopes_json, o.last_verified_at, o.last_sync_at, o.last_error,
      o.connected_by_user_id, o.created_at, o.updated_at
    FROM connections o
    WHERE EXISTS (SELECT 1 FROM websites w WHERE w.client_id = o.client_id);
    DROP TABLE connections;
    ALTER TABLE connections_new RENAME TO connections;
    PRAGMA foreign_keys = ON;
  `);
}

function rebuildSnapshotsWithWebsite() {
  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS metric_snapshots_new;
    CREATE TABLE metric_snapshots_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      date TEXT NOT NULL,
      spend REAL,
      impressions REAL,
      clicks REAL,
      ctr REAL,
      avg_position REAL,
      reach REAL,
      sessions REAL,
      users REAL,
      engaged_sessions REAL,
      engagement_rate REAL,
      primary_conversions REAL,
      primary_value REAL,
      efficiency REAL,
      efficiency_kind TEXT NOT NULL DEFAULT 'NONE',
      payload_json TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (website_id, source, date)
    );
    INSERT INTO metric_snapshots_new (
      id, client_id, website_id, source, date, spend, impressions, clicks, ctr,
      avg_position, reach, sessions, users, engaged_sessions, engagement_rate,
      primary_conversions, primary_value, efficiency, efficiency_kind, payload_json, synced_at
    )
    SELECT
      o.id, o.client_id,
      (SELECT id FROM websites w WHERE w.client_id = o.client_id ORDER BY w.id LIMIT 1),
      o.source, o.date, o.spend, o.impressions, o.clicks, o.ctr,
      o.avg_position, o.reach, o.sessions, o.users, o.engaged_sessions, o.engagement_rate,
      o.primary_conversions, o.primary_value, o.efficiency, o.efficiency_kind, o.payload_json, o.synced_at
    FROM metric_snapshots o
    WHERE EXISTS (SELECT 1 FROM websites w WHERE w.client_id = o.client_id);
    DROP TABLE metric_snapshots;
    ALTER TABLE metric_snapshots_new RENAME TO metric_snapshots;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureWebsiteModel() {
  // Fresh DB: create all tables. Existing DB may have old connections without website_id —
  // CREATE TABLE IF NOT EXISTS keeps the old shape; we rebuild those tables below.
  if (!tableExists('connections') || hasColumn('connections', 'website_id')) {
    execSchema();
  } else {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        currency TEXT NOT NULL DEFAULT 'INR',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  if (!tableExists('clients')) {
    createIndexes();
    return;
  }

  const database = getDb();
  const clients = database.prepare(`SELECT * FROM clients`).all();
  const insertSite = database.prepare(
    `INSERT INTO websites (client_id, name, url, timezone, currency)
     VALUES (?, ?, ?, ?, ?)`
  );
  const countSites = database.prepare(
    `SELECT COUNT(*) AS c FROM websites WHERE client_id = ?`
  );

  for (const c of clients) {
    if (countSites.get(c.id).c > 0) continue;
    const url = c.website_url || 'https://example.com';
    insertSite.run(c.id, c.name || 'Primary site', url, c.timezone, c.currency);
  }

  if (tableExists('connections') && !hasColumn('connections', 'website_id')) {
    rebuildConnectionsWithWebsite();
  }
  if (tableExists('metric_snapshots') && !hasColumn('metric_snapshots', 'website_id')) {
    rebuildSnapshotsWithWebsite();
  }
  if (tableExists('reports') && !hasColumn('reports', 'website_id')) {
    database.exec(`ALTER TABLE reports ADD COLUMN website_id INTEGER`);
    database.exec(`
      UPDATE reports SET website_id = (
        SELECT id FROM websites WHERE websites.client_id = reports.client_id LIMIT 1
      )
      WHERE website_id IS NULL
    `);
  }

  createIndexes();
  try {
    require('./auth/identities').ensureAuthIdentitiesTable();
    require('./meta/agency').ensureAdminMetaTable();
    require('./identities/data').ensureDataIdentitiesTable();
    require('./google/agency').ensureAdminGoogleTable();
  } catch {
    /* created on first use */
  }
}

function migrate() {
  const database = getDb();
  if (isLegacyPoc()) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS notifications;
      DROP TABLE IF EXISTS metric_snapshots;
      DROP TABLE IF EXISTS connections;
      DROP TABLE IF EXISTS website_onboarding;
      DROP TABLE IF EXISTS websites;
      DROP TABLE IF EXISTS reports;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS users;
      PRAGMA foreign_keys = ON;
    `);
  }
  ensureWebsiteModel();
}

module.exports = { getDb, migrate, dbPath };
