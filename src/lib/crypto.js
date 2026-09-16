'use strict';

const crypto = require('crypto');

function keyBytes() {
  const raw = process.env.APP_ENCRYPTION_KEY || '';
  if (!raw || raw.length < 16) {
    throw new Error('APP_ENCRYPTION_KEY missing or too short');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const buf = Buffer.from(String(payload), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8'
    );
  } catch (e) {
    const err = new Error(
      'Stored Google token cannot be read (encryption key changed or data corrupt). Reconnect Google.'
    );
    err.code = 'NEEDS_REAUTH';
    err.cause = e;
    throw err;
  }
}

function authSecret() {
  const raw = process.env.AUTH_SECRET || '';
  if (!raw || raw.length < 16) {
    throw new Error('AUTH_SECRET missing or too short (min 16 chars)');
  }
  return raw;
}

function signState(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', authSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  let expected;
  try {
    expected = crypto
      .createHmac('sha256', authSecret())
      .update(body)
      .digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.exp || Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { encrypt, decrypt, signState, verifyState };
