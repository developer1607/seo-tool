'use strict';

const { getDb } = require('../db');
const { decrypt } = require('../crypto');
const {
  getConnection,
  listConnections,
  GOOGLE_PROVIDERS,
  markSynced,
  setConnectionError,
  findGoogleTokenConnection,
} = require('../connections');
const { refreshAccessToken } = require('./oauth');
const { fetchGa4Daily, probeGa4 } = require('./ga4');
const { fetchGscDaily, probeGsc } = require('./gsc');
const { fetchAdsDaily, probeAds, normalizeCustomerId } = require('./ads');
const { resolvePreset } = require('../dates');
const { fetchMetaDaily, probeMetaAds } = require('../meta/ads');
const { getMetaAccessTokenPlain } = require('../meta/agency');

async function getAccessTokenForWebsite(websiteId, userId, provider = null) {
  const {
    listConnections,
    getConnection,
    isWebsiteLocalGoogle,
    GOOGLE_PROVIDERS,
  } = require('../connections');
  const googleRows = listConnections(websiteId).filter(
    (r) =>
      GOOGLE_PROVIDERS.includes(r.provider) &&
      !['DISCONNECTED', 'NOT_STARTED'].includes(r.status)
  );
  const localRow = googleRows.find(
    (r) => isWebsiteLocalGoogle(r) && r.encrypted_refresh_token
  );
  let encrypted = null;
  let providerForError =
    provider || googleRows[0]?.provider || 'GOOGLE_ANALYTICS';

  // Per-website Google login always uses its own refresh token.
  if (localRow?.encrypted_refresh_token) {
    encrypted = localRow.encrypted_refresh_token;
    providerForError = localRow.provider;
  } else if (userId) {
    const { findAnyGoogleEncryptedToken } = require('./agency');
    const providerRow = provider
      ? getConnection(websiteId, provider)
      : null;
    const identityId =
      providerRow?.data_identity_id ||
      googleRows.find((r) => r.data_identity_id)?.data_identity_id ||
      null;
    const found = findAnyGoogleEncryptedToken(userId, { identityId });
    if (found?.encrypted) {
      encrypted = found.encrypted;
    }
  }

  // Legacy agency-mode rows that still hold a cloned ciphertext.
  if (!encrypted) {
    const row = findGoogleTokenConnection(websiteId);
    encrypted = row?.encrypted_refresh_token || null;
    providerForError = row?.provider || providerForError;
  }

  if (!encrypted) {
    const err = new Error(
      'Google is not connected. Connect agency Google under Integrations → Google.'
    );
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  let refreshToken;
  try {
    refreshToken = decrypt(encrypted);
  } catch (e) {
    const { markWebsiteGoogleNeedsReauth } = require('./agency');
    markWebsiteGoogleNeedsReauth(
      websiteId,
      'Stored Google token cannot be read. Reconnect agency Google (check APP_ENCRYPTION_KEY).'
    );
    throw e;
  }
  try {
    const tokens = await refreshAccessToken(refreshToken);
    return tokens.access_token;
  } catch (e) {
    if (e.code === 'NEEDS_REAUTH') {
      const { markWebsiteGoogleNeedsReauth, findAnyGoogleEncryptedToken } = require('./agency');
      markWebsiteGoogleNeedsReauth(
        websiteId,
        e.message || 'Google access revoked.'
      );
      if (userId) {
        const { setIdentityNeedsReauth } = require('../identities/data');
        const providerRow = provider
          ? getConnection(websiteId, provider)
          : null;
        const identityId =
          providerRow?.data_identity_id ||
          googleRows.find((r) => r.data_identity_id)?.data_identity_id ||
          findAnyGoogleEncryptedToken(userId)?.identityId ||
          null;
        if (identityId) setIdentityNeedsReauth(userId, identityId);
      }
    }
    throw e;
  }
}

function upsertSnapshot(row) {
  getDb()
    .prepare(
      `INSERT INTO metric_snapshots (
         client_id, website_id, source, date,
         spend, impressions, clicks, ctr, avg_position, reach,
         sessions, users, engaged_sessions, engagement_rate,
         primary_conversions, primary_value, efficiency, efficiency_kind,
         payload_json, synced_at
       ) VALUES (
         @client_id, @website_id, @source, @date,
         @spend, @impressions, @clicks, @ctr, @avg_position, @reach,
         @sessions, @users, @engaged_sessions, @engagement_rate,
         @primary_conversions, @primary_value, @efficiency, @efficiency_kind,
         @payload_json, datetime('now')
       )
       ON CONFLICT(website_id, source, date) DO UPDATE SET
         spend = excluded.spend,
         impressions = excluded.impressions,
         clicks = excluded.clicks,
         ctr = excluded.ctr,
         avg_position = excluded.avg_position,
         reach = excluded.reach,
         sessions = excluded.sessions,
         users = excluded.users,
         engaged_sessions = excluded.engaged_sessions,
         engagement_rate = excluded.engagement_rate,
         primary_conversions = excluded.primary_conversions,
         primary_value = excluded.primary_value,
         efficiency = excluded.efficiency,
         efficiency_kind = excluded.efficiency_kind,
         payload_json = excluded.payload_json,
         synced_at = datetime('now')`
    )
    .run(row);
}

async function syncGa4(websiteId, { from, to } = {}) {
  const conn = getConnection(websiteId, 'GOOGLE_ANALYTICS');
  if (!conn || conn.status !== 'ACTIVE' || !conn.external_account_id) {
    throw new Error('GA4 connection is not active');
  }
  const range = from && to ? { from, to } : resolvePreset('last_30');
  const accessToken = await getAccessTokenForWebsite(
    websiteId,
    conn.connected_by_user_id,
    'GOOGLE_ANALYTICS'
  );
  try {
    const rows = await fetchGa4Daily(
      accessToken,
      conn.external_account_id,
      range.from,
      range.to
    );
    for (const r of rows) {
      upsertSnapshot({
        client_id: conn.client_id,
        website_id: websiteId,
        source: 'GOOGLE_ANALYTICS',
        date: r.date,
        spend: null,
        impressions: null,
        clicks: null,
        ctr: null,
        avg_position: null,
        reach: null,
        sessions: r.sessions,
        users: r.users,
        engaged_sessions: r.engaged_sessions,
        engagement_rate: r.engagement_rate,
        primary_conversions: r.primary_conversions,
        primary_value: null,
        efficiency: null,
        efficiency_kind: 'NONE',
        payload_json: '{}',
      });
    }
    markSynced(websiteId, 'GOOGLE_ANALYTICS');
    return { ok: true, days: rows.length, from: range.from, to: range.to };
  } catch (e) {
    const status = e.code === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
    setConnectionError(websiteId, 'GOOGLE_ANALYTICS', e.message, status);
    throw e;
  }
}

async function syncGsc(websiteId, { from, to } = {}) {
  const conn = getConnection(websiteId, 'GOOGLE_SEARCH_CONSOLE');
  if (!conn || conn.status !== 'ACTIVE' || !conn.external_account_id) {
    throw new Error('Search Console connection is not active');
  }
  const range = from && to ? { from, to } : resolvePreset('last_30');
  const accessToken = await getAccessTokenForWebsite(
    websiteId,
    conn.connected_by_user_id,
    'GOOGLE_SEARCH_CONSOLE'
  );
  try {
    let trackedQueries = [];
    try {
      const { listCustomQueries } = require('./trackedKeywords');
      trackedQueries = listCustomQueries(websiteId);
    } catch {
      trackedQueries = [];
    }
    const rows = await fetchGscDaily(
      accessToken,
      conn.external_account_id,
      range.from,
      range.to,
      { trackedQueries }
    );
    for (const r of rows) {
      upsertSnapshot({
        client_id: conn.client_id,
        website_id: websiteId,
        source: 'GOOGLE_SEARCH_CONSOLE',
        date: r.date,
        spend: null,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        avg_position: r.avg_position,
        reach: null,
        sessions: null,
        users: null,
        engaged_sessions: null,
        engagement_rate: null,
        primary_conversions: null,
        primary_value: null,
        efficiency: null,
        efficiency_kind: 'NONE',
        payload_json: JSON.stringify({
          top_queries: r.top_queries || [],
          data_state: 'final',
        }),
      });
    }
    markSynced(websiteId, 'GOOGLE_SEARCH_CONSOLE');
    return { ok: true, days: rows.length, from: range.from, to: range.to };
  } catch (e) {
    const status = e.code === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
    setConnectionError(websiteId, 'GOOGLE_SEARCH_CONSOLE', e.message, status);
    throw e;
  }
}

async function syncGoogleAds(websiteId, { from, to } = {}) {
  const conn = getConnection(websiteId, 'GOOGLE_ADS');
  if (!conn || conn.status !== 'ACTIVE' || !conn.external_account_id) {
    throw new Error('Google Ads connection is not active');
  }
  const range = from && to ? { from, to } : resolvePreset('last_30');
  const accessToken = await getAccessTokenForWebsite(
    websiteId,
    conn.connected_by_user_id,
    'GOOGLE_ADS'
  );
  const loginCustomerId =
    normalizeCustomerId(conn.login_customer_id) ||
    normalizeCustomerId(conn.external_account_id);
  try {
    const rows = await fetchAdsDaily(
      accessToken,
      conn.external_account_id,
      loginCustomerId,
      range.from,
      range.to
    );
    for (const r of rows) {
      upsertSnapshot({
        client_id: conn.client_id,
        website_id: websiteId,
        source: 'GOOGLE_ADS',
        date: r.date,
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        avg_position: null,
        reach: null,
        sessions: null,
        users: null,
        engaged_sessions: null,
        engagement_rate: null,
        primary_conversions: r.primary_conversions,
        primary_value: r.primary_value,
        efficiency: r.efficiency,
        efficiency_kind: r.efficiency_kind,
        payload_json: '{}',
      });
    }
    markSynced(websiteId, 'GOOGLE_ADS');
    return { ok: true, days: rows.length, from: range.from, to: range.to };
  } catch (e) {
    const status = e.code === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
    setConnectionError(websiteId, 'GOOGLE_ADS', e.message, status);
    throw e;
  }
}

async function syncMetaAds(websiteId, { from, to, preset } = {}) {
  const conn = getConnection(websiteId, 'META_ADS');
  if (!conn || conn.status !== 'ACTIVE' || !conn.external_account_id) {
    throw new Error('Meta Ads connection is not active');
  }
  // Meta often has sparse recent days — default backfill 90d (import uses 365).
  const range =
    from && to ? { from, to } : resolvePreset(preset || 'last_90');
  const userId = conn.connected_by_user_id;
  if (!userId) {
    throw new Error('Meta connection has no owner — reconnect Meta');
  }
  const accessToken = getMetaAccessTokenPlain(
    userId,
    conn.data_identity_id || null
  );
  try {
    const rows = await fetchMetaDaily(
      accessToken,
      conn.external_account_id,
      range.from,
      range.to
    );
    for (const r of rows) {
      upsertSnapshot({
        client_id: conn.client_id,
        website_id: websiteId,
        source: 'META_ADS',
        date: r.date,
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        avg_position: null,
        reach: r.reach,
        sessions: null,
        users: null,
        engaged_sessions: null,
        engagement_rate: null,
        primary_conversions: r.primary_conversions,
        primary_value: null,
        efficiency: null,
        efficiency_kind: 'NONE',
        payload_json: JSON.stringify({
          ...(r.payload || {}),
          cpc: r.cpc,
          cpm: r.cpm,
        }),
      });
    }
    markSynced(websiteId, 'META_ADS');
    return { ok: true, days: rows.length, from: range.from, to: range.to };
  } catch (e) {
    const status = e.code === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
    setConnectionError(websiteId, 'META_ADS', e.message, status);
    throw e;
  }
}

const syncInflight = new Map();

async function probeAndActivate(websiteId, provider, accessToken) {
  const conn = getConnection(websiteId, provider);
  if (!conn?.external_account_id) {
    throw new Error('Select an account first');
  }
  if (provider === 'GOOGLE_ANALYTICS') {
    await probeGa4(accessToken, conn.external_account_id);
  } else if (provider === 'GOOGLE_SEARCH_CONSOLE') {
    await probeGsc(accessToken, conn.external_account_id);
  } else if (provider === 'GOOGLE_ADS') {
    await probeAds(
      accessToken,
      conn.external_account_id,
      conn.login_customer_id || conn.external_account_id
    );
  } else if (provider === 'META_ADS') {
    await probeMetaAds(accessToken, conn.external_account_id);
  } else {
    throw new Error('Unsupported provider');
  }
  const { markVerified } = require('../connections');
  return markVerified(websiteId, provider);
}

async function syncProvider(websiteId, provider, opts = {}) {
  const key = `${websiteId}:${provider}`;
  const existing = syncInflight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    if (provider === 'GOOGLE_ANALYTICS') return syncGa4(websiteId, opts);
    if (provider === 'GOOGLE_SEARCH_CONSOLE') return syncGsc(websiteId, opts);
    if (provider === 'GOOGLE_ADS') return syncGoogleAds(websiteId, opts);
    if (provider === 'META_ADS') return syncMetaAds(websiteId, opts);
    throw new Error('Sync not implemented for this provider');
  })().finally(() => {
    syncInflight.delete(key);
  });
  syncInflight.set(key, pending);
  return pending;
}

async function syncAvailableGoogleProviders(websiteId, opts = {}) {
  const connections = listConnections(websiteId).filter(
    (conn) =>
      GOOGLE_PROVIDERS.includes(conn.provider) &&
      conn.status === 'ACTIVE' &&
      conn.external_account_id
  );
  const synced = [];
  const failed = [];

  for (const conn of connections) {
    try {
      const result = await syncProvider(websiteId, conn.provider, opts);
      synced.push({
        provider: conn.provider,
        days: result.days,
        from: result.from,
        to: result.to,
      });
    } catch (e) {
      failed.push({
        provider: conn.provider,
        error: e.message || 'Sync failed',
        code: e.code || null,
      });
    }
  }

  return {
    ok: failed.length === 0,
    synced,
    failed,
  };
}

module.exports = {
  getAccessTokenForWebsite,
  syncGa4,
  syncGsc,
  syncGoogleAds,
  syncMetaAds,
  syncProvider,
  syncAvailableGoogleProviders,
  probeAndActivate,
};
