'use strict';

/**
 * Simple in-memory sliding-window rate limit (single API process).
 * Enough for admin login abuse protection on one host.
 */

const buckets = new Map();

function clientKey(req, suffix = '') {
  const ip =
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  return `${ip}|${suffix}`;
}

/**
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
function take(key, { limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { windowStart: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((entry.windowStart + windowMs - now) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

/** Express helper: rate-limit by IP (+ optional suffix). */
function rateLimitMiddleware({
  limit = 10,
  windowMs = 15 * 60 * 1000,
  suffix = 'login',
  message = 'Too many attempts. Try again later.',
} = {}) {
  return (req, res, next) => {
    const result = take(clientKey(req, suffix), { limit, windowMs });
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retry_after_sec: result.retryAfterSec,
      });
    }
    next();
  };
}

module.exports = {
  take,
  clientKey,
  rateLimitMiddleware,
};
