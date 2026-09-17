'use strict';

const { getDb, tableExists, hasColumn } = require('../db');
const { decrypt } = require('../crypto');

let dataIdentitiesReady = false;

function ensureDataIdentitiesTable() {
  if (dataIdentitiesReady) return;
  const db = getDb();
  if (!tableExists('data_identities')) {
    throw new Error(
      'data_identities table missing — run npm run db:init (PostgreSQL schema)'
    );
  }

  if (tableExists('connections') && !hasColumn('connections', 'data_identity_id')) {
    db.exec(
      `ALTER TABLE connections
       ADD COLUMN IF NOT EXISTS data_identity_id BIGINT
       REFERENCES data_identities(id) ON DELETE SET NULL`
    );
  }

  // Mark ready before backfill so getDefaultIdentity cannot re-enter migrate.
  dataIdentitiesReady = true;
  migrateLegacyAdminTokens();
}

function scopesUsable(raw) {
  try {
    const scopes = JSON.parse(raw || '[]');
    if (!Array.isArray(scopes) || !scopes.length) return false;
    if (scopes.includes('__cleared__')) return false;
    return true;
  } catch {
    return false;
  }
}

function tokenReadable(encrypted) {
  if (!encrypted) return false;
  try {
    return Boolean(decrypt(encrypted));
  } catch {
    return false;
  }
}

function publicIdentity(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    email: row.email || null,
    displayName: row.display_name || null,
    sub: row.provider_sub || null,
    isDefault: Boolean(row.is_default),
    status: row.status,
    updatedAt: row.updated_at,
    hasToken: tokenReadable(row.encrypted_token) && row.status === 'active',
  };
}

function migrateLegacyAdminTokens() {
  const db = getDb();
  const googleCount = db
    .prepare(
      `SELECT COUNT(*) AS c FROM data_identities WHERE provider = 'google' AND status = 'active'`
    )
    .get().c;
  if (googleCount === 0) {
    if (tableExists('admin_google_tokens')) {
      const rows = db.prepare(`SELECT * FROM admin_google_tokens`).all();
      for (const row of rows) {
        if (!scopesUsable(row.scopes_json)) continue;
        if (!tokenReadable(row.encrypted_refresh_token)) continue;
        const sub = row.google_sub || `legacy-user-${row.user_id}`;
        db.prepare(
          `INSERT INTO data_identities (
             user_id, provider, provider_sub, email, display_name,
             encrypted_token, scopes_json, is_default, status, updated_at
           ) VALUES (?, 'google', ?, ?, ?, ?, ?, 1, 'active', datetime('now'))
           ON CONFLICT(user_id, provider, provider_sub) DO UPDATE SET
             encrypted_token = excluded.encrypted_token,
             scopes_json = excluded.scopes_json,
             email = COALESCE(excluded.email, data_identities.email),
             is_default = 1,
             status = 'active',
             updated_at = datetime('now')`
        ).run(
          row.user_id,
          sub,
          row.google_email || null,
          row.google_email || null,
          row.encrypted_refresh_token,
          row.scopes_json || '[]'
        );
      }
    }
  }

  const metaCount = db
    .prepare(
      `SELECT COUNT(*) AS c FROM data_identities WHERE provider = 'meta' AND status = 'active'`
    )
    .get().c;
  if (metaCount === 0) {
    if (tableExists('admin_meta_tokens')) {
      const rows = db.prepare(`SELECT * FROM admin_meta_tokens`).all();
      for (const row of rows) {
        if (!scopesUsable(row.scopes_json)) continue;
        if (!tokenReadable(row.encrypted_access_token)) continue;
        const sub = row.meta_user_id || `legacy-meta-${row.user_id}`;
        db.prepare(
          `INSERT INTO data_identities (
             user_id, provider, provider_sub, email, display_name,
             encrypted_token, scopes_json, token_expires_at,
             is_default, status, updated_at
           ) VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, 1, 'active', datetime('now'))
           ON CONFLICT(user_id, provider, provider_sub) DO UPDATE SET
             encrypted_token = excluded.encrypted_token,
             scopes_json = excluded.scopes_json,
             email = COALESCE(excluded.email, data_identities.email),
             display_name = COALESCE(excluded.display_name, data_identities.display_name),
             is_default = 1,
             status = 'active',
             updated_at = datetime('now')`
        ).run(
          row.user_id,
          sub,
          row.meta_email || null,
          row.meta_name || row.meta_email || null,
          row.encrypted_access_token,
          row.scopes_json || '[]',
          row.token_expires_at || null
        );
      }
    }
  }

  // Backfill connections without identity → default google for that connected_by user
  const orphans = db
    .prepare(
      `SELECT id, connected_by_user_id FROM connections
       WHERE data_identity_id IS NULL
         AND provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ADS')
         AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
    )
    .all();
  for (const row of orphans) {
    if (!row.connected_by_user_id) continue;
    const def = getDefaultIdentity(row.connected_by_user_id, 'google');
    if (!def) continue;
    db.prepare(
      `UPDATE connections SET data_identity_id = ? WHERE id = ? AND data_identity_id IS NULL`
    ).run(def.id, row.id);
  }

  const metaOrphans = db
    .prepare(
      `SELECT id, connected_by_user_id FROM connections
       WHERE data_identity_id IS NULL
         AND provider = 'META_ADS'
         AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
    )
    .all();
  for (const row of metaOrphans) {
    if (!row.connected_by_user_id) continue;
    const def = getDefaultIdentity(row.connected_by_user_id, 'meta');
    if (!def) continue;
    db.prepare(
      `UPDATE connections SET data_identity_id = ? WHERE id = ? AND data_identity_id IS NULL`
    ).run(def.id, row.id);
  }
}

function listIdentities(userId, provider = null) {
  ensureDataIdentitiesTable();
  if (provider) {
    return getDb()
      .prepare(
        `SELECT * FROM data_identities
         WHERE user_id = ? AND provider = ? AND status != 'cleared'
         ORDER BY is_default DESC, updated_at DESC`
      )
      .all(userId, provider)
      .map(publicIdentity);
  }
  return getDb()
    .prepare(
      `SELECT * FROM data_identities
       WHERE user_id = ? AND status != 'cleared'
       ORDER BY provider, is_default DESC, updated_at DESC`
    )
    .all(userId)
    .map(publicIdentity);
}

function getIdentity(id) {
  ensureDataIdentitiesTable();
  return getDb()
    .prepare(`SELECT * FROM data_identities WHERE id = ?`)
    .get(id);
}

function getDefaultIdentity(userId, provider) {
  ensureDataIdentitiesTable();
  let row = getDb()
    .prepare(
      `SELECT * FROM data_identities
       WHERE user_id = ? AND provider = ? AND is_default = 1 AND status = 'active'
       LIMIT 1`
    )
    .get(userId, provider);
  if (row && tokenReadable(row.encrypted_token)) return row;
  row = getDb()
    .prepare(
      `SELECT * FROM data_identities
       WHERE user_id = ? AND provider = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(userId, provider);
  if (row && tokenReadable(row.encrypted_token)) return row;
  return null;
}

function getIdentityForUser(userId, identityId, provider) {
  ensureDataIdentitiesTable();
  if (identityId) {
    const row = getIdentity(identityId);
    if (
      row &&
      row.user_id === userId &&
      (!provider || row.provider === provider) &&
      row.status === 'active' &&
      tokenReadable(row.encrypted_token)
    ) {
      return row;
    }
  }
  return getDefaultIdentity(userId, provider || 'google');
}

function clearDefaultFlags(userId, provider) {
  getDb()
    .prepare(
      `UPDATE data_identities SET is_default = 0
       WHERE user_id = ? AND provider = ?`
    )
    .run(userId, provider);
}

/**
 * Upsert a data identity.
 * mode: 'add' | 'replace' | 'reconnect'
 * - add: new sub → insert; same sub → update that row
 * - replace / reconnect: update identityId or default
 */
function upsertIdentity({
  userId,
  provider,
  providerSub,
  email = null,
  displayName = null,
  encryptedToken,
  scopesJson = '[]',
  tokenExpiresAt = null,
  mode = 'add',
  identityId = null,
  makeDefault = false,
}) {
  ensureDataIdentitiesTable();
  const db = getDb();
  const sub = String(providerSub || '').trim() || `anon-${Date.now()}`;

  let target = null;
  if (mode === 'reconnect' && identityId) {
    target = getIdentity(identityId);
    if (!target || target.user_id !== userId || target.provider !== provider) {
      target = null;
    }
  }
  if (!target) {
    target = db
      .prepare(
        `SELECT * FROM data_identities
         WHERE user_id = ? AND provider = ? AND provider_sub = ?`
      )
      .get(userId, provider, sub);
  }

  const existingDefaults = db
    .prepare(
      `SELECT COUNT(*) AS c FROM data_identities
       WHERE user_id = ? AND provider = ? AND status = 'active' AND is_default = 1`
    )
    .get(userId, provider).c;
  const shouldDefault =
    makeDefault ||
    mode === 'replace' ||
    existingDefaults === 0 ||
    (mode === 'add' && existingDefaults === 0);

  if (shouldDefault) clearDefaultFlags(userId, provider);

  if (target) {
    db.prepare(
      `UPDATE data_identities SET
         encrypted_token = ?,
         scopes_json = CASE WHEN ? != '[]' THEN ? ELSE scopes_json END,
         token_expires_at = COALESCE(?, token_expires_at),
         email = COALESCE(?, email),
         display_name = COALESCE(?, display_name),
         provider_sub = ?,
         is_default = CASE WHEN ? = 1 THEN 1 ELSE is_default END,
         status = 'active',
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      encryptedToken,
      scopesJson,
      scopesJson,
      tokenExpiresAt,
      email,
      displayName,
      sub,
      shouldDefault ? 1 : 0,
      target.id
    );
    return getIdentity(target.id);
  }

  const info = db
    .prepare(
      `INSERT INTO data_identities (
         user_id, provider, provider_sub, email, display_name,
         encrypted_token, scopes_json, token_expires_at,
         is_default, status, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    )
    .run(
      userId,
      provider,
      sub,
      email,
      displayName,
      encryptedToken,
      scopesJson || '[]',
      tokenExpiresAt,
      shouldDefault ? 1 : 0
    );
  return getIdentity(info.lastInsertRowid);
}

function setDefaultIdentity(userId, identityId) {
  ensureDataIdentitiesTable();
  const row = getIdentity(identityId);
  if (!row || row.user_id !== userId) {
    const err = new Error('Identity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  clearDefaultFlags(userId, row.provider);
  getDb()
    .prepare(
      `UPDATE data_identities SET is_default = 1, updated_at = datetime('now') WHERE id = ?`
    )
    .run(identityId);
  return getIdentity(identityId);
}

function clearIdentity(userId, identityId) {
  ensureDataIdentitiesTable();
  const row = getIdentity(identityId);
  if (!row || row.user_id !== userId) {
    const err = new Error('Identity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const wasDefault = row.is_default;
  getDb()
    .prepare(
      `UPDATE data_identities SET
         encrypted_token = '',
         scopes_json = '["__cleared__"]',
         status = 'cleared',
         is_default = 0,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(identityId);

  if (wasDefault) {
    const next = getDb()
      .prepare(
        `SELECT id FROM data_identities
         WHERE user_id = ? AND provider = ? AND status = 'active'
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(userId, row.provider);
    if (next) setDefaultIdentity(userId, next.id);
  }
  return { ok: true, id: identityId };
}

function setIdentityNeedsReauth(userId, identityId) {
  ensureDataIdentitiesTable();
  const row = getIdentity(identityId);
  if (!row || row.user_id !== userId) return null;
  getDb()
    .prepare(
      `UPDATE data_identities SET
         status = 'needs_reauth',
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(identityId);
  return getIdentity(identityId);
}

function identityHasLinkedConnections(identityId) {
  ensureDataIdentitiesTable();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM connections WHERE data_identity_id = ?`
    )
    .get(identityId);
  return (row?.c || 0) > 0;
}

module.exports = {
  ensureDataIdentitiesTable,
  listIdentities,
  getIdentity,
  getDefaultIdentity,
  getIdentityForUser,
  upsertIdentity,
  setDefaultIdentity,
  clearIdentity,
  publicIdentity,
  tokenReadable,
  identityHasLinkedConnections,
  setIdentityNeedsReauth,
};
