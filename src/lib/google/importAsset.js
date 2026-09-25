'use strict';

const { getDb } = require('../db');
const { getClient, platformStatus } = require('../clients');
const { getWebsite, createWebsite, listWebsites } = require('../websites');
const {
  upsertConnection,
  getConnection,
  publicConnection,
} = require('../connections');
const { createNotification } = require('../notifications');
const {
  setClientOriginIfNew,
  recordClientSource,
  sourceForProvider,
} = require('../clientProvenance');
const {
  listGa4Properties,
  listGa4AccountGroups,
  enrichGa4WithUrls,
  getGa4PropertyWebsiteUrl,
  normalizeWebsiteUrl,
  normalizeAccountId,
  normalizePropertyId,
} = require('./ga4');
const { listGscSites } = require('./gsc');
const { normalizeCustomerId, listAdsAccounts, adsConfigured } = require('./ads');
const { probeAndActivate, syncAvailableGoogleProviders } = require('./sync');
const {
  touchAdminGoogleToken,
  healGoogleWebsiteTokens,
  agencyGoogleStatus,
} = require('./agency');
const {
  hostKey,
  guessUrlFromGsc,
  findBestGscMatch,
  findGscByNameTokens,
  placeholderWebsiteUrl,
  findBestAdsMatch,
  sourcePayloadConfig,
} = require('./resourceMatch');

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

function findWebsiteByGa4Property(propertyId) {
  const pid = normalizePropertyId(propertyId);
  if (!pid) return null;
  return (
    getDb()
      .prepare(
        `SELECT w.* FROM connections c
         JOIN websites w ON w.id = c.website_id
         WHERE c.provider = 'GOOGLE_ANALYTICS'
           AND c.external_account_id = ?
         LIMIT 1`
      )
      .get(pid) || null
  );
}

/**
 * If another GA4 property from the same Analytics account is already imported,
 * return that client id so we add a website instead of a duplicate client.
 */
async function findClientIdForGa4Account({
  accessToken,
  propertyId,
  ga4AccountId = '',
}) {
  let accountId = normalizeAccountId(ga4AccountId);

  if (accountId) {
    const rows = getDb()
      .prepare(
        `SELECT client_id, config_json FROM connections
         WHERE provider = 'GOOGLE_ANALYTICS'`
      )
      .all();
    for (const row of rows) {
      try {
        const cfg = JSON.parse(row.config_json || '{}');
        const payload = cfg.source_payload || {};
        if (normalizeAccountId(payload.accountId) === accountId) {
          return Number(row.client_id);
        }
      } catch {
        /* ignore bad json */
      }
    }
  }

  let inventory = [];
  try {
    inventory = await listGa4Properties(accessToken);
  } catch {
    inventory = [];
  }

  if (!accountId) {
    const me = inventory.find(
      (p) => normalizePropertyId(p.id) === normalizePropertyId(propertyId)
    );
    accountId = normalizeAccountId(me?.accountId);
  }
  if (!accountId) return null;

  const siblingIds = inventory
    .filter((p) => normalizeAccountId(p.accountId) === accountId)
    .map((p) => normalizePropertyId(p.id))
    .filter(Boolean);
  if (!siblingIds.length) return null;

  const placeholders = siblingIds.map(() => '?').join(',');
  const hit = getDb()
    .prepare(
      `SELECT client_id FROM connections
       WHERE provider = 'GOOGLE_ANALYTICS'
         AND external_account_id IN (${placeholders})
       LIMIT 1`
    )
    .get(...siblingIds);
  return hit?.client_id ? Number(hit.client_id) : null;
}

function uniquifyWebsiteUrl(clientId, url, propertyId, { allowSameHost = true } = {}) {
  const sites = listWebsites(clientId);
  const host = hostKey(url);
  const collision = sites.find(
    (w) =>
      w.url === url ||
      (allowSameHost && host && hostKey(w.url) === host)
  );
  if (!collision) return url;
  const numeric = String(propertyId || '')
    .replace(/^properties\//, '')
    .replace(/[^\d]/g, '');
  if (!numeric) return url;
  try {
    const parsed = new URL(url);
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/ga4/${numeric}`;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return `${String(url).replace(/\/$/, '')}/ga4/${numeric}`;
  }
}

/**
 * Resolve a website URL for a GA4 property:
 * stream URI → GSC domain/name match → unique pending placeholder.
 */
function resolveGa4WebsiteUrl({
  propUrl,
  streamUrls,
  propertyId,
  propertyName,
  accountName,
  gscSites,
}) {
  const fromStream =
    normalizeWebsiteUrl(propUrl) ||
    normalizeWebsiteUrl((streamUrls || [])[0]) ||
    null;
  if (fromStream) {
    return { url: fromStream, source: 'stream' };
  }

  const gscHit =
    findBestGscMatch(
      gscSites,
      { url: '', name: propertyName },
      { name: accountName }
    ) || findGscByNameTokens(gscSites, [propertyName, accountName]);
  if (gscHit?.id) {
    const fromGsc = guessUrlFromGsc(gscHit.id);
    if (fromGsc) {
      return {
        url: fromGsc,
        source: gscHit.matchReason === 'name_token' ? 'gsc_name' : 'gsc',
        gscSiteUrl: gscHit.id,
      };
    }
  }

  const placeholder = placeholderWebsiteUrl(propertyId);
  if (placeholder) {
    return { url: placeholder, source: 'placeholder' };
  }
  return { url: null, source: null };
}

async function findGa4ForWebsite(accessToken, url) {
  const want = hostKey(url);
  if (!want) return null;
  try {
    const properties = await enrichGa4WithUrls(
      accessToken,
      await listGa4Properties(accessToken)
    );
    return (
      properties.find((p) => hostKey(p.url || '') === want) ||
      null
    );
  } catch (e) {
    console.error('findGa4ForWebsite soft-fail', e.message);
    return null;
  }
}

async function syncWebsiteGoogle(websiteId, syncAfter) {
  if (!syncAfter) return null;
  try {
    return await syncAvailableGoogleProviders(websiteId);
  } catch (syncErr) {
    return { ok: false, error: syncErr.message || 'Sync failed' };
  }
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
  ga4AccountId = '',
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
    const syncResult = await syncWebsiteGoogle(site.id, syncAfter);
    recordClientSource({
      clientId: site.client_id,
      websiteId: site.id,
      source: 'GOOGLE_ADS',
      externalAccountId: accountId,
      dataIdentityId,
      createdByUserId: userId,
    });
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
      const syncResult = await syncWebsiteGoogle(existing.website_id, syncAfter);
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
  let urlSource = url ? 'input' : null;
  if (!url && kindU === 'GA4') {
    const streamUrl = await getGa4PropertyWebsiteUrl(
      accessToken,
      externalAccountId
    );
    const gscSites = await listGscSites(accessToken).catch(() => []);
    const resolved = resolveGa4WebsiteUrl({
      propUrl: streamUrl,
      streamUrls: streamUrl ? [streamUrl] : [],
      propertyId: externalAccountId,
      propertyName: name,
      accountName: cName,
      gscSites,
    });
    url = resolved.url;
    urlSource = resolved.source;
  }
  if (!url && kindU === 'GSC') {
    const err = new Error(
      'No website URL found on this Search Console property.'
    );
    err.code = 'NO_WEBSITE_URL';
    err.status = 400;
    throw err;
  }
  if (!url) {
    const err = new Error(
      'No website URL found on this Google property. Open Search Console import for that domain, or add the URL manually after creating the client.'
    );
    err.code = 'NO_WEBSITE_URL';
    err.status = 400;
    throw err;
  }

  // Prefer attaching to an existing website with the same hostname (bulk-safe),
  // except pending placeholders which are unique per property.
  // GA4: prefer sibling property under the same Analytics account → one client.
  let site =
    kindU === 'GA4'
      ? findWebsiteByGa4Property(externalAccountId)
      : null;
  let clientId = site ? site.client_id : null;
  let created = false;
  let attached = false;

  if (!site && kindU === 'GA4') {
    const siblingClientId = await findClientIdForGa4Account({
      accessToken,
      propertyId: externalAccountId,
      ga4AccountId,
    });
    if (siblingClientId) {
      clientId = siblingClientId;
      const createUrl = uniquifyWebsiteUrl(
        clientId,
        url,
        externalAccountId,
        { allowSameHost: urlSource !== 'placeholder' }
      );
      site = createWebsite(clientId, { name, url: createUrl });
      attached = true;
      url = createUrl;
    }
  }

  if (!site && urlSource !== 'placeholder') {
    site = findWebsiteByHost(url);
    if (site) clientId = site.client_id;
  }

  if (!site) {
    // Client name = GA4 account name, not each property label.
    const clientLabel =
      (kindU === 'GA4' &&
        String(clientName || '')
          .split(/\s+[—–-]\s+/)[0]
          ?.trim()) ||
      cName;
    const info = getDb()
      .prepare(
        `INSERT INTO clients (
           name, website_url, timezone, currency, origin, created_by_user_id
         ) VALUES (?, ?, 'Asia/Kolkata', 'INR', 'GOOGLE', ?)`
      )
      .run(clientLabel, url, userId);
    clientId = info.lastInsertRowid;
    site = createWebsite(clientId, { name, url });
    created = true;
    setClientOriginIfNew(clientId, 'GOOGLE', userId);
  }

  const resolvedAccountId =
    kindU === 'GA4' ? normalizeAccountId(ga4AccountId) : '';

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
    configJson:
      kindU === 'GA4'
        ? sourcePayloadConfig('GA4', {
            accountId: resolvedAccountId || undefined,
            propertyId: normalizePropertyId(externalAccountId),
            propertyName: name,
            url,
            urlSource,
          })
        : kindU === 'GSC'
          ? sourcePayloadConfig('GSC', {
              siteUrl: externalAccountId,
              url,
            })
          : undefined,
  });

  touchAdminGoogleToken(userId, encrypted);
  healGoogleWebsiteTokens(encrypted, userId, null, dataIdentityId);
  await probeAndActivate(site.id, provider, accessToken);

  recordClientSource({
    clientId,
    websiteId: site.id,
    source: sourceForProvider(provider),
    externalAccountId: externalAccountId,
    dataIdentityId,
    createdByUserId: userId,
  });

  let autoGsc = alsoGscId ? String(alsoGscId).trim() : '';
  if (kindU === 'GA4' && !autoGsc) {
    try {
      const gscSites = await listGscSites(accessToken);
      const want = hostKey(url);
      const hit = gscSites.find(
        (s) => hostKey(guessUrlFromGsc(s.id) || '') === want
      );
      if (hit) autoGsc = hit.id;
    } catch (e) {
      console.error('findGscForWebsite soft-fail', e.message);
    }
  }
  let autoGa4 = alsoGa4Id ? String(alsoGa4Id).trim() : '';
  if (kindU === 'GSC' && !autoGa4) {
    const hit = await findGa4ForWebsite(accessToken, url);
    if (hit) autoGa4 = hit.id;
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
      recordClientSource({
        clientId,
        websiteId: site.id,
        source: sourceForProvider(extraProvider),
        externalAccountId: id,
        dataIdentityId,
        createdByUserId: userId,
      });
      return getConnection(site.id, extraProvider);
    } catch (e) {
      console.error('linkExtra soft-fail', extraProvider, e.message);
      return { ok: false, error: e.message, provider: extraProvider };
    }
  }

  if (kindU === 'GA4' && autoGsc) {
    await linkExtra('GOOGLE_SEARCH_CONSOLE', autoGsc, autoGsc);
  }
  if (kindU === 'GSC' && autoGa4) {
    await linkExtra('GOOGLE_ANALYTICS', autoGa4, autoGa4);
  }

  const syncResult = await syncWebsiteGoogle(site.id, syncAfter);

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
    attached: attached || !created,
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
        ga4AccountId: raw.ga4_account_id || raw.account_id || '',
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

/**
 * Import one GA4 account as one client with all (or selected) properties as websites.
 * Auto-links matching GSC by domain/ID and strong-match Ads when available.
 */
async function importGoogleAccount({
  userId,
  accessToken,
  encrypted,
  dataIdentityId,
  ga4AccountId,
  propertyIds = null,
  syncAfter = true,
  notify = true,
}) {
  const accountId = normalizeAccountId(ga4AccountId);
  if (!accountId) {
    const err = new Error('ga4_account_id required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const groups = await listGa4AccountGroups(accessToken, { enrichUrls: true });
  const group = groups.find((g) => g.accountId === accountId);
  if (!group) {
    const err = new Error(`GA4 account not found in inventory: ${accountId}`);
    err.code = 'ACCOUNT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const selectedSet = Array.isArray(propertyIds) && propertyIds.length
    ? new Set(propertyIds.map(normalizePropertyId).filter(Boolean))
    : null;
  const properties = selectedSet
    ? group.properties.filter((p) => selectedSet.has(normalizePropertyId(p.id)))
    : group.properties;

  if (!properties.length) {
    const err = new Error('No GA4 properties selected for this account');
    err.code = 'NO_PROPERTIES';
    err.status = 400;
    throw err;
  }

  const gscSites = await listGscSites(accessToken).catch(() => []);
  let adsAccounts = [];
  if (adsConfigured()) {
    adsAccounts = await listAdsAccounts(accessToken).catch(() => []);
  }

  // Prefer attaching under an existing client that already owns one of these properties.
  let clientId = null;
  let createdClient = false;
  for (const prop of properties) {
    const existing = getDb()
      .prepare(
        `SELECT client_id FROM connections
         WHERE provider = 'GOOGLE_ANALYTICS' AND external_account_id = ?
         LIMIT 1`
      )
      .get(normalizePropertyId(prop.id));
    if (existing?.client_id) {
      clientId = existing.client_id;
      break;
    }
  }

  if (!clientId) {
    const info = getDb()
      .prepare(
        `INSERT INTO clients (
           name, website_url, timezone, currency, origin, created_by_user_id
         ) VALUES (?, ?, 'Asia/Kolkata', 'INR', 'GOOGLE', ?)`
      )
      .run(group.accountName || accountId, '', userId);
    clientId = info.lastInsertRowid;
    createdClient = true;
    setClientOriginIfNew(clientId, 'GOOGLE', userId);
  }

  const client = getClient(clientId);
  const websiteResults = [];
  let linkedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  async function linkProvider({
    site,
    provider,
    externalAccountId,
    externalAccountName,
    loginCustomerId,
    sourceKind,
    sourcePayload,
  }) {
    const current = getConnection(site.id, provider);
    if (
      current?.status === 'ACTIVE' &&
      current.external_account_id === externalAccountId
    ) {
      return { skipped: true, connection: publicConnection(current) };
    }
    upsertConnection({
      clientId: site.client_id,
      websiteId: site.id,
      provider,
      status: 'PENDING_SELECT',
      encryptedRefreshToken: encrypted,
      externalAccountId,
      externalAccountName,
      loginCustomerId,
      configJson: sourcePayloadConfig(sourceKind, sourcePayload),
      connectedByUserId: userId,
      dataIdentityId,
      lastError: null,
    });
    await probeAndActivate(site.id, provider, accessToken);
    recordClientSource({
      clientId: site.client_id,
      websiteId: site.id,
      source: sourceForProvider(provider),
      externalAccountId,
      dataIdentityId,
      createdByUserId: userId,
    });
    return {
      linked: true,
      connection: publicConnection(getConnection(site.id, provider)),
    };
  }

  for (const prop of properties) {
    const propertyId = normalizePropertyId(prop.id);
    const streamUrls = Array.isArray(prop.streamUrls) ? prop.streamUrls : [];
    const resolved = resolveGa4WebsiteUrl({
      propUrl: prop.url,
      streamUrls,
      propertyId,
      propertyName: prop.name,
      accountName: group.accountName,
      gscSites,
    });
    const url = resolved.url;
    if (!url) {
      failedCount += 1;
      websiteResults.push({
        ok: false,
        property_id: propertyId,
        property_name: prop.name,
        code: 'NO_WEBSITE_URL',
        error:
          'Could not resolve a website URL for this GA4 property (no stream, GSC match, or placeholder).',
      });
      continue;
    }

    // One website per GA4 property — do not collapse regional properties that
    // share a brand domain onto a single website.
    let site = findWebsiteByGa4Property(propertyId);
    let createdWebsite = false;
    let websiteUrl = url;
    if (site && Number(site.client_id) !== Number(clientId)) {
      skippedCount += 1;
      websiteResults.push({
        ok: false,
        skipped: true,
        property_id: propertyId,
        property_name: prop.name,
        url,
        code: 'DOMAIN_OWNED_BY_OTHER_CLIENT',
        client_id: site.client_id,
        website_id: site.id,
        error: 'This GA4 property is already linked to another client.',
      });
      continue;
    }
    if (!site) {
      const createUrl = uniquifyWebsiteUrl(clientId, url, propertyId, {
        allowSameHost: resolved.source !== 'placeholder',
      });
      site = createWebsite(clientId, {
        name: prop.name || createUrl,
        url: createUrl,
      });
      createdWebsite = true;
      websiteUrl = createUrl;
    } else {
      websiteUrl = site.url || url;
    }

    const sitePayload = {
      property_id: propertyId,
      property_name: prop.name,
      url: websiteUrl,
      url_source: resolved.source,
      website_id: site.id,
      created_website: createdWebsite,
      providers: {},
    };

    try {
      const ga4Link = await linkProvider({
        site,
        provider: 'GOOGLE_ANALYTICS',
        externalAccountId: propertyId,
        externalAccountName: prop.name || propertyId,
        sourceKind: 'GA4',
        sourcePayload: {
          accountId,
          accountName: group.accountName,
          propertyId,
          propertyName: prop.name,
          url,
          urlSource: resolved.source,
          streamUrls,
        },
      });
      sitePayload.providers.GOOGLE_ANALYTICS = ga4Link;
      if (ga4Link.linked) linkedCount += 1;

      const gscMatch =
        resolved.source === 'placeholder'
          ? findGscByNameTokens(gscSites, [prop.name, group.accountName])
          : findBestGscMatch(gscSites, site, client) ||
            findGscByNameTokens(gscSites, [prop.name, group.accountName]);
      if (gscMatch?.id) {
        const gscLink = await linkProvider({
          site,
          provider: 'GOOGLE_SEARCH_CONSOLE',
          externalAccountId: gscMatch.id,
          externalAccountName: gscMatch.name || gscMatch.id,
          sourceKind: 'GSC',
          sourcePayload: {
            siteUrl: gscMatch.id,
            permissionLevel: gscMatch.permissionLevel || null,
            matchReason: gscMatch.matchReason,
            matchScore: gscMatch.matchScore,
          },
        });
        sitePayload.providers.GOOGLE_SEARCH_CONSOLE = gscLink;
        if (gscLink.linked) linkedCount += 1;
      } else {
        sitePayload.providers.GOOGLE_SEARCH_CONSOLE = {
          access_not_given: true,
          reason: 'No matching Search Console site for this domain',
        };
      }

      const adsMatch =
        resolved.source === 'placeholder'
          ? null
          : findBestAdsMatch(adsAccounts, site, client);
      if (adsMatch?.id) {
        const adsId = normalizeCustomerId(adsMatch.id);
        const adsLink = await linkProvider({
          site,
          provider: 'GOOGLE_ADS',
          externalAccountId: adsId,
          externalAccountName: adsMatch.name || adsId,
          loginCustomerId:
            normalizeCustomerId(adsMatch.loginCustomerId) || adsId,
          sourceKind: 'ADS',
          sourcePayload: {
            customerId: adsId,
            name: adsMatch.name,
            currency: adsMatch.currency || null,
            loginCustomerId:
              normalizeCustomerId(adsMatch.loginCustomerId) || adsId,
            matchReason: adsMatch.matchReason,
            matchScore: adsMatch.matchScore,
          },
        });
        sitePayload.providers.GOOGLE_ADS = adsLink;
        if (adsLink.linked) linkedCount += 1;
      } else {
        sitePayload.providers.GOOGLE_ADS = {
          access_not_given: true,
          reason: 'No strong Ads account match for this website',
        };
      }

      let sync = null;
      if (syncAfter) {
        sync = await syncWebsiteGoogle(site.id, true);
      }
      sitePayload.ok = true;
      sitePayload.sync = sync;
      websiteResults.push(sitePayload);
    } catch (e) {
      failedCount += 1;
      websiteResults.push({
        ok: false,
        property_id: propertyId,
        property_name: prop.name,
        url,
        website_id: site.id,
        code: e.code || 'IMPORT_ERROR',
        error: e.message || 'Import failed',
      });
    }
  }

  touchAdminGoogleToken(userId, encrypted);
  healGoogleWebsiteTokens(encrypted, userId, null, dataIdentityId);

  const allSites = listWebsites(clientId);
  if (allSites[0]?.url) {
    getDb()
      .prepare(
        `UPDATE clients SET website_url = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(allSites[0].url, clientId);
  }

  if (notify && createdClient) {
    createNotification({
      userId,
      clientId,
      layer: 'CLIENT',
      type: 'client.imported_google',
      severity: 'success',
      title: 'Client imported from Google account',
      body: `${group.accountName} · ${allSites.length} website(s)`,
      href: `/clients/${clientId}`,
    });
  }

  return {
    ok: true,
    created: createdClient,
    client: getClient(clientId),
    account: {
      id: accountId,
      name: group.accountName,
    },
    websites: allSites,
    summary: {
      properties: properties.length,
      websites: allSites.length,
      linked: linkedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    results: websiteResults,
    platforms:
      allSites[0] ? platformsForUser(allSites[0].id, userId) : [],
  };
}

module.exports = {
  importGoogleAsset,
  importGoogleAssetsBulk,
  importGoogleAccount,
  hostKey,
  guessUrlFromGsc,
  findWebsiteByHost,
};
