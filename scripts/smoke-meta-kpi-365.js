'use strict';
require('dotenv').config();
const crypto = require('crypto');
const { getDb, migrate, closeDb } = require('../src/lib/db');

async function main() {
  migrate();
  const db = getDb();
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  const body = Buffer.from(
    JSON.stringify({
      userId: admin.id,
      role: 'ADMIN',
      selectedClientId: 18,
      selectedWebsiteId: 18,
      exp: Date.now() + 3600000,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', process.env.AUTH_SECRET)
    .update(body)
    .digest('base64url');
  const cookie = `webastral_session=${body}.${sig}`;
  const res = await fetch(
    'http://127.0.0.1:4000/api/platforms/meta?preset=last_365',
    { headers: { Accept: 'application/json', Cookie: cookie } }
  );
  const j = await res.json();
  const k = j.kpis || {};
  console.log('status', res.status, 'range', j.range?.from, '→', j.range?.to);
  console.log('KPIs', {
    spend: k.spend,
    impressions: k.impressions,
    clicks: k.clicks,
    days: k.days,
    ctr: k.ctr,
    cpc: k.cpc,
    cpm: k.cpm,
    reach: k.reach,
    primary_conversions: k.primary_conversions,
  });
  console.log('rows', (j.rows || []).length);
  const sample = (j.rows || []).filter((r) => Number(r.spend) > 0).slice(0, 3);
  console.log('sample spend rows', sample);
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
