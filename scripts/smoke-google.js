'use strict';

/**
 * Smoke checks that do not call Google with a user token.
 * Run: node scripts/smoke-google.js
 */
require('dotenv').config();

const assert = require('assert');
const { encrypt, decrypt, signState, verifyState } = require('../src/lib/crypto');
const { googleConfigured, buildAuthUrl, redirectUri } = require('../src/lib/google/oauth');

function ok(label) {
  console.log(`OK  ${label}`);
}

try {
  assert.equal(googleConfigured(), true, 'GOOGLE_CLIENT_ID/SECRET must be set');
  ok('googleConfigured');

  assert.equal(
    redirectUri(),
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
  ok('redirectUri');

  const url = buildAuthUrl({ websiteId: 1, userId: 1 });
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
  assert.ok(url.includes('access_type=offline'));
  assert.ok(url.includes(encodeURIComponent('analytics.readonly')));
  assert.ok(url.includes(encodeURIComponent('webmasters.readonly')));
  ok('buildAuthUrl');

  const round = decrypt(encrypt('refresh-token-sample'));
  assert.equal(round, 'refresh-token-sample');
  ok('encrypt/decrypt');

  const state = signState({ websiteId: 1, userId: 2, exp: Date.now() + 60000 });
  const parsed = verifyState(state);
  assert.equal(parsed.websiteId, 1);
  assert.equal(parsed.userId, 2);
  ok('sign/verify state');

  assert.equal(verifyState('bad.token'), null);
  ok('reject bad state');

  console.log('\nAll smoke checks passed. Complete Connect in the browser to hit live APIs.');
} catch (e) {
  console.error('FAIL', e.message);
  process.exit(1);
}
