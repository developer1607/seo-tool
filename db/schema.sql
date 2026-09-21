-- Webastral — schema (indexes applied in migrate after website_id backfill)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Portal login IdPs (Google SSO). Separate from Google data OAuth tokens.
CREATE TABLE IF NOT EXISTS auth_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_sub)
);

-- origin = first platform family (never overwritten). Open TEXT — see catalog.js.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL DEFAULT '',
  logo_path TEXT,
  brand_primary TEXT NOT NULL DEFAULT '#0d7a6f',
  brand_secondary TEXT NOT NULL DEFAULT '#1e2530',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'MANUAL',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  primary_domain TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL DEFAULT '',
  email TEXT,
  display_name TEXT,
  encrypted_token TEXT NOT NULL DEFAULT '',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_reauth', 'cleared')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS integration_providers (
  provider_key TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  label TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'later',
  auth_kind TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL,
  identity_provider TEXT,
  metric_source TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  family TEXT NOT NULL DEFAULT 'OTHER',
  external_account_id TEXT NOT NULL DEFAULT '',
  data_identity_id INTEGER REFERENCES data_identities(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, source, external_account_id)
);

CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN (
      'NOT_STARTED',
      'PENDING_AUTH',
      'PENDING_SELECT',
      'ACTIVE',
      'ERROR',
      'NEEDS_REAUTH',
      'DISCONNECTED'
    )),
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
  data_identity_id INTEGER REFERENCES data_identities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (website_id, provider)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
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
  efficiency_kind TEXT NOT NULL DEFAULT 'NONE'
    CHECK (efficiency_kind IN ('NONE', 'ROAS', 'CPA')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (website_id, source, date)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  range_from TEXT NOT NULL,
  range_to TEXT NOT NULL,
  compare_from TEXT,
  compare_to TEXT,
  branding_json TEXT NOT NULL DEFAULT '{}',
  columns_json TEXT NOT NULL DEFAULT '{}',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  ai_summary TEXT NOT NULL DEFAULT '',
  ai_summary_edited TEXT,
  share_token TEXT UNIQUE,
  share_expires_at TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  layer TEXT NOT NULL CHECK (layer IN ('PLATFORM', 'CLIENT', 'WEBSITE')),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warn', 'error')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agency Meta login (one long-lived token per Admin)
CREATE TABLE IF NOT EXISTS admin_meta_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TEXT,
  meta_user_id TEXT,
  meta_name TEXT,
  meta_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Future employee / multi-tenant ACL (schema only — no UI yet).
CREATE TABLE IF NOT EXISTS user_client_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  granted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS user_domain_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_domain TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  granted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, primary_domain)
);

