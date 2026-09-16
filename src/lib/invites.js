'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

function createInvite({ clientId, websiteId, email, userId, days = 14 }) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(
    Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  getDb()
    .prepare(
      `INSERT INTO client_invites (
         token, client_id, website_id, email, created_by_user_id, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      token,
      clientId,
      websiteId,
      String(email || '').trim().toLowerCase(),
      userId || null,
      expiresAt
    );
  return getInviteByToken(token);
}

function getInviteByToken(token) {
  if (!token) return null;
  return getDb()
    .prepare(`SELECT * FROM client_invites WHERE token = ?`)
    .get(String(token));
}

function inviteIsValid(row) {
  if (!row) return { ok: false, reason: 'Invite not found' };
  if (row.used_at) return { ok: false, reason: 'Invite already used' };
  if (row.expires_at && String(row.expires_at) < new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    return { ok: false, reason: 'Invite expired' };
  }
  return { ok: true };
}

function markInviteUsed(token) {
  getDb()
    .prepare(
      `UPDATE client_invites SET used_at = datetime('now') WHERE token = ?`
    )
    .run(token);
}

function inviteUrl(token) {
  const base = process.env.APP_URL || 'http://localhost:3000';
  return `${base}/invite/${token}`;
}

function mailtoForInvite({ email, clientName, url, adminName }) {
  const to = encodeURIComponent(email || '');
  const subject = encodeURIComponent(
    `Connect Google for ${clientName} (Webastral reporting)`
  );
  const body = encodeURIComponent(
    [
      `Hi,`,
      ``,
      `${adminName || 'Your agency'} needs read-only Google access for reporting on ${clientName}.`,
      ``,
      `Open this secure link and click Connect Google (GA4, Search Console, and Ads):`,
      url,
      ``,
      `You do not need to create an OAuth app or share passwords / client secrets.`,
      `The link expires; ask us for a new one if needed.`,
      ``,
      `Thanks`,
    ].join('\n')
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

module.exports = {
  createInvite,
  getInviteByToken,
  inviteIsValid,
  markInviteUsed,
  inviteUrl,
  mailtoForInvite,
};
