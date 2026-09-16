'use strict';

const { getDb } = require('../db');
const { decrypt } = require('../crypto');
const {
  ensureDataIdentitiesTable,
  getDefaultIdentity,
  getIdentityForUser,
  upsertIdentity,
  listIdentities,
  clearIdentity,
  publicIdentity,
} = require('../identities/data');

const CLEARED = '["__cleared__"]';

function ensureAdminMetaTable() {
  const db = getDb();
  db.exec(`
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
  `);
  ensureDataIdentitiesTable();
}

function mirrorDefaultToAdminTable(userId) {
  ensureAdminMetaTable();
  const def = getDefaultIdentity(userId, 'meta');
  if (!def) {
    getDb()
      .prepare(
        `INSERT INTO admin_meta_tokens (
           user_id, encrypted_access_token, scopes_json,
           token_expires_at, meta_user_id, meta_name, meta_email, updated_at
         ) VALUES (?, '', ?, NULL, NULL, NULL, NULL, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           encrypted_access_token = '',
           scopes_json = excluded.scopes_json,
           token_expires_at = NULL,
           meta_user_id = NULL,
           meta_name = NULL,
           meta_email = NULL,
           updated_at = datetime('now')`
      )
      .run(userId, CLEARED);
    return null;
  }
  getDb()
    .prepare(
      `INSERT INTO admin_meta_tokens (
         user_id, encrypted_access_token, scopes_json, token_expires_at,
         meta_user_id, meta_name, meta_email, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         scopes_json = excluded.scopes_json,
         token_expires_at = excluded.token_expires_at,
         meta_user_id = excluded.meta_user_id,
         meta_name = excluded.meta_name,
         meta_email = excluded.meta_email,
         updated_at = datetime('now')`
    )
    .run(
      userId,
      def.encrypted_token,
      def.scopes_json,
      def.token_expires_at,
      def.provider_sub,
      def.display_name,
      def.email
    );
  return def;
}

function getAdminMetaToken(userId) {
  ensureAdminMetaTable();
  const def = getDefaultIdentity(userId, 'meta');
  if (def) {
    return {
      user_id: userId,
      encrypted_access_token: def.encrypted_token,
      scopes_json: def.scopes_json,
      token_expires_at: def.token_expires_at,
      meta_user_id: def.provider_sub,
      meta_name: def.display_name,
      meta_email: def.email,
      updated_at: def.updated_at,
      data_identity_id: def.id,
    };
  }
  return getDb()
    .prepare(`SELECT * FROM admin_meta_tokens WHERE user_id = ?`)
    .get(userId);
}

function parseScopes(raw) {
  try {
    const s = JSON.parse(raw || '[]');
    return Array.isArray(s) ? s : [];
  } catch {
    return [];
  }
}

function isMetaCleared(userId) {
  ensureDataIdentitiesTable();
  const active = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM data_identities
       WHERE user_id = ? AND provider = 'meta' AND status = 'active'`
    )
    .get(userId).c;
  return active === 0;
}

function tokenReadable(encrypted) {
  if (!encrypted) return false;
  try {
    return Boolean(decrypt(encrypted));
  } catch {
    return false;
  }
}

function saveAdminMetaToken(
  userId,
  encryptedAccessToken,
  {
    scopesJson = '[]',
    expiresAt = null,
    metaUserId = null,
    metaName = null,
    metaEmail = null,
    mode = 'replace',
    identityId = null,
  } = {}
) {
  ensureAdminMetaTable();
  const sub = metaUserId || `meta-${userId}-${Date.now()}`;
  const identity = upsertIdentity({
    userId,
    provider: 'meta',
    providerSub: sub,
    email: metaEmail,
    displayName: metaName || metaEmail,
    encryptedToken: encryptedAccessToken,
    scopesJson,
    tokenExpiresAt: expiresAt,
    mode: mode === 'add' ? 'add' : identityId ? 'reconnect' : 'replace',
    identityId,
    makeDefault: mode !== 'add',
  });
  mirrorDefaultToAdminTable(userId);
  return {
    ...getAdminMetaToken(userId),
    data_identity_id: identity?.id || null,
  };
}

function clearAdminMetaToken(userId) {
  ensureAdminMetaTable();
  const ids = getDb()
    .prepare(
      `SELECT id FROM data_identities WHERE user_id = ? AND provider = 'meta'`
    )
    .all(userId);
  for (const row of ids) {
    clearIdentity(userId, row.id);
  }
  mirrorDefaultToAdminTable(userId);
}

function findMetaAccessToken(userId, identityId = null) {
  ensureDataIdentitiesTable();
  const row = getIdentityForUser(userId, identityId, 'meta');
  if (!row) return null;
  return {
    encrypted: row.encrypted_token,
    expiresAt: row.token_expires_at,
    metaUserId: row.provider_sub,
    metaName: row.display_name,
    metaEmail: row.email,
    scopesJson: row.scopes_json,
    updatedAt: row.updated_at,
    identityId: row.id,
  };
}

function getMetaAccessTokenPlain(userId, identityId = null) {
  const found = findMetaAccessToken(userId, identityId);
  if (!found) {
    const err = new Error(
      'Meta is not connected. Connect Meta under Integrations first.'
    );
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return decrypt(found.encrypted);
}

function agencyMetaStatus(userId) {
  ensureDataIdentitiesTable();
  const identities = listIdentities(userId, 'meta');
  if (!identities.length) {
    return {
      linked: false,
      cleared: true,
      name: null,
      email: null,
      updatedAt: null,
      identityId: null,
      identities,
    };
  }
  const def = getDefaultIdentity(userId, 'meta');
  const found = findMetaAccessToken(userId);
  return {
    linked: Boolean(found),
    cleared: false,
    name: found?.metaName || def?.display_name || null,
    email: found?.metaEmail || def?.email || null,
    updatedAt: found?.updatedAt || def?.updated_at || null,
    identityId: found?.identityId || def?.id || null,
    identities,
  };
}

module.exports = {
  ensureAdminMetaTable,
  getAdminMetaToken,
  saveAdminMetaToken,
  clearAdminMetaToken,
  findMetaAccessToken,
  getMetaAccessTokenPlain,
  agencyMetaStatus,
  tokenReadable,
  publicIdentity,
};
