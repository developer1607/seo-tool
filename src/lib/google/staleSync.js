'use strict';

const { getConnection, GOOGLE_PROVIDERS } = require('../connections');
const { syncProvider } = require('./sync');
const { metaConfigured } = require('../meta/oauth');

const STALE_AFTER_HOURS = 6;
const STALE_AFTER_MS = STALE_AFTER_HOURS * 60 * 60 * 1000;
const DEFAULT_PROVIDERS = [...GOOGLE_PROVIDERS, 'META_ADS'];

function lastSyncMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  let t = Date.parse(normalized);
  if (Number.isFinite(t)) return t;
  t = Date.parse(`${normalized}Z`);
  return Number.isFinite(t) ? t : null;
}

function isStale(lastSyncAt, now = Date.now()) {
  const t = lastSyncMs(lastSyncAt);
  if (t == null) return true;
  return now - t >= STALE_AFTER_MS;
}

function classifyProvider(websiteId, provider) {
  if (provider === 'META_ADS' && !metaConfigured()) {
    return { action: 'skip', reason: 'meta_unconfigured' };
  }
  const conn = getConnection(websiteId, provider);
  if (!conn) return { action: 'skip', reason: 'missing' };
  if (conn.status !== 'ACTIVE') {
    return { action: 'skip', reason: String(conn.status).toLowerCase() };
  }
  if (!isStale(conn.last_sync_at)) {
    return { action: 'fresh', last_sync_at: conn.last_sync_at };
  }
  return { action: 'sync', last_sync_at: conn.last_sync_at };
}

async function syncStaleProviders(
  websiteId,
  { providers, dryRun = false } = {}
) {
  const wanted =
    providers && providers.length ? providers : DEFAULT_PROVIDERS;
  const synced = [];
  const skipped = [];
  const failed = [];
  const fresh = [];
  const wouldSync = [];

  for (const provider of wanted) {
    const cls = classifyProvider(websiteId, provider);
    if (cls.action === 'skip') {
      skipped.push({ provider, reason: cls.reason });
      continue;
    }
    if (cls.action === 'fresh') {
      fresh.push({ provider, last_sync_at: cls.last_sync_at });
      continue;
    }
    if (dryRun) {
      wouldSync.push({
        provider,
        last_sync_at: cls.last_sync_at || null,
      });
      continue;
    }

    try {
      const result = await syncProvider(websiteId, provider);
      synced.push({
        provider,
        days: result.days,
        from: result.from,
        to: result.to,
      });
    } catch (e) {
      const msg = e.message || 'Sync failed';
      const reason =
        e.code === 'NEEDS_REAUTH' ||
        /expired|revoked|reauth|reconnect/i.test(msg)
          ? 'needs_reauth'
          : 'error';
      failed.push({
        provider,
        error: msg,
        reason,
        code: e.code || null,
      });
    }
  }

  const out = { synced, skipped, failed, fresh };
  if (dryRun) out.would_sync = wouldSync;
  return out;
}

module.exports = {
  STALE_AFTER_HOURS,
  STALE_AFTER_MS,
  lastSyncMs,
  isStale,
  syncStaleProviders,
};
