'use strict';

/**
 * Import a Meta account known to have spend, sync last_365, print KPIs.
 */
require('dotenv').config();
const crypto = require('crypto');
const { getDb, migrate, closeDb } = require('../src/lib/db');

const BASE = process.env.API_ORIGIN || 'http://127.0.0.1:4000';
const ACCOUNT_ID = process.env.META_VERIFY_ACT || 'act_2009020426510342';
const ACCOUNT_NAME = process.env.META_VERIFY_NAME || 'Anayiah Grewal';

function signSession(payload) {
  const secret = process.env.AUTH_SECRET;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `webastral_session=${body}.${sig}`;
}

async function req(method, path, cookie, body) {
  const headers = { Accept: 'application/json', Cookie: cookie };
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 600) };
  }
  return { status: res.status, json };
}

async function main() {
  migrate();
  const db = getDb();
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  const cookie = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: null,
    selectedWebsiteId: null,
    exp: Date.now() + 3600000,
  });

  // Already linked?
  const existing = db
    .prepare(
      `SELECT * FROM connections
       WHERE provider = 'META_ADS' AND external_account_id = ?`
    )
    .get(ACCOUNT_ID);

  let clientId;
  let websiteId;

  if (existing && existing.status === 'ACTIVE') {
    clientId = existing.client_id;
    websiteId = existing.website_id;
    console.log('Already linked — re-sync last_365', ACCOUNT_ID, websiteId);
    const cookie2 = signSession({
      userId: admin.id,
      role: 'ADMIN',
      selectedClientId: clientId,
      selectedWebsiteId: websiteId,
      exp: Date.now() + 3600000,
    });
    const sync = await req(
      'POST',
      '/api/integrations/META_ADS/sync',
      cookie2,
      { website_id: websiteId, preset: 'last_365' }
    );
    console.log('sync', sync.status, JSON.stringify(sync.json).slice(0, 400));
  } else {
    console.log('Importing', ACCOUNT_ID, ACCOUNT_NAME);
    const imp = await req('POST', '/api/integrations/meta/import', cookie, {
      external_account_id: ACCOUNT_ID,
      external_account_name: ACCOUNT_NAME,
      website_url: 'https://example.com',
      client_name: `Meta verify ${ACCOUNT_NAME}`,
      sync: true,
    });
    console.log('import', imp.status);
    if (imp.status >= 400) {
      console.error(imp.json);
      closeDb();
      process.exitCode = 1;
      return;
    }
    clientId = imp.json.client.id;
    websiteId = imp.json.website.id;
    console.log(
      'client',
      clientId,
      'origin',
      imp.json.client.origin,
      'sync',
      JSON.stringify(imp.json.sync)
    );
  }

  const cookie3 = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: clientId,
    selectedWebsiteId: websiteId,
    exp: Date.now() + 3600000,
  });

  const page = await req('GET', '/api/platforms/meta', cookie3);
  const k = page.json?.kpis || {};
  console.log('\nplatforms/meta', page.status);
  console.log('KPIs:', {
    spend: k.spend,
    impressions: k.impressions,
    clicks: k.clicks,
    reach: k.reach,
    ctr: k.ctr,
    cpc: k.cpc,
    cpm: k.cpm,
    primary_conversions: k.primary_conversions,
    days: k.days,
  });
  console.log('daily rows', (page.json?.rows || []).length);

  const snaps = db
    .prepare(
      `SELECT date, spend, impressions, clicks, reach, primary_conversions,
              length(payload_json) AS payload_len
       FROM metric_snapshots
       WHERE website_id = ? AND source = 'META_ADS'
       ORDER BY date DESC
       LIMIT 5`
    )
    .all(websiteId);
  console.log('recent snapshots:');
  for (const s of snaps) console.log(' ', s);

  const totals = db
    .prepare(
      `SELECT COUNT(1) AS days,
              COALESCE(SUM(spend),0) AS spend,
              COALESCE(SUM(impressions),0) AS imps,
              COALESCE(SUM(clicks),0) AS clicks
       FROM metric_snapshots
       WHERE website_id = ? AND source = 'META_ADS'`
    )
    .get(websiteId);
  console.log('\nDB totals', totals);

  if (!totals.days || !Number(totals.spend)) {
    console.log('FAIL — still no Meta snapshot spend');
    process.exitCode = 1;
  } else {
    console.log('OK — Meta KPIs + JSON snapshots populated');
  }
  closeDb();
}

main().catch((e) => {
  console.error(e);
  try {
    closeDb();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
