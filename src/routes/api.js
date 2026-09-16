'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../lib/db');
const { setSession, clearSession, readSession } = require('../lib/session');
const {
  listClients,
  getClient,
  buildKpis,
  platformStatus,
} = require('../lib/clients');
const {
  listWebsites,
  getWebsite,
  createWebsite,
  updateWebsite,
  deleteWebsite,
} = require('../lib/websites');
const { resolvePreset, PRESETS } = require('../lib/dates');
const notifications = require('../lib/notifications');
const { createNotification } = require('../lib/notifications');
const {
  REPORT_SECTIONS,
  REPORT_KPI_DEFS,
  parseColumnsConfig,
  buildColumnsJson,
  buildAutoSummary,
  defaultSectionsMap,
} = require('../lib/reports');
const {
  buildSeriesPayload,
  pieSlicesForKpi,
} = require('../lib/report-kpis');
const { decrypt } = require('../lib/crypto');
const { revokeGoogleToken } = require('../lib/google/oauth');
const {
  getAdminGoogleToken,
  agencyGoogleStatus,
} = require('../lib/google/agency');
const { verifyClientGoogleAccess } = require('../lib/google/access');
const {
  googleLoginStatus,
  unlinkGoogleLogin,
} = require('../lib/auth/identities');
const { agencyMetaStatus } = require('../lib/meta/agency');
const { overviewAdmin, overviewClient } = require('../lib/metrics/views');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireClient(req, res, next) {
  if (!req.selectedClient) {
    return res.status(400).json({ error: 'Select a client', code: 'NEED_CLIENT' });
  }
  next();
}

function requireWebsite(req, res, next) {
  if (!req.selectedWebsite) {
    return res
      .status(400)
      .json({ error: 'Select a website', code: 'NEED_WEBSITE' });
  }
  next();
}

function websitesForSession(req) {
  if (!req.selectedClient) return [];
  return listWebsites(req.selectedClient.id);
}

function platformsForReq(req) {
  if (!req.selectedWebsite || !req.user) return [];
  const agency = agencyGoogleStatus(req.user.id);
  const meta = agencyMetaStatus(req.user.id);
  return platformStatus(req.selectedWebsite.id, {
    agencyLinked: agency.linked,
    metaLinked: meta.linked,
  });
}

function sessionPayload(req) {
  const agency = req.user ? agencyGoogleStatus(req.user.id) : null;
  const googleLogin = req.user ? googleLoginStatus(req.user.id) : null;
  const agencyMeta = req.user ? agencyMetaStatus(req.user.id) : null;
  return {
    user: req.user
      ? { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role }
      : null,
    selectedClient: req.selectedClient || null,
    selectedWebsite: req.selectedWebsite || null,
    websites: req.user ? websitesForSession(req) : [],
    clients: req.user ? listClients() : [],
    unreadCount: req.user ? notifications.unreadCount(req.user.id) : 0,
    recentNotifications: req.user
      ? notifications.listForUser(req.user.id, { limit: 12 })
      : [],
    platform: req.user
      ? {
          google: Boolean(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ),
          googleAds: Boolean(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ),
          googleAdsVerified: false,
          googleAdsTokenOptional: Boolean(
            process.env.GOOGLE_ADS_DEVELOPER_TOKEN
          ),
          meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
          agencyGoogle: agency,
          agencyMeta,
          googleLogin,
        }
      : {
          google: Boolean(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ),
          googleAds: false,
          googleAdsVerified: false,
          googleAdsTokenOptional: false,
          meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
          agencyGoogle: null,
          agencyMeta: null,
          googleLogin: null,
        },
  };
}

function writeSession(res, req, clientId, websiteId) {
  setSession(res, {
    userId: req.user.id,
    role: req.user.role,
    selectedClientId: clientId || null,
    selectedWebsiteId: websiteId || null,
  });
}

router.get('/session', (req, res) => {
  res.json(sessionPayload(req));
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const user = getDb()
    .prepare(`SELECT * FROM users WHERE email = ? AND role = 'ADMIN'`)
    .get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid Admin email or password.' });
  }
  const first = getDb().prepare(`SELECT id FROM clients ORDER BY name LIMIT 1`).get();
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  req.selectedClient = first ? getClient(first.id) : null;
  req.selectedWebsite = first ? listWebsites(first.id)[0] || null : null;
  writeSession(res, req, first?.id || null, req.selectedWebsite?.id || null);
  res.json(sessionPayload(req));
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.post('/auth/google/login/unlink', requireAuth, (req, res) => {
  unlinkGoogleLogin(req.user.id);
  res.json({ ok: true, ...sessionPayload(req) });
});

router.get('/presets', requireAuth, (req, res) => {
  res.json({ presets: PRESETS });
});

/** Agency portfolio ops (no client/website required). */
router.get('/agency/overview', requireAuth, (req, res) => {
  try {
    const data = overviewAdmin();
    const agency = agencyGoogleStatus(req.user.id);
    res.json({
      ...data,
      agencyGoogle: agency,
      unreadCount: notifications.unreadCount(req.user.id),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || 'Agency overview failed',
      code: 'AGENCY_OVERVIEW_ERROR',
    });
  }
});

/** Client rollup across websites (ops + light KPIs). */
router.get('/clients/:id/overview', requireAuth, (req, res) => {
  try {
    const data = overviewClient(req.params.id);
    if (!data) return res.status(404).json({ error: 'Client not found.' });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || 'Client overview failed',
      code: 'CLIENT_OVERVIEW_ERROR',
    });
  }
});

router.get('/overview', requireAuth, requireClient, requireWebsite, (req, res) => {
  try {
    const range = resolvePreset(req.query.preset, req.query.from, req.query.to);
    const current = buildKpis(req.selectedWebsite.id, range.from, range.to);
    const prior = buildKpis(
      req.selectedWebsite.id,
      range.compareFrom,
      range.compareTo
    );
    const gsc = {
      kpis: summarizeSource(current.bySource.gsc || [], 'GOOGLE_SEARCH_CONSOLE'),
      compare: summarizeSource(
        prior.bySource.gsc || [],
        'GOOGLE_SEARCH_CONSOLE'
      ),
    };
    const ga4 = {
      kpis: summarizeSource(current.bySource.ga4 || [], 'GOOGLE_ANALYTICS'),
      compare: summarizeSource(prior.bySource.ga4 || [], 'GOOGLE_ANALYTICS'),
    };
    const ads = {
      kpis: summarizeSource(current.bySource.ads || [], 'GOOGLE_ADS'),
      compare: summarizeSource(prior.bySource.ads || [], 'GOOGLE_ADS'),
    };
    const meta = {
      kpis: summarizeSource(current.bySource.meta || [], 'META_ADS'),
      compare: summarizeSource(prior.bySource.meta || [], 'META_ADS'),
    };
    const summary = buildAutoSummary({
      clientName: req.selectedClient.name,
      websiteUrl: req.selectedWebsite.url,
      from: range.from,
      to: range.to,
      kpis: current.kpis,
      compare: prior.kpis,
    });
    res.json({
      range,
      presets: PRESETS,
      kpis: current.kpis,
      compare: prior.kpis,
      gsc,
      ga4,
      ads,
      meta,
      summary,
      catalog: REPORT_SECTIONS,
      platforms: platformsForReq(req),
      website: req.selectedWebsite,
      client: req.selectedClient,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || 'Overview failed',
      code: 'OVERVIEW_ERROR',
    });
  }
});

router.get('/platforms/:key', requireAuth, requireClient, requireWebsite, (req, res) => {
  const map = {
    'google-ads': { provider: 'GOOGLE_ADS', title: 'Google Ads', bucket: 'ads' },
    meta: { provider: 'META_ADS', title: 'Meta Ads', bucket: 'meta' },
    ga4: { provider: 'GOOGLE_ANALYTICS', title: 'GA4', bucket: 'ga4' },
    gsc: {
      provider: 'GOOGLE_SEARCH_CONSOLE',
      title: 'Search Console',
      bucket: 'gsc',
    },
  };
  const conf = map[req.params.key];
  if (!conf) return res.status(404).json({ error: 'Unknown platform' });
  const range = resolvePreset(req.query.preset, req.query.from, req.query.to);
  const current = buildKpis(req.selectedWebsite.id, range.from, range.to);
  const prior = buildKpis(
    req.selectedWebsite.id,
    range.compareFrom,
    range.compareTo
  );
  const platforms = platformsForReq(req);
  const status = platforms.find((p) => p.key === conf.provider);
  const rows = (current.bySource[conf.bucket] || []).slice().sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const sourceKpis = summarizeSource(rows, conf.provider);
  const compareSource = summarizeSource(
    prior.bySource[conf.bucket] || [],
    conf.provider
  );
  res.json({
    key: req.params.key,
    title: conf.title,
    providerKey: conf.provider,
    range,
    presets: PRESETS,
    kpis: sourceKpis,
    compare: compareSource,
    status,
    rows,
  });
});

function summarizeSource(rows, provider) {
  const sum = (field) =>
    rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
  const clicks = sum('clicks');
  const impressions = sum('impressions');
  const sessions = sum('sessions');
  const users = sum('users');
  const spend = sum('spend');
  const primary_conversions = sum('primary_conversions');
  const primary_value = sum('primary_value');
  const engaged_sessions = sum('engaged_sessions');
  let avg_position = null;
  if (impressions > 0) {
    avg_position =
      rows.reduce(
        (n, r) =>
          n + (Number(r.avg_position) || 0) * (Number(r.impressions) || 0),
        0
      ) / impressions;
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const engagement_rate =
    sessions > 0 ? (engaged_sessions / sessions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : null;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
  const cpa =
    primary_conversions > 0 ? spend / primary_conversions : null;
  const roas = spend > 0 && primary_value > 0 ? primary_value / spend : null;
  return {
    provider,
    clicks,
    impressions,
    spend,
    sessions,
    users,
    engaged_sessions,
    primary_conversions,
    primary_value,
    avg_position,
    ctr,
    engagement_rate,
    cpc,
    cpm,
    cpa,
    roas,
    days: rows.length,
  };
}

router.get('/integrations', requireAuth, requireClient, requireWebsite, (req, res) => {
  res.json({
    platforms: platformsForReq(req),
    agencyGoogle: agencyGoogleStatus(req.user.id),
    agencyMeta: agencyMetaStatus(req.user.id),
    website: req.selectedWebsite,
    presets: PRESETS,
    range: resolvePreset(req.query.preset, req.query.from, req.query.to),
  });
});

router.get('/reports', requireAuth, requireClient, requireWebsite, (req, res) => {
  const reports = getDb()
    .prepare(
      `SELECT * FROM reports WHERE website_id = ? ORDER BY created_at DESC`
    )
    .all(req.selectedWebsite.id);
  res.json({
    reports,
    website: req.selectedWebsite,
    range: resolvePreset(req.query.preset, req.query.from, req.query.to),
    presets: PRESETS,
  });
});

router.get('/reports/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid report id' });
    }
    const report = getDb()
      .prepare(`SELECT * FROM reports WHERE id = ?`)
      .get(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const site = getWebsite(report.website_id);
    const client = site ? getClient(site.client_id) : null;
    if (!site || !client) {
      return res.status(404).json({ error: 'Report website missing' });
    }

    // Align session with report context for subsequent nav
    writeSession(res, req, client.id, site.id);
    req.selectedClient = client;
    req.selectedWebsite = site;

    const from = report.range_from;
    const to = report.range_to;
    const current = buildKpis(site.id, from, to);
    const prior = buildKpis(
      site.id,
      report.compare_from || from,
      report.compare_to || to
    );
    const columns = parseColumnsConfig(report.columns_json);
    const sections = columns.sections;
    const gscRows = current.bySource.gsc || [];
    const ga4Rows = current.bySource.ga4 || [];
    const gscKpis = summarizeSource(gscRows, 'GOOGLE_SEARCH_CONSOLE');
    const ga4Kpis = summarizeSource(ga4Rows, 'GOOGLE_ANALYTICS');
    const gscCompare = summarizeSource(
      prior.bySource.gsc || [],
      'GOOGLE_SEARCH_CONSOLE'
    );
    const ga4Compare = summarizeSource(
      prior.bySource.ga4 || [],
      'GOOGLE_ANALYTICS'
    );
    const series = buildSeriesPayload(current.bySource);
    const compareSeries = buildSeriesPayload(prior.bySource);
    const pie = {};
    const comparePie = {};
    for (const def of REPORT_KPI_DEFS) {
      if (!sections[def.section]) continue;
      const slices = pieSlicesForKpi(def, current.bySource);
      if (slices && slices.length) pie[def.key] = slices;
      const priorSlices = pieSlicesForKpi(def, prior.bySource);
      if (priorSlices && priorSlices.length) comparePie[def.key] = priorSlices;
    }

    const summary =
      report.ai_summary_edited ||
      report.ai_summary ||
      buildAutoSummary({
        clientName: client.name,
        websiteUrl: site.url,
        from,
        to,
        kpis: current.kpis,
        compare: prior.kpis,
      });

    res.json({
      report: {
        ...report,
        sections,
        chart_types: columns.chart_types,
        use_overview_defaults: columns.use_overview_defaults,
        summary_text: summary,
      },
      catalog: REPORT_SECTIONS,
      kpiCatalog: REPORT_KPI_DEFS,
      kpis: current.kpis,
      compare: prior.kpis,
      gsc: { kpis: gscKpis, compare: gscCompare },
      ga4: { kpis: ga4Kpis, compare: ga4Compare },
      series,
      compareSeries,
      pie,
      comparePie,
      range: {
        from,
        to,
        compareFrom: report.compare_from || from,
        compareTo: report.compare_to || to,
      },
      website: site,
      client,
      platforms: platformStatus(site.id, {
        agencyLinked: agencyGoogleStatus(req.user.id).linked,
        metaLinked: agencyMetaStatus(req.user.id).linked,
      }),
      ...sessionPayload(req),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Report failed' });
  }
});

router.post('/reports', requireAuth, requireClient, requireWebsite, (req, res) => {
  const title = String(req.body.title || '').trim() || 'Marketing report';
  const range = resolvePreset(req.body.preset, req.body.from, req.body.to);
  const useOverviewDefaults =
    req.body.use_overview_defaults === undefined
      ? true
      : Boolean(req.body.use_overview_defaults);
  const sections = useOverviewDefaults
    ? defaultSectionsMap()
    : req.body.sections;
  const columnsJson = buildColumnsJson({
    sections,
    use_overview_defaults: useOverviewDefaults,
    chart_types: req.body.chart_types,
  });
  const current = buildKpis(
    req.selectedWebsite.id,
    range.from,
    range.to
  );
  const prior = buildKpis(
    req.selectedWebsite.id,
    range.compareFrom,
    range.compareTo
  );
  const aiSummary = buildAutoSummary({
    clientName: req.selectedClient.name,
    websiteUrl: req.selectedWebsite.url,
    from: range.from,
    to: range.to,
    kpis: current.kpis,
    compare: prior.kpis,
  });
  const brandingJson = JSON.stringify({
    client_name: req.selectedClient.name,
    website_url: req.selectedWebsite.url,
    brand_primary: req.selectedClient.brand_primary,
  });
  const metricsJson = JSON.stringify({
    kpis: current.kpis,
    compare: prior.kpis,
  });

  const info = getDb()
    .prepare(
      `INSERT INTO reports (
         client_id, website_id, title, range_from, range_to,
         compare_from, compare_to, branding_json, columns_json,
         metrics_json, ai_summary, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.selectedClient.id,
      req.selectedWebsite.id,
      title,
      range.from,
      range.to,
      range.compareFrom || null,
      range.compareTo || null,
      brandingJson,
      columnsJson,
      metricsJson,
      aiSummary,
      req.user.id
    );
  const report = getDb()
    .prepare(`SELECT * FROM reports WHERE id = ?`)
    .get(info.lastInsertRowid);
  createNotification({
    userId: req.user.id,
    clientId: req.selectedClient.id,
    layer: 'CLIENT',
    type: 'report.created',
    severity: 'success',
    title: 'Report saved',
    body: title,
    href: `/reports/${report.id}`,
  });
  const columns = parseColumnsConfig(report.columns_json);
  res.status(201).json({
    report: {
      ...report,
      sections: columns.sections,
      chart_types: columns.chart_types,
      use_overview_defaults: columns.use_overview_defaults,
    },
    range,
  });
});

router.get('/report-sections', requireAuth, (_req, res) => {
  res.json({ sections: REPORT_SECTIONS });
});

router.get('/clients', requireAuth, (req, res) => {
  res.json({ clients: listClients() });
});

router.post('/clients', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const website_url = String(req.body.website_url || '').trim();
  if (!name || !website_url) {
    return res.status(400).json({ error: 'Name and website URL required.' });
  }
  const timezone = String(req.body.timezone || 'Asia/Kolkata');
  const currency = String(req.body.currency || 'INR');
  const info = getDb()
    .prepare(
      `INSERT INTO clients (name, website_url, brand_primary, brand_secondary, timezone, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      website_url,
      String(req.body.brand_primary || '#0d7a6f'),
      String(req.body.brand_secondary || '#1e2530'),
      timezone,
      currency
    );
  const site = createWebsite(info.lastInsertRowid, {
    name: String(req.body.website_name || name).trim() || name,
    url: website_url,
    timezone,
    currency,
  });
  createNotification({
    userId: req.user.id,
    clientId: info.lastInsertRowid,
    layer: 'CLIENT',
    type: 'client.created',
    severity: 'info',
    title: 'Client created',
    body: name,
    href: '/',
  });
  req.selectedClient = getClient(info.lastInsertRowid);
  req.selectedWebsite = site;
  writeSession(res, req, info.lastInsertRowid, site.id);
  res.status(201).json({
    client: req.selectedClient,
    website: site,
    ...sessionPayload(req),
  });
});

router.put('/clients/:id', requireAuth, (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Name required.' });
  }
  getDb()
    .prepare(
      `UPDATE clients SET
         name = ?,
         brand_primary = ?, brand_secondary = ?,
         timezone = ?, currency = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      name,
      String(req.body.brand_primary || client.brand_primary),
      String(req.body.brand_secondary || client.brand_secondary),
      String(req.body.timezone || client.timezone),
      String(req.body.currency || client.currency),
      client.id
    );
  res.json({ client: getClient(client.id), clients: listClients() });
});

router.delete('/clients/:id', requireAuth, async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const disconnectGoogle =
    req.query.disconnectGoogle === '1' ||
    req.body?.disconnectGoogle === true ||
    req.body?.disconnectGoogle === '1';

  let googleRevoked = 0;
  let googleSkippedShared = 0;

  if (disconnectGoogle) {
    const adminRow = getAdminGoogleToken(req.user.id);
    let adminPlain = null;
    try {
      adminPlain = adminRow
        ? decrypt(adminRow.encrypted_refresh_token)
        : null;
    } catch {
      adminPlain = null;
    }

    const connRows = getDb()
      .prepare(
        `SELECT c.encrypted_refresh_token
         FROM connections c
         JOIN websites w ON w.id = c.website_id
         WHERE w.client_id = ?
           AND c.encrypted_refresh_token IS NOT NULL
           AND c.provider IN (
             'GOOGLE_ANALYTICS',
             'GOOGLE_SEARCH_CONSOLE',
             'GOOGLE_ADS'
           )`
      )
      .all(client.id);

    const unique = new Set();
    for (const row of connRows) {
      try {
        const plain = decrypt(row.encrypted_refresh_token);
        if (plain) unique.add(plain);
      } catch {
        /* ignore bad ciphertext */
      }
    }

    for (const token of unique) {
      if (adminPlain && token === adminPlain) {
        googleSkippedShared += 1;
        continue;
      }
      try {
        const r = await revokeGoogleToken(token);
        if (r.ok) googleRevoked += 1;
      } catch {
        /* best-effort */
      }
    }
  }

  getDb().prepare(`DELETE FROM clients WHERE id = ?`).run(client.id);

  const session = readSession(req);
  let selected = session?.selectedClientId;
  let siteId = null;
  if (String(selected) === String(client.id)) {
    selected =
      getDb().prepare(`SELECT id FROM clients ORDER BY name LIMIT 1`).get()
        ?.id || null;
  }
  if (selected) {
    siteId = listWebsites(selected)[0]?.id || null;
  }
  req.selectedClient = selected ? getClient(selected) : null;
  req.selectedWebsite = siteId ? getWebsite(siteId) : null;
  writeSession(res, req, selected, siteId);
  res.json({
    ...sessionPayload(req),
    deleted: { id: client.id, name: client.name },
    google: {
      disconnectRequested: Boolean(disconnectGoogle),
      revokedTokens: googleRevoked,
      skippedSharedAgencyToken: googleSkippedShared,
      note:
        'GA4 properties and Search Console sites stay in Google. Webastral links and local data are removed. Shared agency Gmail login is kept so other clients keep working.',
    },
  });
});

router.post('/clients/:id/select', requireAuth, (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const sites = listWebsites(client.id);
  const site = sites[0] || null;
  req.selectedClient = client;
  req.selectedWebsite = site;
  writeSession(res, req, client.id, site?.id || null);
  res.json(sessionPayload(req));
});

/** Live Google token check for a client — confirms revoked access via Google APIs. */
router.post('/clients/:id/verify-google', requireAuth, async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  try {
    const result = await verifyClientGoogleAccess(req.user.id, client.id);
    res.json({
      client: { id: client.id, name: client.name },
      ...result,
    });
  } catch (e) {
    res.status(500).json({
      error: e?.message || 'Google verification failed',
      code: e?.code,
    });
  }
});

/** Client research hub: websites + connection health (independent of KPI overview). */
router.get('/clients/:id/research', requireAuth, (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const agency = agencyGoogleStatus(req.user.id);
  const meta = agencyMetaStatus(req.user.id);
  const websites = listWebsites(client.id).map((site) => ({
    id: site.id,
    name: site.name,
    url: site.url,
    platforms: platformStatus(site.id, {
      agencyLinked: agency.linked,
      metaLinked: meta.linked,
    }),
  }));
  res.json({
    client,
    agencyGoogle: agency,
    agencyMeta: meta,
    websites,
  });
});

router.get('/clients/:id/websites', requireAuth, (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  res.json({ websites: listWebsites(client.id) });
});

router.post('/clients/:id/websites', requireAuth, (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const url = String(req.body.url || '').trim();
  const name = String(req.body.name || '').trim();
  if (!url || !name) {
    return res.status(400).json({ error: 'Name and URL required.' });
  }
  const site = createWebsite(client.id, {
    name,
    url,
    timezone: req.body.timezone,
    currency: req.body.currency,
  });
  req.selectedClient = client;
  req.selectedWebsite = site;
  writeSession(res, req, client.id, site.id);
  res.status(201).json({ website: site, ...sessionPayload(req) });
});

router.put('/websites/:id', requireAuth, (req, res) => {
  const site = updateWebsite(req.params.id, req.body);
  if (!site) return res.status(404).json({ error: 'Website not found.' });
  res.json({ website: site, websites: listWebsites(site.client_id) });
});

router.delete('/websites/:id', requireAuth, (req, res) => {
  const site = getWebsite(req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found.' });
  const clientId = site.client_id;
  deleteWebsite(site.id);
  const remaining = listWebsites(clientId);
  const next = remaining[0] || null;
  if (req.selectedWebsite?.id === site.id) {
    req.selectedWebsite = next;
  }
  if (req.selectedClient?.id === clientId) {
    writeSession(res, req, clientId, next?.id || null);
  }
  res.json({ websites: remaining, ...sessionPayload(req) });
});

router.post('/websites/:id/select', requireAuth, (req, res) => {
  const site = getWebsite(req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found.' });
  const client = getClient(site.client_id);
  req.selectedClient = client;
  req.selectedWebsite = site;
  writeSession(res, req, client.id, site.id);
  res.json(sessionPayload(req));
});

router.post('/notifications/:id/read', requireAuth, (req, res) => {
  notifications.markRead(req.user.id, Number(req.params.id));
  res.json(sessionPayload(req));
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  notifications.markAllRead(req.user.id);
  res.json(sessionPayload(req));
});

module.exports = router;
