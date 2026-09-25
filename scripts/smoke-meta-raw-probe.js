'use strict';

require('dotenv').config();
const { getDb, migrate, closeDb } = require('../src/lib/db');
const { getMetaAccessTokenPlain } = require('../src/lib/meta/agency');
const { GRAPH_VERSION } = require('../src/lib/meta/oauth');

async function graph(path, token, query) {
  const params = new URLSearchParams({ ...query, access_token: token });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}${path}?${params}`
  );
  const json = await res.json().catch(() => ({}));
  return {
    http: res.status,
    error: json.error?.message || null,
    code: json.error?.code || null,
    dataLen: Array.isArray(json.data) ? json.data.length : null,
    sample: Array.isArray(json.data) ? json.data[0] || null : null,
    account: json.id
      ? {
          id: json.id,
          name: json.name,
          account_status: json.account_status,
          amount_spent: json.amount_spent,
          disable_reason: json.disable_reason,
        }
      : null,
  };
}

async function main() {
  migrate();
  const db = getDb();
  const c = db
    .prepare(
      `SELECT connected_by_user_id, data_identity_id, external_account_id,
              external_account_name
       FROM connections
       WHERE provider = 'META_ADS'
       ORDER BY CASE WHEN external_account_name ILIKE '%webtoners%' THEN 0 ELSE 1 END, id
       LIMIT 1`
    )
    .get();
  if (!c) throw new Error('no meta connection');
  console.log('probing', c.external_account_id, c.external_account_name);
  const token = getMetaAccessTokenPlain(
    c.connected_by_user_id,
    c.data_identity_id || null
  );
  const id = c.external_account_id;
  console.log(
    'account',
    await graph(`/${id}`, token, {
      fields:
        'id,name,account_status,currency,amount_spent,balance,disable_reason',
    })
  );
  console.log(
    'insights_maximum',
    await graph(`/${id}/insights`, token, {
      fields: 'spend,impressions,clicks,date_start',
      date_preset: 'maximum',
      time_increment: '1',
      level: 'account',
      limit: '5',
    })
  );
  console.log(
    'insights_last_90d',
    await graph(`/${id}/insights`, token, {
      fields: 'spend,impressions,clicks,date_start',
      date_preset: 'last_90d',
      time_increment: '1',
      level: 'account',
      limit: '5',
    })
  );
  console.log(
    'campaigns',
    await graph(`/${id}/campaigns`, token, {
      fields: 'id,name,status,effective_status',
      limit: '5',
    })
  );
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
