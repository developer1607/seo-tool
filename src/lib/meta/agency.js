'use strict';

const { getDb } = require('../db');
const { decrypt } = require('../crypto');
const {
  ensureDataIdentitiesTable,
  getDefaultIdentity,
  getIdentityForUser,
  getIdentity,
  upsertIdentity,
  listIdentities,
  clearIdentity,
  publicIdentity,
  setDefaultIdentity,
  setIdentityNeedsReauth,
} = require('../identities/data');

const CLEARED = '["__cleared__"]';

function ensureAdminMetaTable() {
  const { tableExists } = require('../db');
  const db = getDb();
  if (!tableExists('admin_meta_tokens')) {
    db.exec(`
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
    `);
  }
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
  try {
    return decrypt(found.encrypted);
  } catch {
    if (found.identityId) setIdentityNeedsReauth(userId, found.identityId);
    const err = new Error(
      'Stored Meta token cannot be read. Reconnect Meta under Integrations.'
    );
    err.code = 'NEEDS_REAUTH';
    throw err;
  }
}

function agencyMetaStatus(userId) {
  ensureDataIdentitiesTable();
  const identities = listIdentities(userId, 'meta');
  const needsReauth = identities.some(
    (i) => i.status === 'needs_reauth' || (i.isDefault && !i.hasToken)
  );
  if (!identities.length) {
    return {
      linked: false,
      cleared: true,
      needsReauth: false,
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
    needsReauth,
    name: found?.metaName || def?.display_name || identities[0]?.displayName || null,
    email: found?.metaEmail || def?.email || identities[0]?.email || null,
    updatedAt: found?.updatedAt || def?.updated_at || identities[0]?.updatedAt || null,
    identityId: found?.identityId || def?.id || identities[0]?.id || null,
    identities,
  };
}

function listMetaDataIdentities(userId) {
  return listIdentities(userId, 'meta');
}

function setDefaultMetaIdentity(userId, identityId) {
  const existing = getIdentity(identityId);
  if (!existing || existing.user_id !== userId || existing.provider !== 'meta') {
    const err = new Error('Identity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const row = setDefaultIdentity(userId, identityId);
  mirrorDefaultToAdminTable(userId);
  return publicIdentity(row);
}

function disconnectMetaIdentity(userId, identityId) {
  const result = clearIdentity(userId, identityId);
  mirrorDefaultToAdminTable(userId);
  return result;
}

function markMetaIdentityNeedsReauth(userId, identityId) {
  if (!identityId) return null;
  return setIdentityNeedsReauth(userId, identityId);
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
  listMetaDataIdentities,
  setDefaultMetaIdentity,
  disconnectMetaIdentity,
  markMetaIdentityNeedsReauth,
};
