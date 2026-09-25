'use strict';

/**
 * Meta P0 verify: list inventory, import one unlinked act_ (or reuse linked),
 * then check platforms/meta KPIs + snapshot rows. Never prints cookies/secrets.
 */

require('dotenv').config();

const crypto = require('crypto');
const { getDb, migrate, closeDb } = require('../src/lib/db');

const BASE = process.env.API_ORIGIN || 'http://127.0.0.1:4000';
const COOKIE = 'webastral_session';

function signSession(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET missing');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

async function req(method, path, { body, cookie } = {}) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 800) };
  }
  return { status: res.status, json };
}

function summarizeKpis(vm) {
  if (!vm || typeof vm !== 'object') return 'no payload';
  const kpis = vm.kpis || vm.totals || vm.summary || null;
  const series = vm.series || vm.chart || vm.daily || null;
  const keys = Object.keys(vm).slice(0, 20);
  return {
    topKeys: keys,
    kpiKeys: kpis ? Object.keys(kpis) : null,
    hasSeries: Boolean(series),
    sample: kpis
      ? Object.fromEntries(
          Object.entries(kpis)
            .slice(0, 12)
            .map(([k, v]) => [k, typeof v === 'object' ? '[obj]' : v])
        )
      : null,
  };
}

async function main() {
  migrate();
  const db = getDb();
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  if (!admin) throw new Error('No ADMIN user');

  const token = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: null,
    selectedWebsiteId: null,
    exp: Date.now() + 60 * 60 * 1000,
  });
  const cookie = `${COOKIE}=${token}`;

  console.log('META_REDIRECT_URI (local expected)');
  console.log(
    ' ',
    process.env.META_REDIRECT_URI ||
      'http://localhost:3000/auth/meta/callback (default)'
  );
  console.log(
    ' Paste that exact string into Meta Console → Valid OAuth Redirect URIs'
  );
  console.log('');

  const status = await req('GET', '/api/integrations/meta/status', { cookie });
  console.log(
    'meta/status',
    status.status,
    status.json?.linked != null
      ? `linked=${status.json.linked}`
      : JSON.stringify(status.json)?.slice(0, 200)
  );

  const accounts = await req('GET', '/api/integrations/meta/accounts', {
    cookie,
  });
  if (accounts.status !== 200) {
    console.error('FAIL accounts', accounts.status, accounts.json);
    closeDb();
    process.exitCode = 1;
    return;
  }

  const list = accounts.json?.accounts || [];
  const available = list.filter((a) => !a.linked);
  const imported = list.filter((a) => a.linked);
  console.log(
    `inventory connected=${Boolean(accounts.json?.connected)} available=${available.length} imported=${imported.length}`
  );
  for (const row of list.slice(0, 10)) {
    console.log(
      `  ${row.linked ? 'LINKED' : 'FREE '} ${row.id}  ${row.name || ''}`
    );
  }

  if (!accounts.json?.connected) {
    console.error(
      'FAIL Meta not connected — Connect Meta in UI first (Dev mode + app role).'
    );
    closeDb();
    process.exitCode = 1;
    return;
  }

  let clientId = null;
  let websiteId = null;
  let accountId = null;
  let pathUsed = '';

  // Prefer importing a free account so we exercise Create client & link + sync.
  if (available.length) {
    const row = available[0];
    accountId = row.id;
    pathUsed = 'import-new';
    console.log(`\nImporting Meta-only client for ${accountId} (${row.name})…`);
    const imp = await req('POST', '/api/integrations/meta/import', {
      cookie,
      body: {
        external_account_id: row.id,
        external_account_name: row.name,
        website_url: 'https://example.com',
        client_name: `Meta verify ${String(row.name || row.id).slice(0, 40)}`,
        sync: true,
      },
    });
    if (imp.status >= 400) {
      console.error('FAIL import', imp.status, imp.json);
      closeDb();
      process.exitCode = 1;
      return;
    }
    clientId = imp.json?.client?.id;
    websiteId = imp.json?.website?.id;
    console.log(
      `OK import client=${clientId} website=${websiteId} origin=${imp.json?.client?.origin}`
    );
    console.log(' sync result:', JSON.stringify(imp.json?.sync).slice(0, 400));
  } else if (imported.length) {
    const row = imported[0];
    accountId = row.id;
    clientId = row.linked.client_id;
    websiteId = row.linked.website_id;
    pathUsed = 'reuse-linked';
    console.log(
      `\nNo free accounts — reusing linked ${accountId} → client ${clientId} website ${websiteId}`
    );
    const sync = await req('POST', '/api/integrations/sync', {
      cookie,
      body: { providers: ['META_ADS'], force: true },
    });
    console.log('force sync', sync.status, JSON.stringify(sync.json).slice(0, 500));
  } else {
    console.error('FAIL no Meta ad accounts visible — check ads_read + BM access');
    closeDb();
    process.exitCode = 1;
    return;
  }

  // Select session context
  await req('POST', `/api/clients/${clientId}/select`, {
    cookie,
    body: { website_id: websiteId },
  }).catch(() => undefined);

  const sessionToken = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: clientId,
    selectedWebsiteId: websiteId,
    exp: Date.now() + 60 * 60 * 1000,
  });
  const cookie2 = `${COOKIE}=${sessionToken}`;

  const metaPage = await req('GET', '/api/platforms/meta', { cookie: cookie2 });
  console.log('\nplatforms/meta', metaPage.status);
  if (metaPage.status !== 200) {
    console.error('FAIL', metaPage.json);
  } else {
    console.log(' KPI/JSON shape:', JSON.stringify(summarizeKpis(metaPage.json)));
    const err = metaPage.json?.error || metaPage.json?.connection?.last_error;
    if (err) console.log(' last_error:', err);
    const conn = metaPage.json?.connection || metaPage.json?.platform;
    if (conn) {
      console.log(
        ' connection:',
        conn.status || conn.state,
        conn.external_account_id || conn.account_id || ''
      );
    }
  }

  const overview = await req('GET', '/api/overview', { cookie: cookie2 });
  console.log('overview', overview.status);
  if (overview.status === 200) {
    const k = overview.json?.kpis || overview.json?.totals;
    console.log(
      ' overview keys:',
      Object.keys(overview.json || {}).slice(0, 15).join(', ')
    );
    if (k) console.log(' overview kpis sample:', JSON.stringify(k).slice(0, 400));
  }

  const snaps = db
    .prepare(
      `SELECT date, spend, impressions, clicks, reach, primary_conversions,
              payload_json IS NOT NULL AND payload_json != '{}' AS has_payload
       FROM metric_snapshots
       WHERE website_id = ? AND source = 'META_ADS'
       ORDER BY date DESC
       LIMIT 5`
    )
    .all(websiteId);
  console.log(`\nsnapshots META_ADS for website ${websiteId}: ${snaps.length} recent`);
  for (const s of snaps) {
    console.log(
      `  ${s.date} spend=${s.spend} imps=${s.impressions} clicks=${s.clicks} reach=${s.reach} conv=${s.primary_conversions} payload=${s.has_payload}`
    );
  }

  const client = db
    .prepare(`SELECT id, name, origin FROM clients WHERE id = ?`)
    .get(clientId);
  console.log('\nclient provenance:', client);

  console.log('\n--- summary ---');
  console.log(
    `path=${pathUsed} account=${accountId} client=${clientId} website=${websiteId} snaps=${snaps.length} metaPage=${metaPage.status}`
  );
  if (metaPage.status !== 200 || !snaps.length) {
    process.exitCode = 1;
    console.log(
      snaps.length
        ? 'PARTIAL — page OK but check KPI fields'
        : 'FAIL — no META_ADS snapshots (sync may have returned empty date range)'
    );
  } else {
    console.log('OK — Meta linked + KPI snapshots present');
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
