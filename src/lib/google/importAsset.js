'use strict';

const { getDb } = require('../db');
const { getClient, platformStatus } = require('../clients');
const { getWebsite, createWebsite } = require('../websites');
const {
  upsertConnection,
  getConnection,
  publicConnection,
} = require('../connections');
const {
  getGa4PropertyWebsiteUrl,
  normalizeWebsiteUrl,
} = require('./ga4');
const { listGscSites } = require('./gsc');
const { normalizeCustomerId } = require('./ads');
const { probeAndActivate, syncProvider } = require('./sync');
const {
  touchAdminGoogleToken,
  healGoogleWebsiteTokens,
  agencyGoogleStatus,
} = require('./agency');
const { createNotification } = require('../notifications');

function hostKey(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function guessUrlFromGsc(siteUrl) {
  const raw = String(siteUrl || '').trim();
  if (!raw) return null;
  if (raw.startsWith('sc-domain:')) {
    return normalizeWebsiteUrl(`https://${raw.slice('sc-domain:'.length)}`);
  }
  return normalizeWebsiteUrl(raw);
}

function platformsForUser(websiteId, userId) {
  const agency = agencyGoogleStatus(userId);
  const { agencyMetaStatus } = require('../meta/agency');
  const meta = agencyMetaStatus(userId);
  return platformStatus(websiteId, {
    agencyLinked: agency.linked,
    metaLinked: meta.linked,
  });
}

function findWebsiteByHost(url) {
  const want = hostKey(url);
  if (!want) return null;
  // Prefer indexed scan by URL fragment for large site counts
  const candidates = getDb()
    .prepare(
      `SELECT * FROM websites WHERE lower(url) LIKE ? OR lower(url) LIKE ? LIMIT 40`
    )
    .all(`%${want}%`, `%www.${want}%`);
  const hit = candidates.find((s) => hostKey(s.url) === want);
  if (hit) return hit;
  const sites = getDb().prepare(`SELECT * FROM websites`).all();
  return sites.find((s) => hostKey(s.url) === want) || null;
}

/**
 * Import one Google inventory row (GA4 / GSC / ADS).
 * @returns {Promise<object>} result payload (ok / repaired / linked)
 * @throws Error with .code and optional .status, .client_id, .website_id
 */
async function importGoogleAsset({
  userId,
  accessToken,
  encrypted,
  dataIdentityId,
  kind,
  externalId,
  displayName,
  clientName,
  url: urlIn,
  syncAfter = true,
  targetWebsiteId = null,
  loginCustomerId = '',
  alsoGscId = '',
  alsoGa4Id = '',
  notify = true,
}) {
  const kindU = String(kind || '').toUpperCase();
  const externalAccountId = String(externalId || '').trim();
  const name = String(displayName || externalAccountId).trim();
  const cName = String(clientName || name).trim();

  if (!externalAccountId) {
    const err = new Error('external_account_id required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (kindU !== 'GA4' && kindU !== 'GSC' && kindU !== 'ADS') {
    const err = new Error('kind must be GA4, GSC, or ADS');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (kindU === 'ADS') {
    const siteId = Number(targetWebsiteId || 0);
    if (!siteId) {
      const err = new Error(
        'Pick a website first (client + website), then link this Ads account to it.'
      );
      err.code = 'NEED_WEBSITE';
      err.status = 400;
      throw err;
    }
    const site = getWebsite(siteId);
    if (!site) {
      const err = new Error('Website not found');
      err.code = 'NEED_WEBSITE';
      err.status = 404;
      throw err;
    }
    const accountId = normalizeCustomerId(externalAccountId);
    const existing = getDb()
      .prepare(
        `SELECT * FROM connections WHERE provider = 'GOOGLE_ADS' AND external_account_id = ?`
      )
      .get(accountId);
    if (
      existing &&
      existing.status === 'ACTIVE' &&
      existing.website_id !== site.id
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
      provider: 'GOOGLE_ADS',
      status: 'PENDING_SELECT',
      encryptedRefreshToken: encrypted,
      externalAccountId: accountId,
      externalAccountName: name,
      loginCustomerId:
        normalizeCustomerId(loginCustomerId) || accountId,
      connectedByUserId: userId,
      dataIdentityId,
      lastError: null,
    });
    touchAdminGoogleToken(userId, encrypted);
    healGoogleWebsiteTokens(encrypted, userId, null, dataIdentityId);
    await probeAndActivate(site.id, 'GOOGLE_ADS', accessToken);
    let syncResult = null;
    if (syncAfter) {
      try {
        syncResult = await syncProvider(site.id, 'GOOGLE_ADS');
      } catch (syncErr) {
        syncResult = {
          ok: false,
          error: syncErr.message || 'Sync failed',
        };
      }
    }
    return {
      ok: true,
      linked: true,
      client: getClient(site.client_id),
      website: site,
      sync: syncResult,
      platforms: platformsForUser(site.id, userId),
    };
  }

  const provider =
    kindU === 'GA4' ? 'GOOGLE_ANALYTICS' : 'GOOGLE_SEARCH_CONSOLE';
  const existing = getDb()
    .prepare(
      `SELECT * FROM connections WHERE provider = ? AND external_account_id = ?`
    )
    .get(provider, externalAccountId);

  if (existing) {
    if (
      ['NEEDS_REAUTH', 'ERROR', 'PENDING_SELECT', 'PENDING_AUTH'].includes(
        existing.status
      )
    ) {
      upsertConnection({
        clientId: existing.client_id,
        websiteId: existing.website_id,
        provider,
        status: 'PENDING_SELECT',
        encryptedRefreshToken: encrypted,
        externalAccountId: externalAccountId,
        externalAccountName: name,
        connectedByUserId: userId,
        dataIdentityId,
        lastError: null,
      });
      touchAdminGoogleToken(userId, encrypted);
      healGoogleWebsiteTokens(encrypted, userId, null, dataIdentityId);
      await probeAndActivate(existing.website_id, provider, accessToken);
      let syncResult = null;
      if (syncAfter) {
        try {
          syncResult = await syncProvider(existing.website_id, provider);
        } catch (syncErr) {
          syncResult = {
            ok: false,
            error: syncErr.message || 'Sync failed',
          };
        }
      }
      return {
        ok: true,
        repaired: true,
        client: getClient(existing.client_id),
        website: getWebsite(existing.website_id),
        sync: syncResult,
        platforms: platformsForUser(existing.website_id, userId),
      };
    }
    if (existing.status === 'ACTIVE') {
      const err = new Error(
        'Already imported. Open the client instead of importing again.'
      );
      err.code = 'ALREADY_LINKED';
      err.status = 400;
      err.website_id = existing.website_id;
      err.client_id = existing.client_id;
      throw err;
    }
  }

  let url = normalizeWebsiteUrl(String(urlIn || '').trim());
  if (!url && kindU === 'GSC') {
    url = guessUrlFromGsc(externalAccountId);
  }
  if (!url && kindU === 'GA4') {
    url = await getGa4PropertyWebsiteUrl(accessToken, externalAccountId);
  }
  if (!url) {
    const gscSites = await listGscSites(accessToken);
    const match = gscSites.find((s) => {
      const gUrl = guessUrlFromGsc(s.id);
      if (!gUrl) return false;
      const host = hostKey(gUrl);
      return (
        host &&
        (name.toLowerCase().includes(host.split('.')[0]) ||
          host.includes(name.toLowerCase().replace(/\s+/g, '')))
      );
    });
    if (match) url = guessUrlFromGsc(match.id);
  }
  if (!url) {
    const err = new Error(
      'No website URL found on this Google property. Open Search Console import for that domain, or add the URL manually after creating the client.'
    );
    err.code = 'NO_WEBSITE_URL';
    err.status = 400;
    throw err;
  }

  // Prefer attaching to an existing website with the same hostname (bulk-safe).
  let site = findWebsiteByHost(url);
  let clientId = site ? site.client_id : null;
  let created = false;

  if (!site) {
    const info = getDb()
      .prepare(
        `INSERT INTO clients (name, website_url, timezone, currency)
         VALUES (?, ?, 'Asia/Kolkata', 'INR')`
      )
      .run(cName, url);
    clientId = info.lastInsertRowid;
    site = createWebsite(clientId, { name, url });
    created = true;
  }

  upsertConnection({
    clientId,
    websiteId: site.id,
    provider,
    status: 'PENDING_SELECT',
    encryptedRefreshToken: encrypted,
    externalAccountId: externalAccountId,
    externalAccountName: name,
    connectedByUserId: userId,
    dataIdentityId,
    lastError: null,
  });

  touchAdminGoogleToken(userId, encrypted);
  healGoogleWebsiteTokens(encrypted, userId, null, dataIdentityId);
  await probeAndActivate(site.id, provider, accessToken);

  let syncResult = null;
  if (syncAfter) {
    try {
      syncResult = await syncProvider(site.id, provider);
    } catch (syncErr) {
      syncResult = { ok: false, error: syncErr.message || 'Sync failed' };
    }
  }

  let autoGsc = alsoGscId ? String(alsoGscId).trim() : '';
  if (kindU === 'GA4' && !autoGsc) {
    const gscSites = await listGscSites(accessToken);
    const want = hostKey(url);
    const hit = gscSites.find(
      (s) => hostKey(guessUrlFromGsc(s.id) || '') === want
    );
    if (hit) autoGsc = hit.id;
  }

  async function linkExtra(extraProvider, id, extraName) {
    if (!id) return null;
    try {
      upsertConnection({
        clientId,
        websiteId: site.id,
        provider: extraProvider,
        status: 'PENDING_SELECT',
        encryptedRefreshToken: encrypted,
        externalAccountId: id,
        externalAccountName: extraName || id,
        connectedByUserId: userId,
        dataIdentityId,
        lastError: null,
      });
      await probeAndActivate(site.id, extraProvider, accessToken);
      if (syncAfter) {
        try {
          await syncProvider(site.id, extraProvider);
        } catch {
          /* soft */
        }
      }
      return getConnection(site.id, extraProvider);
    } catch (e) {
      console.error('linkExtra soft-fail', extraProvider, e.message);
      return { ok: false, error: e.message, provider: extraProvider };
    }
  }

  if (kindU === 'GA4' && autoGsc) {
    await linkExtra('GOOGLE_SEARCH_CONSOLE', autoGsc, autoGsc);
  }
  if (kindU === 'GSC' && alsoGa4Id) {
    await linkExtra('GOOGLE_ANALYTICS', String(alsoGa4Id).trim(), alsoGa4Id);
  }

  if (notify && created) {
    createNotification({
      userId,
      clientId,
      layer: 'CLIENT',
      type: 'client.imported_google',
      severity: 'success',
      title: 'Client imported from Google',
      body: `${cName} · ${url}`,
      href: `/clients/${clientId}`,
    });
  }

  return {
    ok: true,
    created,
    attached: !created,
    client: getClient(clientId),
    website: site,
    connection: publicConnection(getConnection(site.id, provider)),
    sync: syncResult,
    platforms: platformsForUser(site.id, userId),
  };
}

/**
 * Bulk-import available GA4 + GSC rows. Order: GA4 first (auto-links GSC), then leftover GSC.
 * Ads are skipped (need an explicit website).
 */
async function importGoogleAssetsBulk({
  userId,
  accessToken,
  encrypted,
  dataIdentityId,
  items,
  syncAfter = false,
}) {
  const list = Array.isArray(items) ? items : [];
  const MAX_BULK = 80;
  if (list.length > MAX_BULK) {
    const err = new Error(
      `Bulk import limited to ${MAX_BULK} properties per run. Select fewer or run again.`
    );
    err.code = 'BULK_LIMIT';
    err.status = 400;
    throw err;
  }
  const ga4 = [];
  const gsc = [];
  const skippedAds = [];
  for (const raw of list) {
    const kind = String(raw.kind || '').toUpperCase();
    if (kind === 'GA4') ga4.push(raw);
    else if (kind === 'GSC') gsc.push(raw);
    else if (kind === 'ADS') {
      skippedAds.push({
        kind: 'ADS',
        external_account_id: raw.external_account_id,
        ok: false,
        skipped: true,
        code: 'ADS_NEEDS_WEBSITE',
        error: 'Google Ads must be linked to a website (not bulk-imported).',
      });
    }
  }

  const ordered = [...ga4, ...gsc];
  const results = [...skippedAds];
  let imported = 0;
  let repaired = 0;
  let attached = 0;
  let skipped = skippedAds.length;
  let failed = 0;

  for (const raw of ordered) {
    const kind = String(raw.kind || '').toUpperCase();
    const externalId = String(raw.external_account_id || '').trim();
    try {
      const out = await importGoogleAsset({
        userId,
        accessToken,
        encrypted,
        dataIdentityId,
        kind,
        externalId,
        displayName: raw.name || externalId,
        clientName: raw.client_name || raw.name || externalId,
        url: raw.url,
        syncAfter,
        alsoGscId: raw.also_gsc_id,
        alsoGa4Id: raw.also_ga4_id,
        notify: true,
      });
      if (out.repaired) repaired += 1;
      else if (out.attached) attached += 1;
      else imported += 1;
      results.push({
        ok: true,
        kind,
        external_account_id: externalId,
        name: raw.name || externalId,
        repaired: Boolean(out.repaired),
        attached: Boolean(out.attached),
        created: Boolean(out.created),
        client_id: out.client?.id,
        website_id: out.website?.id,
        sync: out.sync,
      });
    } catch (e) {
      if (e.code === 'ALREADY_LINKED') {
        skipped += 1;
        results.push({
          ok: false,
          skipped: true,
          kind,
          external_account_id: externalId,
          name: raw.name || externalId,
          code: e.code,
          client_id: e.client_id,
          website_id: e.website_id,
          error: e.message,
        });
      } else {
        failed += 1;
        results.push({
          ok: false,
          kind,
          external_account_id: externalId,
          name: raw.name || externalId,
          code: e.code || 'IMPORT_ERROR',
          error: e.message || 'Import failed',
        });
      }
    }
  }

  return {
    ok: true,
    summary: {
      imported,
      repaired,
      attached,
      skipped,
      failed,
      total: results.length,
    },
    results,
  };
}

module.exports = {
  importGoogleAsset,
  importGoogleAssetsBulk,
  hostKey,
  guessUrlFromGsc,
  findWebsiteByHost,
};
