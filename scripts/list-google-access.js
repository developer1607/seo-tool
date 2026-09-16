'use strict';

require('dotenv').config();
const { getDb, migrate } = require('../src/lib/db');
const { findGoogleTokenConnection } = require('../src/lib/connections');
const { getAccessTokenForWebsite } = require('../src/lib/google/sync');
const { listGa4Properties } = require('../src/lib/google/ga4');
const { listGscSites } = require('../src/lib/google/gsc');

migrate();
const db = getDb();

const connections = db
  .prepare(
    `SELECT id, client_id, website_id, provider, status,
            external_account_id, external_account_name,
            CASE WHEN encrypted_refresh_token IS NOT NULL AND length(encrypted_refresh_token) > 0
              THEN 1 ELSE 0 END AS has_token,
            last_sync_at, last_error
     FROM connections
     WHERE provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE')
     ORDER BY website_id, provider`
  )
  .all();

console.log('=== Stored Google connections ===');
console.log(JSON.stringify(connections, null, 2));

const withToken = connections.find((c) => c.has_token);
if (!withToken) {
  console.log(
    '\nNo Google refresh token in DB yet. Connect Google once in Integrations, then re-run this script.'
  );
  process.exit(0);
}

const websiteId = withToken.website_id;
console.log('\n=== Accounts visible to the connected Google login ===');
console.log('(website_id=' + websiteId + ')');

(async () => {
  try {
    if (!findGoogleTokenConnection(websiteId)) {
      throw new Error('Token row missing');
    }
    const accessToken = await getAccessTokenForWebsite(websiteId);
    const [ga4, gsc] = await Promise.all([
      listGa4Properties(accessToken),
      listGscSites(accessToken),
    ]);
    console.log('\nGA4 properties (' + ga4.length + '):');
    for (const p of ga4) {
      console.log(' -', p.id, '|', p.name, p.account ? '(' + p.account + ')' : '');
    }
    console.log('\nSearch Console sites (' + gsc.length + '):');
    for (const s of gsc) {
      console.log(' -', s.id, '|', s.name);
    }
    if (ga4.length === 0 && gsc.length === 0) {
      console.log(
        '\nThis Google login has no GA4/GSC access (or APIs not enabled / wrong account).'
      );
    } else {
      console.log(
        '\nThese are all properties/sites THIS Google login can see — including other clients’ accounts if they invited this email.'
      );
    }
  } catch (e) {
    console.error('\nFailed to list resources:', e.message);
    process.exit(1);
  }
})();
