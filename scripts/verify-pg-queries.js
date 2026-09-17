'use strict';

require('dotenv').config();

const { migrate, closeDb } = require('../src/lib/db');
const { overviewAdmin, overviewClient } = require('../src/lib/metrics/views');
const { buildKpis, listClients } = require('../src/lib/clients');
const { resolvePreset } = require('../src/lib/dates');

let exitCode = 0;

function check(label, fn) {
  try {
    const result = fn();
    console.log(`✓  ${label}`);
    return result;
  } catch (e) {
    console.error(`✗  ${label}: ${e.message}`);
    exitCode = 1;
    return null;
  }
}

console.log('--- migrate ---');
check('migrate()', () => migrate());

console.log('\n--- overviewAdmin ---');
const admin = check('overviewAdmin()', () => {
  const d = overviewAdmin();
  console.log('   totals:', JSON.stringify(d.totals));
  console.log('   kpis (organic_clicks):', d.kpis.organic_clicks, typeof d.kpis.organic_clicks);
  console.log('   attention rows:', d.attention.length);
  return d;
});

console.log('\n--- overviewClient ---');
const clients = check('listClients()', () => listClients());
if (clients && clients.length) {
  const clientId = clients[0].id;
  console.log('   using client id:', clientId, '(' + clients[0].name + ')');
  check(`overviewClient(${clientId})`, () => {
    const d = overviewClient(clientId);
    console.log('   totals:', JSON.stringify(d.totals));
    return d;
  });
} else {
  console.log('   (no clients found — skipping overviewClient)');
}

console.log('\n--- buildKpis ---');
const range = resolvePreset('last_30');
if (clients && clients.length) {
  const { getDb } = require('../src/lib/db');
  const site = getDb()
    .prepare(`SELECT id FROM websites LIMIT 1`)
    .get();
  if (site) {
    check(`buildKpis(${site.id}, ${range.from}, ${range.to})`, () => {
      const d = buildKpis(site.id, range.from, range.to);
      console.log('   kpis:', JSON.stringify(d.kpis));
      const row = d.bySource.gsc?.[0];
      if (row) {
        console.log('   sample row clicks type:', typeof row.clicks, '=', row.clicks);
        console.log('   sample row spend type:', typeof row.spend, '=', row.spend);
      }
      return d;
    });
  } else {
    console.log('   (no websites — skipping buildKpis)');
  }
}

console.log('\n--- COUNT returns number check ---');
check('COUNT(*) returns number', () => {
  const { getDb } = require('../src/lib/db');
  const r = getDb().prepare(`SELECT COUNT(*) AS c FROM clients`).get();
  const t = typeof r.c;
  console.log('   COUNT(*) =', r.c, 'typeof =', t);
  if (t !== 'number') throw new Error(`COUNT returned ${t}, expected number`);
  return r;
});

console.log('\n--- FLOAT8 returns number check ---');
check('DOUBLE PRECISION returns number', () => {
  const { getDb } = require('../src/lib/db');
  const r = getDb()
    .prepare(`SELECT spend, clicks FROM metric_snapshots LIMIT 1`)
    .get();
  if (!r) {
    console.log('   (no metric_snapshots rows — skipping)');
    return null;
  }
  const ts = typeof r.spend;
  const tc = typeof r.clicks;
  console.log('   spend =', r.spend, 'typeof =', ts);
  console.log('   clicks =', r.clicks, 'typeof =', tc);
  if (r.spend !== null && ts !== 'number')
    throw new Error(`spend returned ${ts}, expected number`);
  if (r.clicks !== null && tc !== 'number')
    throw new Error(`clicks returned ${tc}, expected number`);
  return r;
});

console.log('\n--- notifications layer WEBSITE check ---');
check('notification with layer=WEBSITE', () => {
  const { getDb } = require('../src/lib/db');
  getDb()
    .prepare(
      `INSERT INTO notifications
        (user_id, client_id, layer, type, severity, title, body, href)
       VALUES (?, NULL, 'WEBSITE', 'test.verify', 'info', 'test', '', NULL)`
    )
    .run(1);
  getDb()
    .prepare(`DELETE FROM notifications WHERE type = 'test.verify'`)
    .run();
  return true;
});

console.log('\n--- website_onboarding table exists ---');
check('website_onboarding accessible', () => {
  const { tableExists } = require('../src/lib/db');
  if (!tableExists('website_onboarding'))
    throw new Error('website_onboarding table missing');
  return true;
});

console.log('\n--- client_invites table exists ---');
check('client_invites accessible', () => {
  const { tableExists } = require('../src/lib/db');
  if (!tableExists('client_invites'))
    throw new Error('client_invites table missing');
  return true;
});

closeDb();
console.log(`\n=== ${exitCode === 0 ? 'ALL PASSED' : 'SOME CHECKS FAILED'} ===`);
process.exit(exitCode);
