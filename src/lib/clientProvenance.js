'use strict';

const { getDb, tableExists, hasColumn } = require('./db');
const {
  ORIGIN_FAMILIES,
  KNOWN_SOURCES,
  PROVIDER_BY_SOURCE,
  MANUAL_SOURCE,
  familyForProvider,
  sourceForProvider: catalogSourceForProvider,
  isKnownOrigin,
  seedRows,
} = require('./integrations/catalog');

const ORIGINS = ORIGIN_FAMILIES;
const SOURCES = KNOWN_SOURCES;

function normalizeDomain(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.toLowerCase();
    if (!host) return null;
    return host.replace(/^www\./, '') || null;
  } catch {
    const cleaned = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .toLowerCase()
      .replace(/^www\./, '');
    return cleaned || null;
  }
}

function ensureIntegrationProvidersTable() {
  if (!tableExists('integration_providers')) {
    getDb().exec(`
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
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        updated_at TEXT NOT NULL DEFAULT (NOW()::text)
      );
    `);
  }
  const upsert = getDb().prepare(`
    INSERT INTO integration_providers (
      provider_key, family, label, phase, auth_kind, source_key,
      identity_provider, metric_source, enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (provider_key) DO UPDATE SET
      family = excluded.family,
      label = excluded.label,
      phase = excluded.phase,
      auth_kind = excluded.auth_kind,
      source_key = excluded.source_key,
      identity_provider = excluded.identity_provider,
      metric_source = excluded.metric_source,
      enabled = excluded.enabled,
      updated_at = datetime('now')
  `);
  for (const row of seedRows()) {
    upsert.run(
      row.provider_key,
      row.family,
      row.label,
      row.phase,
      row.auth_kind,
      row.source_key,
      row.identity_provider,
      row.metric_source,
      row.enabled
    );
  }
}

function ensureClientSourcesTable() {
  if (!tableExists('client_sources')) {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS client_sources (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        website_id BIGINT REFERENCES websites(id) ON DELETE SET NULL,
        source TEXT NOT NULL,
        family TEXT NOT NULL DEFAULT 'OTHER',
        external_account_id TEXT NOT NULL DEFAULT '',
        data_identity_id BIGINT REFERENCES data_identities(id) ON DELETE SET NULL,
        created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        UNIQUE (client_id, source, external_account_id)
      );
    `);
  } else {
    if (!hasColumn('client_sources', 'family')) {
      getDb().exec(
        `ALTER TABLE client_sources ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'OTHER'`
      );
    }
    if (!hasColumn('client_sources', 'meta_json')) {
      getDb().exec(
        `ALTER TABLE client_sources ADD COLUMN IF NOT EXISTS meta_json TEXT NOT NULL DEFAULT '{}'`
      );
    }
  }
  getDb().exec(
    `CREATE INDEX IF NOT EXISTS idx_client_sources_family ON client_sources(family)`
  );
}

function ensureAccessStubTables() {
  if (!tableExists('user_client_access')) {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS user_client_access (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'VIEWER',
        granted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        UNIQUE (user_id, client_id)
      );
    `);
  }
  if (!tableExists('user_domain_access')) {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS user_domain_access (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        primary_domain TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'VIEWER',
        granted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        UNIQUE (user_id, primary_domain)
      );
    `);
  }
  getDb().exec(
    `CREATE INDEX IF NOT EXISTS idx_user_client_access_user ON user_client_access(user_id)`
  );
  getDb().exec(
    `CREATE INDEX IF NOT EXISTS idx_user_domain_access_domain ON user_domain_access(primary_domain)`
  );
}

function familyForSource(source) {
  if (source === 'MANUAL') return MANUAL_SOURCE.family;
  return PROVIDER_BY_SOURCE[source]?.family || 'OTHER';
}

function setClientOriginIfNew(clientId, origin, createdByUserId = null) {
  const fam = isKnownOrigin(origin) ? origin : 'OTHER';
  const row = getDb()
    .prepare(`SELECT id, origin, created_by_user_id FROM clients WHERE id = ?`)
    .get(clientId);
  if (!row) return null;
  // Never overwrite an existing non-MANUAL provenance.
  if (row.origin && row.origin !== 'MANUAL' && fam !== row.origin) {
    return row;
  }
  if (row.origin === fam && (row.created_by_user_id || !createdByUserId)) {
    return row;
  }
  getDb()
    .prepare(
      `UPDATE clients SET
         origin = CASE
           WHEN origin = 'MANUAL' OR origin IS NULL OR origin = '' THEN ?
           ELSE origin
         END,
         created_by_user_id = COALESCE(created_by_user_id, ?),
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(fam, createdByUserId, clientId);
  return getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
}

function recordClientSource({
  clientId,
  websiteId = null,
  source,
  family = null,
  externalAccountId = '',
  dataIdentityId = null,
  createdByUserId = null,
  metaJson = null,
}) {
  if (!String(source || '').trim()) {
    throw new Error('client source required');
  }
  // Allow forward-compat unknown sources (family OTHER) so new
  // integrations can write before catalog.js is bumped in the same deploy.
  const src = String(source || '').trim();
  ensureClientSourcesTable();
  const fam = family || familyForSource(src);
  const ext = String(externalAccountId || '');
  const meta =
    metaJson == null
      ? '{}'
      : typeof metaJson === 'string'
        ? metaJson
        : JSON.stringify(metaJson);
  getDb()
    .prepare(
      `INSERT INTO client_sources (
         client_id, website_id, source, family, external_account_id,
         data_identity_id, created_by_user_id, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_id, source, external_account_id) DO UPDATE SET
         website_id = COALESCE(excluded.website_id, client_sources.website_id),
         family = COALESCE(NULLIF(excluded.family, ''), client_sources.family),
         data_identity_id = COALESCE(
           excluded.data_identity_id,
           client_sources.data_identity_id
         ),
         meta_json = CASE
           WHEN excluded.meta_json IS NOT NULL AND excluded.meta_json != '{}'
           THEN excluded.meta_json
           ELSE client_sources.meta_json
         END`
    )
    .run(
      clientId,
      websiteId || null,
      src,
      fam,
      ext,
      dataIdentityId || null,
      createdByUserId || null,
      meta
    );
  return getDb()
    .prepare(
      `SELECT * FROM client_sources
       WHERE client_id = ? AND source = ? AND external_account_id = ?`
    )
    .get(clientId, src, ext);
}

function sourceForProvider(provider) {
  return catalogSourceForProvider(provider);
}

function listClientSources(clientId) {
  ensureClientSourcesTable();
  return getDb()
    .prepare(
      `SELECT * FROM client_sources WHERE client_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(clientId);
}

function dropProviderCheckConstraints() {
  // Open TEXT keys so LinkedIn / TikTok / Microsoft can land without DDL rewrites.
  const byTable = [
    ['clients', 'clients_origin_check'],
    ['data_identities', 'data_identities_provider_check'],
    ['client_sources', 'client_sources_source_check'],
    ['connections', 'connections_provider_check'],
    ['metric_snapshots', 'metric_snapshots_source_check'],
  ];
  for (const [table, cname] of byTable) {
    if (!tableExists(table)) continue;
    try {
      getDb().exec(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${cname}`);
    } catch {
      /* ignore */
    }
  }
  // Also drop any leftover CHECK on those columns (auto-named on older DBs).
  try {
    const rows = getDb()
      .prepare(
        `SELECT c.conrelid::regclass::text AS table_name, c.conname
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'c'
           AND c.conrelid::regclass::text IN (
             'clients', 'data_identities', 'client_sources',
             'connections', 'metric_snapshots'
           )
           AND a.attname IN ('origin', 'provider', 'source')`
      )
      .all();
    for (const r of rows) {
      try {
        getDb().exec(
          `ALTER TABLE ${r.table_name} DROP CONSTRAINT IF EXISTS ${r.conname}`
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* pg_catalog unavailable */
  }
}

function backfillProvenance() {
  ensureIntegrationProvidersTable();
  ensureClientSourcesTable();
  ensureAccessStubTables();
  dropProviderCheckConstraints();
  const db = getDb();

  if (hasColumn('websites', 'primary_domain')) {
    const sites = db
      .prepare(
        `SELECT id, url FROM websites WHERE primary_domain IS NULL OR primary_domain = ''`
      )
      .all();
    const upd = db.prepare(
      `UPDATE websites SET primary_domain = ? WHERE id = ?`
    );
    for (const s of sites) {
      const d = normalizeDomain(s.url);
      if (d) upd.run(d, s.id);
    }
  }

  if (!hasColumn('clients', 'origin')) return;

  const clients = db.prepare(`SELECT id, origin FROM clients`).all();
  for (const c of clients) {
    const providers = db
      .prepare(
        `SELECT DISTINCT provider FROM connections
         WHERE client_id = ? AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
      )
      .all(c.id)
      .map((r) => r.provider);

    const families = new Set(
      providers.map((p) => familyForProvider(p)).filter((f) => f && f !== 'OTHER')
    );
    let origin = c.origin || 'MANUAL';
    if (origin === 'MANUAL' || !origin) {
      if (families.has('GOOGLE')) origin = 'GOOGLE';
      else if (families.has('META')) origin = 'META';
      else if (families.has('LINKEDIN')) origin = 'LINKEDIN';
      else if (families.has('TIKTOK')) origin = 'TIKTOK';
      else if (families.has('MICROSOFT')) origin = 'MICROSOFT';
      else if (families.size === 1) origin = [...families][0];
      else origin = 'MANUAL';
      db.prepare(
        `UPDATE clients SET origin = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(origin, c.id);
    }

    const conns = db
      .prepare(
        `SELECT website_id, provider, external_account_id, data_identity_id,
                connected_by_user_id
         FROM connections
         WHERE client_id = ?
           AND external_account_id IS NOT NULL
           AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
      )
      .all(c.id);
    for (const conn of conns) {
      const source = sourceForProvider(conn.provider);
      if (!source) {
        // Unknown future provider: record under its own key + family.
        try {
          recordClientSource({
            clientId: c.id,
            websiteId: conn.website_id,
            source: conn.provider,
            family: familyForProvider(conn.provider),
            externalAccountId: conn.external_account_id,
            dataIdentityId: conn.data_identity_id,
            createdByUserId: conn.connected_by_user_id,
          });
        } catch {
          /* ignore */
        }
        continue;
      }
      try {
        recordClientSource({
          clientId: c.id,
          websiteId: conn.website_id,
          source,
          family: familyForProvider(conn.provider),
          externalAccountId: conn.external_account_id,
          dataIdentityId: conn.data_identity_id,
          createdByUserId: conn.connected_by_user_id,
        });
      } catch {
        /* ignore backfill conflicts */
      }
    }

    if (!conns.length && origin === 'MANUAL') {
      try {
        recordClientSource({
          clientId: c.id,
          source: 'MANUAL',
          family: 'MANUAL',
          externalAccountId: '',
        });
      } catch {
        /* ignore */
      }
    }
  }

  // Backfill family on older client_sources rows.
  if (hasColumn('client_sources', 'family')) {
    const rows = db
      .prepare(
        `SELECT id, source, family FROM client_sources
         WHERE family IS NULL OR family = '' OR family = 'OTHER'`
      )
      .all();
    const upd = db.prepare(`UPDATE client_sources SET family = ? WHERE id = ?`);
    for (const r of rows) {
      const fam = familyForSource(r.source);
      if (fam && fam !== r.family) upd.run(fam, r.id);
    }
  }
}

module.exports = {
  ORIGINS,
  SOURCES,
  normalizeDomain,
  setClientOriginIfNew,
  recordClientSource,
  sourceForProvider,
  familyForProvider,
  familyForSource,
  listClientSources,
  ensureClientSourcesTable,
  ensureIntegrationProvidersTable,
  ensureAccessStubTables,
  dropProviderCheckConstraints,
  backfillProvenance,
};
