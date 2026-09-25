'use strict';

const { getDb } = require('../db');
const { getClient } = require('../clients');
const { createWebsite, getWebsite } = require('../websites');
const {
  upsertConnection,
  getConnection,
  publicConnection,
} = require('../connections');
const { probeAndActivate, syncProvider, syncMetaAds } = require('../google/sync');
const {
  getMetaAccessTokenPlain,
  agencyMetaStatus,
  findMetaAccessToken,
} = require('./agency');
const { normalizeActId } = require('./ads');
const {
  normalizeDomain,
  setClientOriginIfNew,
  recordClientSource,
} = require('../clientProvenance');
const { createNotification } = require('../notifications');

function platformsForUser(websiteId, userId) {
  const { agencyGoogleStatus } = require('../google/agency');
  const { platformStatus } = require('../clients');
  const agency = agencyGoogleStatus(userId);
  const meta = agencyMetaStatus(userId);
  return platformStatus(websiteId, {
    agencyLinked: agency.linked,
    metaLinked: meta.linked,
  });
}

function assertMetaToken(userId, identityId) {
  if (!findMetaAccessToken(userId, identityId)) {
    const err = new Error('Connect Meta under Integrations first.');
    err.code = 'NOT_CONNECTED';
    err.status = 400;
    throw err;
  }
}

function findExistingMetaLink(accountId) {
  return getDb()
    .prepare(
      `SELECT * FROM connections
       WHERE provider = 'META_ADS' AND external_account_id = ?`
    )
    .get(accountId);
}

/**
 * Link a Meta ad account to an existing website (probe + optional sync).
 */
async function linkMetaToWebsite({
  userId,
  websiteId,
  accountId: accountIdRaw,
  displayName,
  identityId = null,
  syncAfter = true,
}) {
  const site = getWebsite(websiteId);
  if (!site) {
    const err = new Error('Website not found');
    err.code = 'NEED_WEBSITE';
    err.status = 404;
    throw err;
  }
  const accountId = normalizeActId(accountIdRaw);
  const name = String(displayName || accountId).trim();
  if (!accountId) {
    const err = new Error('Select a Meta ad account');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const metaStatus = agencyMetaStatus(userId);
  const dataIdentityId = identityId || metaStatus.identityId || null;
  assertMetaToken(userId, dataIdentityId);

  const existing = findExistingMetaLink(accountId);
  if (
    existing &&
    existing.status === 'ACTIVE' &&
    Number(existing.website_id) !== Number(site.id)
  ) {
    const err = new Error('Already linked to another website');
    err.code = 'ALREADY_LINKED';
    err.status = 400;
    err.website_id = existing.website_id;
    err.client_id = existing.client_id;
    throw err;
  }

  upsertConnection({
    clientId: site.client_id,
    websiteId: site.id,
    provider: 'META_ADS',
    status: 'PENDING_SELECT',
    externalAccountId: accountId,
    externalAccountName: name,
    connectedByUserId: userId,
    dataIdentityId,
    lastError: null,
  });

  const accessToken = getMetaAccessTokenPlain(userId, dataIdentityId);
  await probeAndActivate(site.id, 'META_ADS', accessToken);

  let syncResult = null;
  if (syncAfter) {
    try {
      syncResult = await syncMetaAds(site.id, { preset: 'last_365' });
    } catch (syncErr) {
      syncResult = {
        ok: false,
        error: syncErr.message || 'Sync failed',
      };
    }
  }

  recordClientSource({
    clientId: site.client_id,
    websiteId: site.id,
    source: 'META_ADS',
    externalAccountId: accountId,
    dataIdentityId,
    createdByUserId: userId,
  });

  return {
    ok: true,
    created: false,
    client: getClient(site.client_id),
    website: getWebsite(site.id),
    connection: publicConnection(getConnection(site.id, 'META_ADS')),
    sync: syncResult,
    platforms: platformsForUser(site.id, userId),
  };
}

/**
 * Create a Meta-only client + website, then link the ad account.
 * Requires website_url (Meta does not return a site URL).
 */
async function importMetaAsClient({
  userId,
  accountId: accountIdRaw,
  displayName,
  websiteUrl,
  clientName,
  identityId = null,
  syncAfter = true,
  notify = true,
}) {
  const accountId = normalizeActId(accountIdRaw);
  const name = String(displayName || accountId).trim();
  const url = String(websiteUrl || '').trim();
  const cName = String(clientName || name).trim() || name;

  if (!accountId) {
    const err = new Error('Select a Meta ad account');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (!url || !normalizeDomain(url)) {
    const err = new Error(
      'Website URL is required to create a Meta-only client (Meta does not provide one).'
    );
    err.code = 'NEED_WEBSITE_URL';
    err.status = 400;
    throw err;
  }

  const existing = findExistingMetaLink(accountId);
  if (existing && existing.status === 'ACTIVE') {
    const err = new Error('Already linked to another website');
    err.code = 'ALREADY_LINKED';
    err.status = 400;
    err.website_id = existing.website_id;
    err.client_id = existing.client_id;
    throw err;
  }

  const metaStatus = agencyMetaStatus(userId);
  const dataIdentityId = identityId || metaStatus.identityId || null;
  assertMetaToken(userId, dataIdentityId);

  const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const info = getDb()
    .prepare(
      `INSERT INTO clients (
         name, website_url, timezone, currency, origin, created_by_user_id
       ) VALUES (?, ?, 'Asia/Kolkata', 'INR', 'META', ?)`
    )
    .run(cName, withProto, userId);
  const clientId = info.lastInsertRowid;
  setClientOriginIfNew(clientId, 'META', userId);

  const site = createWebsite(clientId, {
    name: cName,
    url: withProto,
  });

  recordClientSource({
    clientId,
    websiteId: site.id,
    source: 'META_ADS',
    externalAccountId: accountId,
    dataIdentityId,
    createdByUserId: userId,
  });

  const linked = await linkMetaToWebsite({
    userId,
    websiteId: site.id,
    accountId,
    displayName: name,
    identityId: dataIdentityId,
    syncAfter,
  });

  if (notify) {
    createNotification({
      userId,
      clientId,
      layer: 'CLIENT',
      type: 'client.imported_meta',
      severity: 'success',
      title: 'Client created from Meta',
      body: `${cName} · ${accountId}`,
      href: `/clients/${clientId}`,
    });
  }

  return {
    ...linked,
    created: true,
    client: getClient(clientId),
    website: getWebsite(site.id),
  };
}

module.exports = {
  linkMetaToWebsite,
  importMetaAsClient,
  platformsForUser,
};
