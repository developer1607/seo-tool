'use strict';

const { getDb } = require('../db');
const { decrypt } = require('../crypto');
const { refreshAccessToken } = require('./oauth');
const {
  ensureDataIdentitiesTable,
  getDefaultIdentity,
  getIdentityForUser,
  upsertIdentity,
  listIdentities,
  clearIdentity,
  setDefaultIdentity,
  publicIdentity,
} = require('../identities/data');

const CLEARED_SCOPES = '["__cleared__"]';

function ensureAdminGoogleTable() {
  const { tableExists, hasColumn } = require('../db');
  const db = getDb();
  if (!tableExists('admin_google_tokens')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_google_tokens (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        encrypted_refresh_token TEXT NOT NULL,
        scopes_json TEXT NOT NULL DEFAULT '[]',
        google_email TEXT,
        google_sub TEXT,
        updated_at TEXT NOT NULL DEFAULT (NOW()::text)
      );
    `);
  }
  if (!hasColumn('admin_google_tokens', 'google_email')) {
    db.exec(
      `ALTER TABLE admin_google_tokens ADD COLUMN IF NOT EXISTS google_email TEXT`
    );
  }
  if (!hasColumn('admin_google_tokens', 'google_sub')) {
    db.exec(
      `ALTER TABLE admin_google_tokens ADD COLUMN IF NOT EXISTS google_sub TEXT`
    );
  }
  ensureDataIdentitiesTable();
}

function parseScopesJson(raw) {
  try {
    const scopes = JSON.parse(raw || '[]');
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

function scopesAreUsable(raw) {
  const scopes = parseScopesJson(raw);
  if (!scopes.length) return false;
  if (scopes.includes('__cleared__')) return false;
  return scopes.some((s) => String(s).includes('googleapis.com'));
}

function normalizeScopesJson(scopesJson, fallbackJson) {
  if (scopesAreUsable(scopesJson)) {
    return typeof scopesJson === 'string'
      ? scopesJson
      : JSON.stringify(scopesJson);
  }
  if (scopesAreUsable(fallbackJson)) return fallbackJson;
  return '[]';
}

function mirrorDefaultToAdminTable(userId) {
  ensureAdminGoogleTable();
  const def = getDefaultIdentity(userId, 'google');
  if (!def) {
    getDb()
      .prepare(
        `INSERT INTO admin_google_tokens (
           user_id, encrypted_refresh_token, scopes_json,
           google_email, google_sub, updated_at
         ) VALUES (?, '', ?, NULL, NULL, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           encrypted_refresh_token = '',
           scopes_json = excluded.scopes_json,
           google_email = NULL,
           google_sub = NULL,
           updated_at = datetime('now')`
      )
      .run(userId, CLEARED_SCOPES);
    return null;
  }
  getDb()
    .prepare(
      `INSERT INTO admin_google_tokens (
         user_id, encrypted_refresh_token, scopes_json,
         google_email, google_sub, updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         scopes_json = excluded.scopes_json,
         google_email = excluded.google_email,
         google_sub = excluded.google_sub,
         updated_at = datetime('now')`
    )
    .run(
      userId,
      def.encrypted_token,
      def.scopes_json,
      def.email,
      def.provider_sub
    );
  return def;
}

function getAdminGoogleToken(userId) {
  ensureAdminGoogleTable();
  const def = getDefaultIdentity(userId, 'google');
  if (def) {
    return {
      user_id: userId,
      encrypted_refresh_token: def.encrypted_token,
      scopes_json: def.scopes_json,
      google_email: def.email,
      google_sub: def.provider_sub,
      updated_at: def.updated_at,
      data_identity_id: def.id,
    };
  }
  return getDb()
    .prepare(`SELECT * FROM admin_google_tokens WHERE user_id = ?`)
    .get(userId);
}

function isAgencyCleared(userId) {
  ensureDataIdentitiesTable();
  const active = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM data_identities
       WHERE user_id = ? AND provider = 'google' AND status = 'active'`
    )
    .get(userId).c;
  return active === 0;
}

function saveAdminGoogleToken(
  userId,
  encryptedRefreshToken,
  scopesJson,
  {
    googleEmail = undefined,
    googleSub = undefined,
    mode = 'replace',
    identityId = null,
  } = {}
) {
  ensureAdminGoogleTable();
  const existing = getAdminGoogleToken(userId);
  const scopes = normalizeScopesJson(scopesJson, existing?.scopes_json);
  const email =
    googleEmail !== undefined ? googleEmail : existing?.google_email || null;
  const sub =
    googleSub !== undefined
      ? googleSub
      : existing?.google_sub || `google-${userId}-${Date.now()}`;

  const identity = upsertIdentity({
    userId,
    provider: 'google',
    providerSub: sub,
    email,
    displayName: email,
    encryptedToken: encryptedRefreshToken,
    scopesJson: scopes,
    mode: mode === 'add' ? 'add' : identityId ? 'reconnect' : 'replace',
    identityId,
    makeDefault: mode !== 'add',
  });
  mirrorDefaultToAdminTable(userId);
  return {
    ...getAdminGoogleToken(userId),
    data_identity_id: identity?.id || null,
  };
}

function touchAdminGoogleToken(userId, encryptedRefreshToken) {
  const existing = getAdminGoogleToken(userId);
  return saveAdminGoogleToken(
    userId,
    encryptedRefreshToken,
    existing?.scopes_json,
    {
      googleEmail: existing?.google_email,
      googleSub: existing?.google_sub,
      mode: 'replace',
    }
  );
}

function clearAdminGoogleToken(userId) {
  ensureAdminGoogleTable();
  const ids = getDb()
    .prepare(
      `SELECT id FROM data_identities WHERE user_id = ? AND provider = 'google'`
    )
    .all(userId);
  for (const row of ids) {
    clearIdentity(userId, row.id);
  }
  mirrorDefaultToAdminTable(userId);
}

function tokenIsReadable(encrypted) {
  if (!encrypted) return false;
  try {
    return Boolean(decrypt(encrypted));
  } catch {
    return false;
  }
}

function markCorruptGoogleTokens() {
  getDb()
    .prepare(
      `UPDATE connections
       SET status = 'NEEDS_REAUTH',
           last_error = 'Stored Google token cannot be read. Reconnect Google.',
           updated_at = datetime('now')
       WHERE encrypted_refresh_token IS NOT NULL
         AND length(encrypted_refresh_token) > 0
         AND provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ADS')
         AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
    )
    .run();
}

function markWebsiteGoogleNeedsReauth(websiteId, message) {
  getDb()
    .prepare(
      `UPDATE connections
       SET status = 'NEEDS_REAUTH',
           last_error = ?,
           updated_at = datetime('now')
       WHERE website_id = ?
         AND provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ADS')
         AND status NOT IN ('DISCONNECTED', 'NOT_STARTED')`
    )
    .run(
      message || 'Stored Google token cannot be read. Reconnect Google.',
      websiteId
    );
}

function identityToFound(row) {
  if (!row) return null;
  return {
    encrypted: row.encrypted_token,
    source: 'admin',
    updatedAt: row.updated_at,
    scopesJson: row.scopes_json,
    googleEmail: row.email || null,
    googleSub: row.provider_sub || null,
    identityId: row.id,
  };
}

function findAnyGoogleEncryptedToken(
  userId,
  { promote: _promote = false, identityId = null } = {}
) {
  ensureDataIdentitiesTable();
  const row = getIdentityForUser(userId, identityId, 'google');
  return identityToFound(row);
}

function peekAgencyGoogleToken(userId) {
  return findAnyGoogleEncryptedToken(userId, { promote: false });
}

async function getAccessTokenForDiscover(userId, identityId = null) {
  const found = findAnyGoogleEncryptedToken(userId, { identityId });
  if (!found) {
    const err = new Error(
      'No agency Google login stored yet. Click Connect Google once — it is saved for inventory Sync.'
    );
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  const refreshToken = decrypt(found.encrypted);
  try {
    const tokens = await refreshAccessToken(refreshToken);
    return {
      accessToken: tokens.access_token,
      source: found.source,
      encrypted: found.encrypted,
      updatedAt: found.updatedAt || null,
      googleEmail: found.googleEmail || null,
      googleSub: found.googleSub || null,
      identityId: found.identityId || null,
    };
  } catch (e) {
    if (e.code === 'NEEDS_REAUTH') {
      if (found.identityId) {
        const { setIdentityNeedsReauth } = require('../identities/data');
        setIdentityNeedsReauth(userId, found.identityId);
      }
      const err = new Error(
        e.message ||
          'Google rejected the saved login. Reconnect that Google account.'
      );
      err.code = 'NEEDS_REAUTH';
      throw err;
    }
    throw e;
  }
}

function healGoogleWebsiteTokens(
  encryptedRefreshToken,
  userId,
  scopesJson,
  identityId = null
) {
  if (!userId) return 0;
  const identity = getIdentityForUser(userId, identityId, 'google');
  if (!identity?.encrypted_token && !encryptedRefreshToken) return 0;
  const scopes = normalizeScopesJson(scopesJson, identity?.scopes_json);
  const {
    isWebsiteLocalGoogle,
    googleAuthConfigJson,
  } = require('../connections');
  const rows = getDb()
    .prepare(
      `SELECT id, config_json, connected_by_user_id, data_identity_id FROM connections
       WHERE provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ADS')
         AND status IN ('NEEDS_REAUTH', 'ERROR', 'ACTIVE', 'PENDING_SELECT', 'PENDING_AUTH')
         AND (connected_by_user_id IS NULL OR connected_by_user_id = ?)
         AND (data_identity_id IS NULL OR data_identity_id = ?)`
    )
    .all(userId, identity?.id || -1);

  let changes = 0;
  const agencyCfg = googleAuthConfigJson('agency');
  const upd = getDb().prepare(
    `UPDATE connections
     SET connected_by_user_id = COALESCE(?, connected_by_user_id),
         data_identity_id = COALESCE(?, data_identity_id),
         scopes_json = CASE WHEN ? != '[]' THEN ? ELSE scopes_json END,
         config_json = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  );
  for (const row of rows) {
    if (isWebsiteLocalGoogle(row)) continue;
    upd.run(userId, identity?.id || null, scopes, scopes, agencyCfg, row.id);
    changes += 1;
  }
  return changes;
}

function applyAgencyGoogleToWebsite(websiteId, userId, identityId = null) {
  const { getWebsite } = require('../websites');
  const {
    GOOGLE_PROVIDERS,
    getConnection,
    upsertConnection,
    isWebsiteLocalGoogle,
    googleAuthConfigJson,
  } = require('../connections');

  const identity = getIdentityForUser(userId, identityId, 'google');
  const found = identityToFound(identity);
  if (!found?.encrypted) {
    return { agencyLinked: false, seeded: 0 };
  }
  const site = getWebsite(websiteId);
  if (!site) return { agencyLinked: true, seeded: 0 };

  const scopesJson = normalizeScopesJson(
    found.scopesJson,
    identity.scopes_json
  );
  let seeded = 0;

  for (const provider of GOOGLE_PROVIDERS) {
    const cur = getConnection(websiteId, provider);
    if (cur && isWebsiteLocalGoogle(cur)) {
      continue;
    }
    if (!cur) {
      upsertConnection({
        clientId: site.client_id,
        websiteId,
        provider,
        status: 'PENDING_SELECT',
        scopesJson,
        configJson: googleAuthConfigJson('agency'),
        connectedByUserId: userId,
        dataIdentityId: identity.id,
        lastError: null,
      });
      seeded += 1;
      continue;
    }

    let nextStatus = cur.status;
    if (['NOT_STARTED', 'DISCONNECTED', 'PENDING_AUTH'].includes(cur.status)) {
      nextStatus = 'PENDING_SELECT';
    } else if (['NEEDS_REAUTH', 'ERROR'].includes(cur.status)) {
      nextStatus = cur.status;
    } else if (!cur.external_account_id && cur.status !== 'ACTIVE') {
      nextStatus = 'PENDING_SELECT';
    }

    const clearError = !['NEEDS_REAUTH', 'ERROR'].includes(cur.status);

    upsertConnection({
      clientId: site.client_id,
      websiteId,
      provider,
      status: nextStatus,
      scopesJson,
      configJson: googleAuthConfigJson('agency'),
      connectedByUserId: userId,
      dataIdentityId: cur.data_identity_id || identity.id,
      lastError: clearError ? null : cur.last_error,
    });
    seeded += 1;
  }

  return {
    agencyLinked: true,
    seeded,
    source: found.source,
    identityId: identity.id,
  };
}

function agencyGoogleStatus(userId) {
  ensureDataIdentitiesTable();
  const identities = listIdentities(userId, 'google');
  const def = getDefaultIdentity(userId, 'google');
  const needsReauth = identities.some(
    (i) => i.status === 'needs_reauth' || (i.isDefault && !i.hasToken)
  );
  if (!def) {
    return {
      linked: false,
      source: null,
      updatedAt: null,
      hasAdsScope: false,
      cleared: identities.length === 0,
      needsReauth: needsReauth || identities.some((i) => i.status === 'needs_reauth'),
      email: identities[0]?.email || null,
      sub: identities[0]?.sub || null,
      identityId: identities[0]?.id || null,
      identities,
    };
  }
  const scopes = parseScopesJson(def.scopes_json);
  const defNeedsReauth =
    def.status === 'needs_reauth' ||
    identities.some((i) => i.status === 'needs_reauth');
  return {
    linked: true,
    source: 'admin',
    updatedAt: def.updated_at,
    hasAdsScope: scopes.some((s) => String(s).includes('adwords')),
    cleared: false,
    needsReauth: defNeedsReauth,
    email: def.email || null,
    sub: def.provider_sub || null,
    identityId: def.id,
    identities,
  };
}

function listGoogleDataIdentities(userId) {
  return listIdentities(userId, 'google');
}

function setDefaultGoogleIdentity(userId, identityId) {
  const row = setDefaultIdentity(userId, identityId);
  mirrorDefaultToAdminTable(userId);
  return publicIdentity(row);
}

function disconnectGoogleIdentity(userId, identityId) {
  const result = clearIdentity(userId, identityId);
  mirrorDefaultToAdminTable(userId);
  return result;
}

module.exports = {
  ensureAdminGoogleTable,
  getAdminGoogleToken,
  saveAdminGoogleToken,
  touchAdminGoogleToken,
  clearAdminGoogleToken,
  findAnyGoogleEncryptedToken,
  peekAgencyGoogleToken,
  getAccessTokenForDiscover,
  healGoogleWebsiteTokens,
  applyAgencyGoogleToWebsite,
  agencyGoogleStatus,
  markCorruptGoogleTokens,
  markWebsiteGoogleNeedsReauth,
  scopesAreUsable,
  normalizeScopesJson,
  tokenIsReadable,
  listGoogleDataIdentities,
  setDefaultGoogleIdentity,
  disconnectGoogleIdentity,
  getIdentityForUser,
};
