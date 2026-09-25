'use strict';

require('dotenv').config();
const { getDb, migrate, closeDb } = require('../src/lib/db');
const {
  getMetaAccessTokenPlain,
  agencyMetaStatus,
} = require('../src/lib/meta/agency');
const { GRAPH_VERSION } = require('../src/lib/meta/oauth');

async function call(path, token, query) {
  const params = new URLSearchParams({ ...query, access_token: token });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}${path}?${params}`
  );
  const json = await res.json().catch(() => ({}));
  return {
    http: res.status,
    error: json.error
      ? `${json.error.code} ${json.error.error_subcode || ''} ${json.error.message}`
      : null,
    dataLen: Array.isArray(json.data) ? json.data.length : null,
    sample: Array.isArray(json.data) ? json.data.slice(0, 2) : null,
    summary: json.summary || null,
  };
}

async function main() {
  migrate();
  const db = getDb();
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`)
    .get();
  const st = agencyMetaStatus(admin.id);
  const token = getMetaAccessTokenPlain(admin.id, st.identityId || null);

  const targets = [
    'act_10200268588691251', // Sofkul — has spend, we imported
    'act_2009020426510342', // Anayiah Grewal — high spend
    'act_22393159', // linked, has spend
  ];

  for (const id of targets) {
    console.log('\n===', id, '===');
    console.log(
      'account',
      await call(`/${id}`, token, {
        fields: 'name,amount_spent,account_status,timezone_name',
      })
    );
    const variants = [
      {
        label: 'preset_maximum',
        q: {
          fields: 'spend,impressions,clicks,reach,cpc,cpm,actions,date_start',
          date_preset: 'maximum',
          level: 'account',
        },
      },
      {
        label: 'preset_last_year',
        q: {
          fields: 'spend,impressions,clicks,date_start',
          date_preset: 'last_year',
          time_increment: '1',
          level: 'account',
          limit: '10',
        },
      },
      {
        label: 'range_2024',
        q: {
          fields: 'spend,impressions,clicks,date_start',
          time_range: JSON.stringify({
            since: '2024-01-01',
            until: '2024-12-31',
          }),
          time_increment: '1',
          level: 'account',
          limit: '10',
        },
      },
      {
        label: 'no_increment',
        q: {
          fields: 'spend,impressions,clicks',
          date_preset: 'maximum',
          level: 'account',
        },
      },
    ];
    for (const v of variants) {
      const r = await call(`/${id}/insights`, token, v.q);
      console.log(v.label, JSON.stringify(r));
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
