'use strict';

const { getDb } = require('./db');

const GOOGLE_PROVIDERS = [
  'GOOGLE_ANALYTICS',
  'GOOGLE_SEARCH_CONSOLE',
  'GOOGLE_ADS',
];
const GOOGLE_ANALYTICS_PROVIDERS = [
  'GOOGLE_ANALYTICS',
  'GOOGLE_SEARCH_CONSOLE',
];

function getConnection(websiteId, provider) {
  return getDb()
    .prepare(
      `SELECT * FROM connections WHERE website_id = ? AND provider = ?`
    )
    .get(websiteId, provider);
}

function listConnections(websiteId) {
  return getDb()
    .prepare(`SELECT * FROM connections WHERE website_id = ?`)
    .all(websiteId);
}

function upsertConnection({
  clientId,
  websiteId,
  provider,
  status,
  encryptedRefreshToken,
  externalAccountId,
  externalAccountName,
  loginCustomerId,
  scopesJson,
  configJson,
  lastVerifiedAt,
  lastSyncAt,
  lastError,
  connectedByUserId,
  dataIdentityId,
}) {
  const db = getDb();
  // Ensure FK column exists (Phase C migration).
  const { ensureDataIdentitiesTable } = require('./identities/data');
  ensureDataIdentitiesTable();

  const existing = getConnection(websiteId, provider);
  if (existing) {
    db.prepare(
      `UPDATE connections SET
         status = COALESCE(?, status),
         encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
         external_account_id = COALESCE(?, external_account_id),
         external_account_name = COALESCE(?, external_account_name),
         login_customer_id = COALESCE(?, login_customer_id),
         scopes_json = COALESCE(?, scopes_json),
         config_json = COALESCE(?, config_json),
         last_verified_at = COALESCE(?, last_verified_at),
         last_sync_at = COALESCE(?, last_sync_at),
         last_error = ?,
         connected_by_user_id = COALESCE(?, connected_by_user_id),
         data_identity_id = COALESCE(?, data_identity_id),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      status ?? null,
      encryptedRefreshToken ?? null,
      externalAccountId ?? null,
      externalAccountName ?? null,
      loginCustomerId ?? null,
      scopesJson ?? null,
      configJson ?? null,
      lastVerifiedAt ?? null,
      lastSyncAt ?? null,
      lastError === undefined ? existing.last_error : lastError,
      connectedByUserId ?? null,
      dataIdentityId ?? null,
      existing.id
    );
    return getConnection(websiteId, provider);
  }
  db.prepare(
    `INSERT INTO connections (
       client_id, website_id, provider, status, encrypted_refresh_token,
       external_account_id, external_account_name, login_customer_id,
       scopes_json, config_json,
       last_verified_at, last_sync_at, last_error, connected_by_user_id,
       data_identity_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clientId,
    websiteId,
    provider,
    status || 'NOT_STARTED',
    encryptedRefreshToken || null,
    externalAccountId || null,
    externalAccountName || null,
    loginCustomerId || null,
    scopesJson || '[]',
    configJson || '{}',
    lastVerifiedAt || null,
    lastSyncAt || null,
    lastError || null,
    connectedByUserId || null,
    dataIdentityId || null
  );
  return getConnection(websiteId, provider);
}

function setConnectionError(websiteId, provider, message, status = 'ERROR') {
  const existing = getConnection(websiteId, provider);
  if (!existing) return null;
  getDb()
    .prepare(
      `UPDATE connections SET
         status = ?,
         last_error = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(status, message, existing.id);
  return getConnection(websiteId, provider);
}

function markVerified(websiteId, provider) {
  const c = getConnection(websiteId, provider);
  if (!c) return null;
  getDb()
    .prepare(
      `UPDATE connections SET
         status = 'ACTIVE',
         last_verified_at = datetime('now'),
         last_error = NULL,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(c.id);
  return getConnection(websiteId, provider);
}

function markSynced(websiteId, provider) {
  const c = getConnection(websiteId, provider);
  if (!c) return null;
  getDb()
    .prepare(
      `UPDATE connections SET
         last_sync_at = datetime('now'),
         last_error = NULL,
         status = 'ACTIVE',
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(c.id);
  return getConnection(websiteId, provider);
}

function disconnect(websiteId, provider) {
  const c = getConnection(websiteId, provider);
  if (!c) return null;
  getDb()
    .prepare(
      `UPDATE connections SET
         status = 'DISCONNECTED',
         encrypted_refresh_token = NULL,
         external_account_id = NULL,
         external_account_name = NULL,
         login_customer_id = NULL,
         last_error = NULL,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(c.id);
  return getConnection(websiteId, provider);
}

function findGoogleTokenConnection(websiteId) {
  const rows = listConnections(websiteId).filter(
    (r) =>
      GOOGLE_PROVIDERS.includes(r.provider) &&
      r.encrypted_refresh_token &&
      !['DISCONNECTED', 'NOT_STARTED'].includes(r.status)
  );
  return rows[0] || null;
}

function parseConfigJson(raw) {
  try {
    const o = JSON.parse(raw || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/** website = client's own Google on this site only; agency = portal login reuse */
function googleAuthMode(row) {
  if (!row) return null;
  const cfg = parseConfigJson(row.config_json);
  if (cfg.google_auth === 'website' || cfg.google_auth === 'agency') {
    return cfg.google_auth;
  }
  return null;
}

function isWebsiteLocalGoogle(row) {
  return googleAuthMode(row) === 'website';
}

function googleAuthConfigJson(mode) {
  return JSON.stringify({ google_auth: mode === 'website' ? 'website' : 'agency' });
}

/** Strip secrets before sending connection rows to the browser. */
function publicConnection(row) {
  if (!row) return null;
  const { encrypted_refresh_token, ...rest } = row;
  return {
    ...rest,
    google_auth: googleAuthMode(row),
  };
}

module.exports = {
  GOOGLE_PROVIDERS,
  GOOGLE_ANALYTICS_PROVIDERS,
  getConnection,
  listConnections,
  upsertConnection,
  setConnectionError,
  markVerified,
  markSynced,
  disconnect,
  findGoogleTokenConnection,
  publicConnection,
  googleAuthMode,
  isWebsiteLocalGoogle,
  googleAuthConfigJson,
  parseConfigJson,
};
