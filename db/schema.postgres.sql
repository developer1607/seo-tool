-- Webastral PostgreSQL schema (parity with db/schema.sql + admin token tables)

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN')),
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text),
  UNIQUE (provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL DEFAULT '',
  logo_path TEXT,
  brand_primary TEXT NOT NULL DEFAULT '#0d7a6f',
  brand_secondary TEXT NOT NULL DEFAULT '#1e2530',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS websites (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS data_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'meta')),
  provider_sub TEXT NOT NULL DEFAULT '',
  email TEXT,
  display_name TEXT,
  encrypted_token TEXT NOT NULL DEFAULT '',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_reauth', 'cleared')),
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text),
  UNIQUE (user_id, provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS connections (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id BIGINT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL
    CHECK (provider IN (
      'GOOGLE_ANALYTICS',
      'GOOGLE_SEARCH_CONSOLE',
      'META_ADS',
      'GOOGLE_ADS'
    )),
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
  connected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  data_identity_id BIGINT REFERENCES data_identities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text),
  UNIQUE (website_id, provider)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id BIGINT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN (
      'GOOGLE_SEARCH_CONSOLE',
      'GOOGLE_ANALYTICS',
      'META_ADS',
      'GOOGLE_ADS'
    )),
  date TEXT NOT NULL,
  spend DOUBLE PRECISION,
  impressions DOUBLE PRECISION,
  clicks DOUBLE PRECISION,
  ctr DOUBLE PRECISION,
  avg_position DOUBLE PRECISION,
  reach DOUBLE PRECISION,
  sessions DOUBLE PRECISION,
  users DOUBLE PRECISION,
  engaged_sessions DOUBLE PRECISION,
  engagement_rate DOUBLE PRECISION,
  primary_conversions DOUBLE PRECISION,
  primary_value DOUBLE PRECISION,
  efficiency DOUBLE PRECISION,
  efficiency_kind TEXT NOT NULL DEFAULT 'NONE'
    CHECK (efficiency_kind IN ('NONE', 'ROAS', 'CPA')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL DEFAULT (NOW()::text),
  UNIQUE (website_id, source, date)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id BIGINT REFERENCES websites(id) ON DELETE CASCADE,
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
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  layer TEXT NOT NULL CHECK (layer IN ('PLATFORM', 'CLIENT', 'WEBSITE')),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warn', 'error')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS admin_meta_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TEXT,
  meta_user_id TEXT,
  meta_name TEXT,
  meta_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS admin_google_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_refresh_token TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  google_email TEXT,
  google_sub TEXT,
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS website_onboarding (
  id BIGSERIAL PRIMARY KEY,
  website_id BIGINT NOT NULL UNIQUE REFERENCES websites(id) ON DELETE CASCADE,
  goal_primary TEXT NOT NULL DEFAULT 'TRAFFIC',
  channels_json TEXT NOT NULL DEFAULT '[]',
  conversion_label TEXT,
  ga4_key_events_json TEXT,
  meta_action_types_json TEXT,
  value_mode TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::text),
  updated_at TEXT NOT NULL DEFAULT (NOW()::text)
);

CREATE TABLE IF NOT EXISTS client_invites (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id BIGINT REFERENCES websites(id) ON DELETE CASCADE,
  email TEXT,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::text)
);

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
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
