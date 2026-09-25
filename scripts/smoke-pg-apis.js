'use strict';

/**
 * End-to-end API smoke against running server + DATABASE_URL.
 * Uses a signed session cookie (no password dump). Logs every failure.
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
  return { status: res.status, json, text };
}

function printSummary(results) {
  const failed = results.filter((r) => !r.ok);
  console.log('\n--- summary ---');
  console.log(
    `passed=${results.filter((r) => r.ok).length} failed=${failed.length}`
  );
}

async function main() {
  const results = [];
  const fail = (label, detail) => {
    results.push({ ok: false, label, detail });
    console.error(
      'FAIL',
      label,
      typeof detail === 'string' ? detail : JSON.stringify(detail)
    );
  };
  const ok = (label, extra) => {
    results.push({ ok: true, label, extra });
    console.log('OK  ', label, extra != null ? extra : '');
  };

  migrate();
  const db = getDb();

  try {
    const { hasColumn, tableExists } = require('../src/lib/db');
    const { normalizeDomain, ORIGINS } = require('../src/lib/clientProvenance');
    const { listCatalog } = require('../src/lib/integrations/catalog');
    if (!hasColumn('clients', 'origin')) throw new Error('clients.origin missing');
    if (!hasColumn('websites', 'primary_domain')) {
      throw new Error('websites.primary_domain missing');
    }
    if (!tableExists('client_sources')) throw new Error('client_sources missing');
    if (!tableExists('integration_providers')) {
      throw new Error('integration_providers missing');
    }
    if (!tableExists('user_domain_access')) {
      throw new Error('user_domain_access missing');
    }
    const seeded = db
      .prepare(`SELECT COUNT(*) AS n FROM integration_providers`)
      .get();
    if (!seeded?.n) throw new Error('integration_providers empty');
    const d = normalizeDomain('https://www.Example.com/path');
    if (d !== 'example.com') throw new Error(`normalizeDomain got ${d}`);
    ok(
      'schema/provenance',
      `origins=${ORIGINS.length} catalog=${listCatalog().length} providers=${seeded.n}`
    );
  } catch (e) {
    fail('schema/provenance', e.message);
  }

  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  const client = db.prepare(`SELECT id FROM clients ORDER BY id LIMIT 1`).get();
  const website = client
    ? db
        .prepare(
          `SELECT id FROM websites WHERE client_id = ? ORDER BY id LIMIT 1`
        )
        .get(client.id)
    : null;

  const {
    overviewAdmin,
    overviewClient,
    websiteOverview,
  } = require('../src/lib/metrics/views');
  const { buildKpis } = require('../src/lib/clients');

  try {
    const a = overviewAdmin();
    ok(
      'lib/overviewAdmin',
      `clients=${a.totals.clients} attn=${a.attention.length}`
    );
  } catch (e) {
    fail('lib/overviewAdmin', e.message);
  }
  if (client) {
    try {
      const c = overviewClient(client.id);
      ok('lib/overviewClient', c ? `websites=${c.totals.websites}` : 'null');
    } catch (e) {
      fail('lib/overviewClient', e.message);
    }
  }
  if (website) {
    try {
      websiteOverview(website.id);
      ok('lib/websiteOverview');
    } catch (e) {
      fail('lib/websiteOverview', e.message);
    }
    try {
      const from = new Date();
      from.setUTCDate(from.getUTCDate() - 28);
      const to = new Date();
      buildKpis(
        website.id,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10)
      );
      ok('lib/buildKpis');
    } catch (e) {
      fail('lib/buildKpis', e.message);
    }
  }

  let health;
  try {
    health = await req('GET', '/api/health');
  } catch (e) {
    fail('health', e.message);
    closeDb();
    process.exitCode = 1;
    printSummary(results);
    return;
  }
  if (health.status !== 200 || !health.json?.ok) {
    fail('health', health.json || health.status);
  } else {
    ok('health', health.json.db);
  }

  if (!admin) {
    fail('admin', 'no ADMIN user');
    closeDb();
    process.exitCode = 1;
    printSummary(results);
    return;
  }

  const token = signSession({
    userId: admin.id,
    role: 'ADMIN',
    selectedClientId: client?.id || null,
    selectedWebsiteId: website?.id || null,
    exp: Date.now() + 60 * 60 * 1000,
  });
  const cookie = `${COOKIE}=${token}`;

  const httpGets = [
    '/api/session',
    '/api/agency/overview',
    '/api/clients',
    '/api/presets',
  ];
  if (client) {
    httpGets.push(`/api/clients/${client.id}/overview`);
    httpGets.push(`/api/clients/${client.id}/websites`);
    httpGets.push(`/api/clients/${client.id}/research`);
  }
  if (website) {
    httpGets.push(
      '/api/overview',
      '/api/integrations',
      '/api/reports',
      '/api/report-sections',
      '/api/platforms/google-ads',
      '/api/platforms/meta',
      '/api/platforms/ga4',
      '/api/platforms/gsc'
    );
  }

  for (const path of httpGets) {
    const r = await req('GET', path, { cookie });
    if (r.status >= 400) {
      fail(path, r.json || r.status);
    } else {
      ok(path, r.status);
    }
  }

  if (website) {
    const stale = await req('POST', '/api/integrations/sync-stale', {
      cookie,
      body: { website_id: website.id, dry_run: true },
    });
    if (stale.status >= 400 || !stale.json?.ok || !stale.json?.dryRun) {
      fail('/api/integrations/sync-stale', stale.json || stale.status);
    } else {
      ok(
        '/api/integrations/sync-stale',
        `fresh=${(stale.json.fresh || []).length} would=${(stale.json.would_sync || []).length}`
      );
    }
  }

  if (website) {
    const reports = await req('GET', '/api/reports', { cookie });
    const list = reports.json?.reports || [];
    if (list[0]?.id) {
      const one = await req('GET', `/api/reports/${list[0].id}`, { cookie });
      if (one.status >= 400) fail(`/api/reports/${list[0].id}`, one.json);
      else ok(`/api/reports/${list[0].id}`);
    }
  }

  for (const path of [
    '/api/integrations/google/status',
    '/api/integrations/meta/status',
  ]) {
    const r = await req('GET', path, { cookie });
    if (r.status >= 500) fail(path, r.json || r.status);
    else ok(path, r.status);
  }

  const pwdBad = await req('POST', '/api/account/password', {
    cookie,
    body: { current_password: '__wrong__', new_password: 'abcdefghij' },
  });
  if (pwdBad.status === 401) ok('/api/account/password (reject bad current)', 401);
  else fail('/api/account/password (reject bad current)', pwdBad.json || pwdBad.status);

  const pwdShort = await req('POST', '/api/account/password', {
    cookie,
    body: { current_password: 'x', new_password: 'short' },
  });
  if (pwdShort.status === 400) ok('/api/account/password (reject short)', 400);
  else fail('/api/account/password (reject short)', pwdShort.json || pwdShort.status);

  closeDb();
  printSummary(results);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
