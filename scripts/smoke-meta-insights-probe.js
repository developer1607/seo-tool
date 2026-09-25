'use strict';

/** Probe Meta insights ranges for ACTIVE connections (no tokens printed). */
require('dotenv').config();
const { getDb, migrate, closeDb } = require('../src/lib/db');
const { getMetaAccessTokenPlain } = require('../src/lib/meta/agency');
const { fetchMetaDaily } = require('../src/lib/meta/ads');

async function main() {
  migrate();
  const db = getDb();
  const conns = db
    .prepare(
      `SELECT website_id, connected_by_user_id, data_identity_id,
              external_account_id, external_account_name
       FROM connections
       WHERE provider = 'META_ADS' AND status = 'ACTIVE'`
    )
    .all();

  const ranges = [
    { from: '2026-08-22', to: '2026-09-20', label: 'last_30-ish' },
    { from: '2026-01-01', to: '2026-09-20', label: 'ytd' },
    { from: '2025-01-01', to: '2026-09-20', label: 'since-2025' },
  ];

  for (const c of conns) {
    console.log(
      `\n=== ${c.external_account_id} ${c.external_account_name || ''} ===`
    );
    let token;
    try {
      token = getMetaAccessTokenPlain(
        c.connected_by_user_id,
        c.data_identity_id || null
      );
    } catch (e) {
      console.log(' token error:', e.message);
      continue;
    }
    if (!token) {
      console.log(' no token');
      continue;
    }
    for (const r of ranges) {
      try {
        const rows = await fetchMetaDaily(
          token,
          c.external_account_id,
          r.from,
          r.to
        );
        const spend = rows.reduce((s, x) => s + (Number(x.spend) || 0), 0);
        const imps = rows.reduce(
          (s, x) => s + (Number(x.impressions) || 0),
          0
        );
        console.log(
          `  ${r.label} ${r.from}→${r.to}: days=${rows.length} spend=${spend} imps=${imps}`
        );
      } catch (e) {
        console.log(`  ${r.label} ERROR:`, e.message);
      }
    }
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
