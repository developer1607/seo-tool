'use strict';

const { getDb } = require('../db');

function ensureAuthIdentitiesTable() {
  const db = getDb();
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_auth_identities_user
      ON auth_identities(user_id);
  `);
}

function getGoogleLoginIdentity(userId) {
  ensureAuthIdentitiesTable();
  return getDb()
    .prepare(
      `SELECT * FROM auth_identities
       WHERE user_id = ? AND provider = 'google'
       LIMIT 1`
    )
    .get(userId);
}

function findUserByGoogleSub(sub) {
  if (!sub) return null;
  ensureAuthIdentitiesTable();
  return getDb()
    .prepare(
      `SELECT u.* FROM auth_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'google' AND i.provider_sub = ?
         AND u.role = 'ADMIN'
       LIMIT 1`
    )
    .get(String(sub));
}

function findAdminByEmail(email) {
  if (!email) return null;
  return getDb()
    .prepare(
      `SELECT * FROM users WHERE email = ? AND role = 'ADMIN' LIMIT 1`
    )
    .get(String(email).trim().toLowerCase());
}

/**
 * Link Google OIDC to an admin. Existing admin email must match (no open signup).
 * Returns { user, linked } or throws Error with code.
 */
function linkGoogleLoginIdentity({ sub, email, name }) {
  ensureAuthIdentitiesTable();
  const providerSub = sub ? String(sub) : '';
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  if (!providerSub) {
    const err = new Error('Google did not return a stable user id.');
    err.code = 'NO_SUB';
    throw err;
  }
  if (!normalizedEmail) {
    const err = new Error('Google did not return a verified email.');
    err.code = 'NO_EMAIL';
    throw err;
  }

  const bySub = findUserByGoogleSub(providerSub);
  if (bySub) {
    getDb()
      .prepare(
        `UPDATE auth_identities
         SET email = ?, updated_at = datetime('now')
         WHERE provider = 'google' AND provider_sub = ?`
      )
      .run(normalizedEmail, providerSub);
    return { user: bySub, linked: true };
  }

  const byEmail = findAdminByEmail(normalizedEmail);
  if (!byEmail) {
    const err = new Error(
      'No Webastral admin matches this Gmail. Sign in with email/password first, or ask an admin to create your account.'
    );
    err.code = 'NO_ADMIN';
    throw err;
  }

  const existingOther = getDb()
    .prepare(
      `SELECT * FROM auth_identities
       WHERE provider = 'google' AND user_id = ?`
    )
    .get(byEmail.id);
  if (existingOther && existingOther.provider_sub !== providerSub) {
    const err = new Error(
      'This admin already has a different Google login linked. Unlink it in Settings first.'
    );
    err.code = 'ALREADY_LINKED';
    throw err;
  }

  getDb()
    .prepare(
      `INSERT INTO auth_identities (user_id, provider, provider_sub, email, updated_at)
       VALUES (?, 'google', ?, ?, datetime('now'))
       ON CONFLICT(provider, provider_sub) DO UPDATE SET
         user_id = excluded.user_id,
         email = excluded.email,
         updated_at = datetime('now')`
    )
    .run(byEmail.id, providerSub, normalizedEmail);

  if (name && !byEmail.name) {
    getDb()
      .prepare(
        `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(String(name), byEmail.id);
  }

  return { user: findAdminByEmail(normalizedEmail) || byEmail, linked: true };
}

function unlinkGoogleLogin(userId) {
  ensureAuthIdentitiesTable();
  getDb()
    .prepare(
      `DELETE FROM auth_identities WHERE user_id = ? AND provider = 'google'`
    )
    .run(userId);
}

function googleLoginStatus(userId) {
  const row = getGoogleLoginIdentity(userId);
  return {
    linked: Boolean(row),
    email: row?.email || null,
    sub: row?.provider_sub || null,
  };
}

module.exports = {
  ensureAuthIdentitiesTable,
  getGoogleLoginIdentity,
  findUserByGoogleSub,
  findAdminByEmail,
  linkGoogleLoginIdentity,
  unlinkGoogleLogin,
  googleLoginStatus,
};
