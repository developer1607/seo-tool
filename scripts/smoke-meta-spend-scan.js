'use strict';

require('dotenv').config();
const { getDb, migrate, closeDb } = require('../src/lib/db');
const { getMetaAccessTokenPlain, agencyMetaStatus } = require('../src/lib/meta/agency');
const { GRAPH_VERSION } = require('../src/lib/meta/oauth');
const { listMetaAdAccounts } = require('../src/lib/meta/ads');

async function main() {
  migrate();
  const db = getDb();
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  const st = agencyMetaStatus(admin.id);
  const token = getMetaAccessTokenPlain(admin.id, st.identityId || null);
  const accounts = await listMetaAdAccounts(token);
  console.log('ad accounts', accounts.length);

  // Enrich with amount_spent via batch-ish sequential (cap 12)
  for (const a of accounts.slice(0, 12)) {
    const params = new URLSearchParams({
      fields: 'id,name,account_status,amount_spent,currency',
      access_token: token,
    });
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${a.id}?${params}`
    );
    const j = await res.json();
    if (j.error) {
      console.log(a.id, 'ERR', j.error.message);
      continue;
    }
    console.log(
      `${a.id} | ${j.name} | status=${j.account_status} | spent=${j.amount_spent} ${j.currency || ''}`
    );
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
