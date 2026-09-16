'use strict';

const { getDb } = require('./db');

function listClients() {
  return getDb()
    .prepare(`SELECT * FROM clients ORDER BY name COLLATE NOCASE`)
    .all();
}

function getClient(id) {
  return getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
}

function connectionMap(websiteId) {
  const rows = getDb()
    .prepare(`SELECT * FROM connections WHERE website_id = ?`)
    .all(websiteId);
  return Object.fromEntries(rows.map((r) => [r.provider, r]));
}

function emptyKpis() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    sessions: 0,
    users: 0,
    primary_conversions: 0,
    organic_clicks: 0,
    avg_position: null,
    range_label: '',
  };
}

function sumField(rows, field) {
  return rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
}

function snapshotsInRange(websiteId, from, to) {
  return getDb()
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE website_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`
    )
    .all(websiteId, from, to);
}

function buildKpis(websiteId, from, to) {
  const rows = snapshotsInRange(websiteId, from, to);
  const gsc = rows.filter((r) => r.source === 'GOOGLE_SEARCH_CONSOLE');
  const ga4 = rows.filter((r) => r.source === 'GOOGLE_ANALYTICS');
  const meta = rows.filter((r) => r.source === 'META_ADS');
  const ads = rows.filter((r) => r.source === 'GOOGLE_ADS');
  const kpis = emptyKpis();
  kpis.organic_clicks = sumField(gsc, 'clicks');
  kpis.sessions = sumField(ga4, 'sessions');
  kpis.users = sumField(ga4, 'users');
  kpis.spend = sumField(meta, 'spend') + sumField(ads, 'spend');
  kpis.impressions =
    sumField(gsc, 'impressions') + sumField(meta, 'impressions') + sumField(ads, 'impressions');
  kpis.clicks = sumField(gsc, 'clicks') + sumField(meta, 'clicks') + sumField(ads, 'clicks');
  kpis.primary_conversions =
    sumField(ga4, 'primary_conversions') +
    sumField(meta, 'primary_conversions') +
    sumField(ads, 'primary_conversions');
  const imp = sumField(gsc, 'impressions');
  if (imp > 0) {
    kpis.avg_position =
      gsc.reduce(
        (n, r) => n + (Number(r.avg_position) || 0) * (Number(r.impressions) || 0),
        0
      ) / imp;
  }
  kpis.range_label = `${from} → ${to}`;
  return { kpis, bySource: { gsc, ga4, meta, ads } };
}

function platformStatus(websiteId, opts = {}) {
  const map = connectionMap(websiteId);
  const googleReady = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  const adsReady = googleReady;
  const agencyLinked = Boolean(opts.agencyLinked);
  const metaLinked = Boolean(opts.metaLinked);
  const metaReady = Boolean(
    process.env.META_APP_ID && process.env.META_APP_SECRET
  );
  const keys = [
    { key: 'GOOGLE_ADS', label: 'Google Ads', phase: 0, adsOnly: true },
    { key: 'META_ADS', label: 'Meta Ads', phase: 0 },
    { key: 'GOOGLE_ANALYTICS', label: 'GA4', phase: 0 },
    { key: 'GOOGLE_SEARCH_CONSOLE', label: 'Search Console', phase: 0 },
  ];
  return keys.map((k) => {
    const c = map[k.key];
    if (k.key === 'GOOGLE_ADS' && !adsReady) {
      return {
        ...k,
        status: 'COMING_SOON',
        account_name: null,
        last_sync_at: null,
        last_error: null,
        actions: [],
        platform_ready: false,
        hint: 'Configure GOOGLE_CLIENT_ID / SECRET, enable Google Ads API in Cloud Console',
      };
    }
    if (k.key === 'META_ADS') {
      if (!metaReady) {
        return {
          ...k,
          status: 'COMING_SOON',
          account_name: null,
          last_sync_at: null,
          last_error: null,
          actions: [],
          platform_ready: false,
          hint: 'Configure META_APP_ID / META_APP_SECRET in .env',
        };
      }
      let status = c?.status || 'NOT_STARTED';
      if (
        metaLinked &&
        ['NOT_STARTED', 'DISCONNECTED', 'PENDING_AUTH'].includes(status)
      ) {
        status = 'PENDING_SELECT';
      }
      const actions = [];
      if (
        status === 'NOT_STARTED' ||
        status === 'DISCONNECTED' ||
        status === 'PENDING_AUTH'
      ) {
        actions.push(metaLinked ? 'select' : 'connect');
      } else if (status === 'PENDING_SELECT') {
        actions.push('select');
      } else if (status === 'ACTIVE') {
        actions.push('sync', 'disconnect');
      } else if (status === 'ERROR') {
        actions.push('sync', 'disconnect', metaLinked ? 'select' : 'reconnect');
      } else if (status === 'NEEDS_REAUTH') {
        actions.push(metaLinked ? 'select' : 'reconnect');
      }
      return {
        ...k,
        status,
        account_name: c?.external_account_name || null,
        last_sync_at: c?.last_sync_at || null,
        last_error: c?.last_error || null,
        actions,
        platform_ready: metaReady,
        meta_linked: metaLinked,
      };
    }
    let status = c?.status || 'NOT_STARTED';
    // Agency Google already linked → pick property, don't OAuth again
    if (
      agencyLinked &&
      ['NOT_STARTED', 'DISCONNECTED', 'PENDING_AUTH'].includes(status)
    ) {
      status = 'PENDING_SELECT';
    }
    const actions = [];
    const ready = k.key === 'GOOGLE_ADS' ? adsReady : googleReady;
    if (!ready) {
      /* Settings must configure env first */
    } else if (
      status === 'NOT_STARTED' ||
      status === 'DISCONNECTED' ||
      status === 'PENDING_AUTH'
    ) {
      actions.push(agencyLinked ? 'select' : 'connect');
    } else if (status === 'PENDING_SELECT') {
      actions.push('select');
    } else if (status === 'ACTIVE') {
      actions.push('sync', 'disconnect');
    } else if (status === 'ERROR') {
      actions.push('sync', 'disconnect', agencyLinked ? 'select' : 'reconnect');
    } else if (status === 'NEEDS_REAUTH') {
      actions.push(agencyLinked ? 'select' : 'reconnect');
    }
    return {
      ...k,
      status,
      account_name: c?.external_account_name || null,
      last_sync_at: c?.last_sync_at || null,
      last_error: c?.last_error || null,
      actions,
      platform_ready: ready,
      agency_linked: agencyLinked,
    };
  });
}

module.exports = {
  listClients,
  getClient,
  connectionMap,
  buildKpis,
  platformStatus,
  emptyKpis,
};
