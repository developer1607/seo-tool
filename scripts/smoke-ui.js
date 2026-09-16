'use strict';

/**
 * Smoke-test UI routes + key APIs (no browser).
 * Run: node scripts/smoke-ui.js
 */
require('dotenv').config();

const BASE = process.env.APP_URL || 'http://127.0.0.1:3000';
const jar = {};

function storeCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
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
  return res;
}

const pages = [
  '/login',
  '/',
  '/clients',
  '/clients/new',
  '/google-accounts',
  '/integrations',
  '/reports',
  '/reports/generate',
  '/settings',
  '/keyword-tracking',
  '/site-audit',
  '/backlinks',
  '/projects',
];

(async () => {
  const fails = [];
  let ok = 0;

  let r = await req('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'admin123',
    }),
  });
  if (r.status !== 200) {
    console.error('LOGIN FAIL', r.status, await r.text());
    process.exit(1);
  }
  console.log('OK  POST /api/login');

  const session = await (await req('/api/session')).json();
  console.log(
    'OK  session user=',
    session.user?.email,
    'clients=',
    session.clients?.length,
    'website=',
    session.selectedWebsite?.id || null
  );

  for (const path of pages) {
    r = await req(path);
    const code = r.status;
    // redirects (projects, connect-google) may be 307/308
    if (code >= 200 && code < 400) {
      console.log(`OK  ${code} ${path}`);
      ok += 1;
    } else {
      console.log(`FAIL ${code} ${path}`);
      fails.push(`${path}→${code}`);
    }
  }

  if (session.clients?.[0]?.id) {
    const id = session.clients[0].id;
    for (const path of [`/clients/${id}`, `/clients/${id}/add-website`]) {
      r = await req(path);
      if (r.status >= 200 && r.status < 400) {
        console.log(`OK  ${r.status} ${path}`);
        ok += 1;
      } else {
        console.log(`FAIL ${r.status} ${path}`);
        fails.push(`${path}→${r.status}`);
      }
    }
  }

  const apis = [
    '/api/session',
    '/api/clients',
    '/api/integrations/google/status',
  ];
  for (const path of apis) {
    r = await req(path);
    if (r.status === 200) {
      console.log(`OK  ${r.status} ${path}`);
      ok += 1;
    } else {
      console.log(`FAIL ${r.status} ${path}`);
      fails.push(`${path}→${r.status}`);
    }
  }

  console.log('\n---');
  console.log(`Passed ${ok}, failed ${fails.length}`);
  if (fails.length) {
    console.log(fails.join('\n'));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
