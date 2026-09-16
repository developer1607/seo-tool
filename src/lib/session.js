'use strict';

const crypto = require('crypto');

const COOKIE = 'webastral_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET must be set (16+ chars)');
  }
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function setSession(
  res,
  { userId, role, selectedClientId = null, selectedWebsiteId = null }
) {
  const token = sign({
    userId,
    role,
    selectedClientId: selectedClientId || null,
    selectedWebsiteId: selectedWebsiteId || null,
    exp: Date.now() + MAX_AGE_MS,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readSession(req) {
  return verify(req.cookies?.[COOKIE]);
}

module.exports = { setSession, clearSession, readSession, COOKIE };
