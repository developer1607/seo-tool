'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { getDb, migrate, closeDb } = require('../src/lib/db');

const BASE = process.env.API_ORIGIN || 'http://127.0.0.1:4000';

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

  const conns = db
    .prepare(
      `SELECT website_id, client_id, status, external_account_id,
              external_account_name, last_sync_at, last_error
       FROM connections WHERE provider = 'META_ADS' ORDER BY id`
    )
    .all();

  console.log('META connections:', conns.length);
  for (const c of conns) {
    const n = db
      .prepare(
        `SELECT COUNT(1) AS n,
                COALESCE(SUM(spend), 0) AS spend,
                COALESCE(SUM(impressions), 0) AS imps,
                COALESCE(SUM(clicks), 0) AS clicks
         FROM metric_snapshots
         WHERE website_id = ? AND source = 'META_ADS'`
      )
      .get(c.website_id);
    console.log(
      [
        c.external_account_id,
        c.external_account_name || '',
        `site=${c.website_id}`,
        `status=${c.status}`,
        `snaps=${n.n}`,
        `spend=${n.spend}`,
        `imps=${n.imps}`,
        `clicks=${n.clicks}`,
        c.last_error ? `err=${c.last_error}` : '',
        c.last_sync_at ? `synced=${c.last_sync_at}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }

  // Prefer account that looks active: webtoners linked, else any with name
  const target =
    conns.find((c) => /webtoners/i.test(c.external_account_name || '')) ||
    conns.find((c) => c.status === 'ACTIVE') ||
    conns[0];

  if (!target) {
    console.log('No META connections');
    closeDb();
    return;
  }

  console.log(
    '\nForce sync target:',
    target.external_account_id,
    target.external_account_name,
    'website',
    target.website_id
  );

  const cookie = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: target.client_id,
    selectedWebsiteId: target.website_id,
    exp: Date.now() + 3600000,
  });

  const sync = await req(
    'POST',
    `/api/integrations/META_ADS/sync`,
    cookie,
    { website_id: target.website_id, force: true }
  );
  console.log('sync', sync.status, JSON.stringify(sync.json).slice(0, 700));

  const after = db
    .prepare(
      `SELECT date, spend, impressions, clicks, reach, primary_conversions
       FROM metric_snapshots
       WHERE website_id = ? AND source = 'META_ADS'
       ORDER BY date DESC
       LIMIT 10`
    )
    .all(target.website_id);
  console.log('snapshots after sync:', after.length);
  for (const r of after) {
    console.log(
      `  ${r.date} spend=${r.spend} imps=${r.impressions} clicks=${r.clicks} reach=${r.reach} conv=${r.primary_conversions}`
    );
  }

  const page = await req('GET', '/api/platforms/meta', cookie);
  const k = page.json?.kpis;
  console.log(
    '\nplatforms/meta',
    page.status,
    k
      ? `spend=${k.spend} imps=${k.impressions} clicks=${k.clicks} days=${k.days} cpc=${k.cpc} cpm=${k.cpm}`
      : JSON.stringify(page.json)?.slice(0, 300)
  );
  console.log('rows', (page.json?.rows || []).length);

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
