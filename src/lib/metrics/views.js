'use strict';

const { getDb } = require('../db');

function connectionHealth(websiteIds) {
  if (!websiteIds.length) {
    return {
      active: 0,
      error: 0,
      needs_reauth: 0,
      pending_select: 0,
      pending_auth: 0,
    };
  }
  const placeholders = websiteIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) AS c FROM connections
       WHERE website_id IN (${placeholders})
       GROUP BY status`
    )
    .all(...websiteIds);
  const map = Object.fromEntries(rows.map((r) => [r.status, r.c]));
  return {
    active: map.ACTIVE || 0,
    error: map.ERROR || 0,
    needs_reauth: map.NEEDS_REAUTH || 0,
    pending_select: map.PENDING_SELECT || 0,
    pending_auth: map.PENDING_AUTH || 0,
  };
}

function attentionRows({ clientId = null, limit = 20 } = {}) {
  const db = getDb();
  const params = [];
  let where = `c.status IN ('ERROR', 'NEEDS_REAUTH', 'PENDING_SELECT', 'PENDING_AUTH')`;
  if (clientId != null) {
    where += ` AND w.client_id = ?`;
    params.push(Number(clientId));
  }
  params.push(Number(limit) || 20);
  return db
    .prepare(
      `SELECT
         c.id AS connection_id,
         c.provider,
         c.status,
         c.last_error,
         c.last_sync_at,
         w.id AS website_id,
         w.name AS website_name,
         w.url AS website_url,
         cl.id AS client_id,
         cl.name AS client_name
       FROM connections c
       JOIN websites w ON w.id = c.website_id
       JOIN clients cl ON cl.id = w.client_id
       WHERE ${where}
       ORDER BY
         CASE c.status
           WHEN 'NEEDS_REAUTH' THEN 0
           WHEN 'ERROR' THEN 1
           WHEN 'PENDING_SELECT' THEN 2
           ELSE 3
         END,
         c.updated_at DESC
       LIMIT ?`
    )
    .all(...params)
    .map((row) => ({
      connection_id: row.connection_id,
      provider: row.provider,
      status: row.status,
      last_error: row.last_error,
      last_sync_at: row.last_sync_at,
      website_id: row.website_id,
      website_name: row.website_name,
      website_url: row.website_url,
      client_id: row.client_id,
      client_name: row.client_name,
      href: `/integrations?website_id=${row.website_id}`,
    }));
}

function sumField(rows, field) {
  return rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

function snapshotsSince(websiteIds, days = 28) {
  if (!websiteIds.length) return [];
  const placeholders = websiteIds.map(() => '?').join(',');
  return getDb()
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE website_id IN (${placeholders})
         AND date >= ?
       ORDER BY date ASC`
    )
    .all(...websiteIds, isoDaysAgo(days));
}

function emptyKpis() {
  return {
    organic_clicks: 0,
    sessions: 0,
    meta_spend: 0,
    ads_spend: 0,
    spend: 0,
    primary_conversions: 0,
    avg_position: null,
    efficiency: null,
    efficiency_kind: 'NONE',
    range_label: 'Last 28 days',
  };
}

function buildOverviewKpis(websiteIds) {
  const rows = snapshotsSince(websiteIds);
  const gsc = rows.filter((r) => r.source === 'GOOGLE_SEARCH_CONSOLE');
  const ga4 = rows.filter((r) => r.source === 'GOOGLE_ANALYTICS');
  const meta = rows.filter((r) => r.source === 'META_ADS');
  const ads = rows.filter((r) => r.source === 'GOOGLE_ADS');
  const kpis = emptyKpis();
  kpis.organic_clicks = sumField(gsc, 'clicks');
  kpis.sessions = sumField(ga4, 'sessions');
  kpis.meta_spend = sumField(meta, 'spend');
  kpis.ads_spend = sumField(ads, 'spend');
  kpis.spend = kpis.meta_spend + kpis.ads_spend;
  kpis.primary_conversions =
    sumField(ga4, 'primary_conversions') +
    sumField(meta, 'primary_conversions') +
    sumField(ads, 'primary_conversions');
  const imp = sumField(gsc, 'impressions');
  if (imp > 0) {
    kpis.avg_position =
      gsc.reduce(
        (n, r) =>
          n + (Number(r.avg_position) || 0) * (Number(r.impressions) || 0),
        0
      ) / imp;
  }
  return kpis;
}

/** Agency portfolio ops + light rollup (not a website Overview clone). */
function overviewAdmin() {
  const db = getDb();
  const clients = db.prepare(`SELECT COUNT(*) AS c FROM clients`).get().c;
  const websites = db.prepare(`SELECT COUNT(*) AS c FROM websites`).get().c;
  const ids = db.prepare(`SELECT id FROM websites`).all().map((r) => r.id);
  const health = connectionHealth(ids);
  return {
    grain: 'agency',
    range_label: 'Last 28 days',
    totals: {
      clients,
      websites,
      connections_active: health.active,
      connections_error: health.error,
      connections_needs_reauth: health.needs_reauth,
      connections_pending_select: health.pending_select,
      connections_pending_auth: health.pending_auth,
    },
    kpis: buildOverviewKpis(ids),
    attention: attentionRows({ limit: 15 }),
  };
}

/** Client rollup across all websites for one client. */
function overviewClient(clientId) {
  const id = Number(clientId);
  const client = getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
  if (!client) return null;
  const ids = getDb()
    .prepare(`SELECT id FROM websites WHERE client_id = ?`)
    .all(id)
    .map((r) => r.id);
  const health = connectionHealth(ids);
  return {
    grain: 'client',
    range_label: 'Last 28 days',
    client: {
      id: client.id,
      name: client.name,
      website_url: client.website_url,
    },
    totals: {
      websites: ids.length,
      connections_active: health.active,
      connections_error: health.error,
      connections_needs_reauth: health.needs_reauth,
      connections_pending_select: health.pending_select,
      connections_pending_auth: health.pending_auth,
    },
    kpis: buildOverviewKpis(ids),
    attention: attentionRows({ clientId: id, limit: 10 }),
  };
}

function websiteOverview(websiteId) {
  const db = getDb();
  const { tableExists } = require('../db');
  const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(websiteId);
  if (!website) return null;
  let onboarding = null;
  if (tableExists('website_onboarding')) {
    onboarding = db
      .prepare(`SELECT * FROM website_onboarding WHERE website_id = ?`)
      .get(websiteId);
  }
  const connections = db
      .prepare(`SELECT * FROM connections WHERE website_id = ? ORDER BY provider`)
      .all(websiteId);
  const kpis = buildOverviewKpis([websiteId]);
  const banners = [];
  if (!onboarding || onboarding.status !== 'COMPLETE') {
    banners.push({
      type: 'warn',
      text: 'Setup incomplete — finish onboarding',
      href: `/websites/${websiteId}/onboarding`,
    });
  }
  for (const c of connections) {
    if (c.status === 'NEEDS_REAUTH') {
      banners.push({
        type: 'error',
        text: `Reconnect ${c.provider.replace(/_/g, ' ')}`,
        href: `/websites/${websiteId}/integrations`,
      });
    } else if (c.status === 'ERROR') {
      banners.push({
        type: 'error',
        text: c.last_error || `${c.provider} sync error`,
        href: `/websites/${websiteId}/integrations`,
      });
    }
  }
  return {
    website,
    setup: {
      onboarding_status: onboarding?.status || 'DRAFT',
      channels_enabled: JSON.parse(onboarding?.channels_json || '[]'),
      connections: connections.map((c) => ({
        provider: c.provider,
        status: c.status,
        label: c.external_account_name || c.external_account_id || '—',
        last_sync_at: c.last_sync_at,
        last_error: c.last_error,
      })),
    },
    kpis,
    series: { labels: [], organic_clicks: [], sessions: [], meta_spend: [] },
    banners,
  };
}

function performanceVM(websiteId) {
  const db = getDb();
  const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(websiteId);
  if (!website) return null;
  const rows = snapshotsSince([websiteId]);
  const gsc = rows.filter((r) => r.source === 'GOOGLE_SEARCH_CONSOLE');
  const ga4 = rows.filter((r) => r.source === 'GOOGLE_ANALYTICS');
  const meta = rows.filter((r) => r.source === 'META_ADS');
  const conns = Object.fromEntries(
    db
      .prepare(`SELECT provider, status FROM connections WHERE website_id = ?`)
      .all(websiteId)
      .map((c) => [c.provider, c.status])
  );

  const channels = [
    {
      key: 'GOOGLE_ORGANIC',
      label: 'Google Organic',
      status: conns.GOOGLE_SEARCH_CONSOLE || conns.GOOGLE_ANALYTICS || 'NOT_STARTED',
      metrics: {
        clicks: sumField(gsc, 'clicks'),
        impressions: sumField(gsc, 'impressions'),
        ctr: sumField(gsc, 'impressions')
          ? sumField(gsc, 'clicks') / sumField(gsc, 'impressions')
          : 0,
        avg_position: null,
        sessions: sumField(ga4, 'sessions'),
        primary_conversions: sumField(ga4, 'primary_conversions'),
      },
      campaigns: [],
    },
    {
      key: 'META_ADS',
      label: 'Meta Ads',
      status: conns.META_ADS || 'NOT_STARTED',
      metrics: {
        spend: sumField(meta, 'spend'),
        impressions: sumField(meta, 'impressions'),
        clicks: sumField(meta, 'clicks'),
        ctr: sumField(meta, 'impressions')
          ? sumField(meta, 'clicks') / sumField(meta, 'impressions')
          : 0,
        primary_conversions: sumField(meta, 'primary_conversions'),
        efficiency: null,
        efficiency_kind: 'NONE',
      },
      campaigns: [],
    },
  ];

  return {
    website,
    range_label: 'Last 28 days',
    channels,
    hidden_channels: [],
  };
}

const PROVIDER_CATALOG = [
  { key: 'GOOGLE_ANALYTICS', label: 'Google Analytics 4', phase: 0 },
  { key: 'GOOGLE_SEARCH_CONSOLE', label: 'Google Search Console', phase: 0 },
  { key: 'META_ADS', label: 'Meta Ads', phase: 0 },
  { key: 'GOOGLE_ADS', label: 'Google Ads', phase: 0 },
];

function integrationsVM(websiteId) {
  const db = getDb();
  const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(websiteId);
  if (!website) return null;
  const byProvider = Object.fromEntries(
    db
      .prepare(`SELECT * FROM connections WHERE website_id = ?`)
      .all(websiteId)
      .map((c) => [c.provider, c])
  );
  return {
    website,
    providers: PROVIDER_CATALOG.map((p) => {
      const c = byProvider[p.key];
      if (p.phase > 0) {
        return { ...p, status: 'COMING_SOON', account_name: null, actions: [] };
      }
      const status = c?.status || 'NOT_STARTED';
      const actions = [];
      if (status === 'NOT_STARTED' || status === 'DISCONNECTED') actions.push('connect');
      if (status === 'PENDING_SELECT') actions.push('select');
      if (status === 'ACTIVE') actions.push('sync', 'disconnect', 'configure');
      if (status === 'ERROR') actions.push('retry', 'disconnect');
      if (status === 'NEEDS_REAUTH') actions.push('reconnect');
      return {
        ...p,
        status,
        account_name: c?.external_account_name || null,
        last_sync_at: c?.last_sync_at || null,
        last_error: c?.last_error || null,
        actions,
      };
    }),
  };
}

module.exports = {
  overviewAdmin,
  overviewClient,
  websiteOverview,
  performanceVM,
  integrationsVM,
  emptyKpis,
};
