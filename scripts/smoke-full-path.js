'use strict';

/**
 * Full product path smoke (handoff #1):
 * Login → From Google Sync → Sonic Soak → Integrations sync → Overview ranges → Report
 *
 * Run with servers up: node scripts/smoke-full-path.js
 */
require('dotenv').config();

const BASE = process.env.APP_URL || 'http://127.0.0.1:3000';
const jar = {};
const results = [];

function storeCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
  for (const c of raw) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
  }
}

function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    redirect: 'manual',
    headers: {
      ...(opts.headers || {}),
      Cookie: cookieHeader(),
      ...(opts.body && !(opts.headers && opts.headers['Content-Type'])
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json, status: res.status };
}

function pass(step, detail) {
  results.push({ ok: true, step, detail });
  console.log(`OK   ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step, detail) {
  results.push({ ok: false, step, detail });
  console.log(`FAIL ${step}${detail ? ` — ${detail}` : ''}`);
}

function assert(step, cond, detail) {
  if (cond) pass(step, detail);
  else fail(step, detail);
  return cond;
}

(async () => {
  console.log(`Smoke full path @ ${BASE}\n`);

  // 1. Login
  let r = await req('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'admin123',
    }),
  });
  if (!assert('1. Login', r.status === 200, `status=${r.status}`)) {
    console.error(r.text.slice(0, 300));
    process.exit(1);
  }

  r = await req('/api/session');
  const session0 = r.json;
  assert(
    '1b. Session',
    Boolean(session0?.user?.email),
    session0?.user?.email || 'no user'
  );
  assert(
    '1c. Google env',
    Boolean(session0?.platform?.google),
    `google=${session0?.platform?.google}`
  );

  // 2. From Google Sync (discover)
  r = await req('/api/integrations/google/discover');
  const discover = r.json;
  if (r.status !== 200) {
    fail('2. Discover', `status=${r.status} ${r.text.slice(0, 200)}`);
  } else if (discover?.needsReauth || discover?.code === 'NEEDS_REAUTH') {
    fail(
      '2. Discover reconnect needed',
      discover.error ||
        'Open /google-accounts → Connect agency Google (Reconnect), then re-run smoke'
    );
  } else if (!discover?.connected) {
    fail(
      '2. Discover connected',
      'not connected — open /google-accounts and Connect agency Google first'
    );
  } else {
    pass(
      '2. Discover',
      `source=${discover.source} available=${discover.available} imported=${discover.imported} ga4=${discover.ga4?.length || 0} gsc=${discover.gsc?.length || 0}`
    );
  }

  // Page check
  r = await req('/google-accounts');
  assert('2b. Page /google-accounts', r.status >= 200 && r.status < 400, `${r.status}`);

  // 3. Find or use Sonic Soak client
  r = await req('/api/clients');
  const clients = r.json?.clients || [];
  let sonic =
    clients.find((c) => /sonic/i.test(c.name || '')) ||
    clients.find((c) => /sonicsoak/i.test(c.website_url || ''));

  if (!sonic && discover?.connected) {
    const gsc =
      discover.gsc?.find((s) => /sonicsoak/i.test(s.name || s.id || s.url || '')) ||
      discover.gsc?.find((s) => !s.linked);
    const ga4 =
      discover.ga4?.find((p) => /sonic/i.test(p.name || '')) ||
      discover.ga4?.find((p) => !p.linked && p.url);

    if (gsc && !gsc.linked) {
      r = await req('/api/integrations/google/import', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'GSC',
          external_account_id: gsc.id,
          name: gsc.name,
          client_name: 'Sonic Soak',
          url: gsc.url || undefined,
          sync: true,
        }),
      });
      if (r.status === 200 || r.status === 201) {
        sonic = r.json?.client;
        pass('3. Import Sonic via GSC', `client=${sonic?.id} ${sonic?.name}`);
      } else {
        fail('3. Import Sonic via GSC', `${r.status} ${r.json?.error || r.text.slice(0, 200)}`);
      }
    } else if (ga4 && !ga4.linked && ga4.url) {
      r = await req('/api/integrations/google/import', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'GA4',
          external_account_id: ga4.id,
          name: ga4.name,
          client_name: ga4.account ? `${ga4.account}` : 'Sonic Soak',
          url: ga4.url,
          sync: true,
        }),
      });
      if (r.status === 200 || r.status === 201) {
        sonic = r.json?.client;
        pass('3. Import Sonic via GA4', `client=${sonic?.id} ${sonic?.name}`);
      } else {
        fail('3. Import Sonic via GA4', `${r.status} ${r.json?.error || r.text.slice(0, 200)}`);
      }
    } else if (sonic) {
      pass('3. Sonic already present', sonic.name);
    } else {
      // fall back to any client
      sonic = clients[0];
      if (sonic) {
        pass('3. Fallback client (no Sonic)', sonic.name);
      } else {
        fail('3. No client to open', 'import From Google or add a client');
      }
    }
  } else if (sonic) {
    pass('3. Open Sonic Soak', `${sonic.id} ${sonic.name}`);
  } else if (clients[0]) {
    sonic = clients[0];
    pass('3. Fallback client', sonic.name);
  } else {
    fail('3. No clients', 'need import or seed client');
  }

  if (!sonic) {
    console.log('\nStopped — no client available for remaining steps.');
    process.exit(1);
  }

  r = await req(`/api/clients/${sonic.id}/select`, {
    method: 'POST',
    body: '{}',
  });
  assert('3b. Select client', r.status === 200, `${sonic.name}`);
  let session = r.json;
  let website = session?.selectedWebsite;

  if (!website && session?.websites?.length) {
    r = await req(`/api/websites/${session.websites[0].id}/select`, {
      method: 'POST',
      body: '{}',
    });
    session = r.json;
    website = session?.selectedWebsite;
  }

  assert(
    '3c. Website selected',
    Boolean(website?.id),
    website ? `${website.id} ${website.url}` : 'none'
  );

  if (!website) {
    console.log('\nStopped — client has no website.');
    process.exit(1);
  }

  // 4. Integrations status + sync GA4/GSC
  r = await req('/api/integrations');
  const platforms = r.json?.platforms || [];
  assert('4. Integrations list', r.status === 200, `${platforms.length} platforms`);

  const ga4 = platforms.find((p) => p.key === 'GOOGLE_ANALYTICS');
  const gsc = platforms.find((p) => p.key === 'GOOGLE_SEARCH_CONSOLE');
  pass(
    '4a. GA4 status',
    `${ga4?.status || 'missing'} ${ga4?.account_name || ''}`.trim()
  );
  pass(
    '4b. GSC status',
    `${gsc?.status || 'missing'} ${gsc?.account_name || ''}`.trim()
  );

  async function trySync(provider, label) {
    const p = platforms.find((x) => x.key === provider);
    if (!p) {
      fail(`4. Sync ${label}`, 'platform missing');
      return null;
    }
    if (p.status === 'NEEDS_REAUTH') {
      fail(
        `4. Sync ${label}`,
        'NEEDS_REAUTH — Connect Google again on Integrations or From Google'
      );
      return null;
    }
    if (p.status !== 'ACTIVE') {
      fail(`4. Sync ${label}`, `status=${p.status} (need ACTIVE)`);
      return null;
    }
    const syncRes = await req(`/api/integrations/${provider}/sync`, {
      method: 'POST',
      body: JSON.stringify({ preset: 'last_30' }),
    });
    if (syncRes.status === 200) {
      pass(
        `4. Sync ${label}`,
        `days=${syncRes.json?.days ?? '?'} status=${syncRes.json?.platforms?.find((x) => x.key === provider)?.status}`
      );
      return syncRes.json;
    }
    const code = syncRes.json?.code || '';
    fail(
      `4. Sync ${label}`,
      `${syncRes.status} ${code} ${syncRes.json?.error || syncRes.text.slice(0, 200)}`
    );
    return null;
  }

  await trySync('GOOGLE_ANALYTICS', 'GA4');
  await trySync('GOOGLE_SEARCH_CONSOLE', 'GSC');

  const ads = platforms.find((p) => p.key === 'GOOGLE_ADS');
  pass(
    '4d. Ads status',
    `${ads?.status || 'missing'} ${ads?.account_name || ''} ${ads?.last_error || ''}`.trim()
  );
  if (ads?.status === 'ACTIVE') {
    await trySync('GOOGLE_ADS', 'Ads');
  } else {
    pass(
      '4e. Sync Ads',
      `skipped (status=${ads?.status || 'missing'} — link Ads explicitly if needed)`
    );
  }

  r = await req('/integrations');
  assert('4c. Page /integrations', r.status >= 200 && r.status < 400, `${r.status}`);

  // 5. Overview KPIs + date range change
  r = await req('/api/overview?preset=last_30');
  const ov30 = r.json;
  if (!assert('5. Overview last_30', r.status === 200, ov30?.range?.label)) {
    fail('5. Overview body', r.text.slice(0, 200));
  } else {
    pass(
      '5a. KPIs last_30',
      `organic=${ov30.kpis?.organic_clicks} sessions=${ov30.kpis?.sessions} spend=${ov30.kpis?.spend}`
    );
  }

  r = await req('/api/overview?preset=last_7');
  const ov7 = r.json;
  assert('5b. Overview last_7', r.status === 200, ov7?.range?.label);

  const rangeChanged =
    ov30?.range?.from !== ov7?.range?.from || ov30?.range?.to !== ov7?.range?.to;
  assert(
    '5c. Date range changes',
    rangeChanged,
    `30:${ov30?.range?.from}→${ov30?.range?.to} vs 7:${ov7?.range?.from}→${ov7?.range?.to}`
  );

  r = await req('/api/platforms/ga4?preset=last_30');
  assert(
    '5d. Platform GA4',
    r.status === 200,
    `status=${r.json?.status?.status} rows=${r.json?.rows?.length ?? 0}`
  );

  r = await req('/api/platforms/gsc?preset=last_30');
  assert(
    '5e. Platform GSC',
    r.status === 200,
    `status=${r.json?.status?.status} rows=${r.json?.rows?.length ?? 0}`
  );

  r = await req('/');
  assert('5f. Page /', r.status >= 200 && r.status < 400, `${r.status}`);

  // 6. Report — list / create / open
  r = await req('/api/reports');
  let reports = r.json?.reports || [];
  assert('6. Reports list', r.status === 200, `${reports.length} reports`);

  let reportId = reports[0]?.id;
  if (!reportId) {
    r = await req('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        title: `${sonic.name} smoke report`,
        preset: 'last_30',
      }),
    });
    if (r.status === 201 || r.status === 200) {
      reportId = r.json?.report?.id;
      pass('6a. Generate report', `id=${reportId}`);
    } else {
      fail('6a. Generate report', `${r.status} ${r.json?.error || r.text.slice(0, 200)}`);
    }
  } else {
    pass('6a. Existing report', `id=${reportId}`);
  }

  if (reportId) {
    r = await req(`/api/reports/${reportId}`);
    assert(
      '6b. Open report API',
      r.status === 200,
      `title=${r.json?.report?.title} organic=${r.json?.kpis?.organic_clicks}`
    );
    r = await req(`/reports/${reportId}`);
    assert('6c. Page /reports/{id}', r.status >= 200 && r.status < 400, `${r.status}`);
  }

  r = await req('/reports');
  assert('6d. Page /reports', r.status >= 200 && r.status < 400, `${r.status}`);

  // Summary
  const failed = results.filter((x) => !x.ok);
  const passed = results.filter((x) => x.ok);
  console.log('\n---');
  console.log(`Passed ${passed.length}, failed ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
    process.exit(1);
  }
  console.log('\nFull path OK.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
