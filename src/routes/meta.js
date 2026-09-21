'use strict';

const express = require('express');
const { encrypt, decrypt } = require('../lib/crypto');
const {
  metaConfigured,
  buildMetaAuthUrl,
  exchangeMetaCode,
  exchangeLongLivedToken,
  fetchMetaMe,
  revokeMetaToken,
  verifyState,
  META_SCOPES,
} = require('../lib/meta/oauth');
const {
  saveAdminMetaToken,
  clearAdminMetaToken,
  getAdminMetaToken,
  getMetaAccessTokenPlain,
  agencyMetaStatus,
  tokenReadable,
  listMetaDataIdentities,
  setDefaultMetaIdentity,
  disconnectMetaIdentity,
  markMetaIdentityNeedsReauth,
} = require('../lib/meta/agency');
const {
  listMetaAdAccounts,
  normalizeActId,
} = require('../lib/meta/ads');
const { getWebsite } = require('../lib/websites');
const { platformStatus } = require('../lib/clients');
const { setSession } = require('../lib/session');
const { createNotification } = require('../lib/notifications');
const { getDb } = require('../lib/db');
const {
  linkMetaToWebsite,
  importMetaAsClient,
} = require('../lib/meta/importAsset');

const router = express.Router();

function appBase() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function safeError(e) {
  return e.message || 'Meta request failed';
}

function resolveOwnedWebsite(req, websiteIdRaw) {
  const websiteId = Number(websiteIdRaw || 0);
  if (!websiteId) {
    return { error: 'Select a website', status: 400, code: 'NEED_WEBSITE' };
  }
  const site = getWebsite(websiteId);
  if (!site) {
    return { error: 'Website not found', status: 404, code: 'NOT_FOUND' };
  }
  return { site };
}

function platformsForUser(websiteId, userId) {
  const meta = agencyMetaStatus(userId);
  const { agencyGoogleStatus } = require('../lib/google/agency');
  const agency = agencyGoogleStatus(userId);
  return platformStatus(websiteId, {
    agencyLinked: agency.linked,
    metaLinked: meta.linked,
  });
}

router.get('/integrations/meta/status', requireAuth, (req, res) => {
  res.json({
    configured: metaConfigured(),
    ...agencyMetaStatus(req.user.id),
  });
});

router.get('/integrations/meta/start', requireAuth, (req, res) => {
  if (!metaConfigured()) {
    return res.status(400).json({
      error: 'Meta OAuth env not configured (META_APP_ID / SECRET)',
      code: 'META_NOT_CONFIGURED',
    });
  }
  const connectMode =
    req.query.connect === 'add'
      ? 'add'
      : req.query.connect === 'reconnect'
        ? 'reconnect'
        : 'replace';
  const identityId = Number(req.query.identity_id || 0) || null;
  const url = buildMetaAuthUrl({
    userId: req.user.id,
    mode: 'agency',
    connectMode,
    identityId,
  });
  if (req.query.format === 'json') return res.json({ url });
  return res.redirect(url);
});

router.get('/auth/meta/callback', async (req, res) => {
  const fail = (msg) => {
    const params = new URLSearchParams();
    params.set('meta_error', String(msg));
    return res.redirect(
      `${appBase()}/integrations?tab=accounts&view=meta&${params.toString()}`
    );
  };

  try {
    if (req.query.error) {
      return fail(String(req.query.error_description || req.query.error));
    }
    const state = verifyState(req.query.state);
    if (!state || !req.user || state.userId !== req.user.id) {
      return fail('Invalid or expired Meta OAuth state. Try Connect again.');
    }

    const short = await exchangeMetaCode(String(req.query.code || ''));
    if (!short.access_token) {
      return fail('Meta did not return an access token.');
    }

    let tokenPack = short;
    try {
      tokenPack = await exchangeLongLivedToken(short.access_token);
    } catch {
      tokenPack = short;
    }

    const me = await fetchMetaMe(tokenPack.access_token);
    const expiresAt = tokenPack.expires_in
      ? new Date(Date.now() + Number(tokenPack.expires_in) * 1000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ')
      : null;

    const connectMode =
      state.connectMode === 'add'
        ? 'add'
        : state.connectMode === 'reconnect'
          ? 'reconnect'
          : 'replace';
    const saved = saveAdminMetaToken(req.user.id, encrypt(tokenPack.access_token), {
      scopesJson: JSON.stringify(META_SCOPES),
      expiresAt,
      metaUserId: me?.id || null,
      metaName: me?.name || null,
      metaEmail: me?.email || null,
      mode: connectMode,
      identityId: state.identityId || null,
    });
    const identityId = saved?.data_identity_id || null;

    createNotification({
      userId: req.user.id,
      clientId: null,
      layer: 'PLATFORM',
      type: 'meta.agency_authorized',
      severity: 'info',
      title: connectMode === 'add' ? 'Meta account added' : 'Meta linked',
      body: me?.name
        ? `Connected as ${me.name}. Sync ad accounts, then link to a website.`
        : 'Meta connected. Sync ad accounts, then link to a website.',
      href: `/integrations?tab=accounts&view=meta${identityId ? `&identity_id=${identityId}` : ''}`,
    });

    return res.redirect(
      `${appBase()}/integrations?tab=accounts&view=meta&meta=1${
        identityId ? `&identity_id=${identityId}` : ''
      }`
    );
  } catch (e) {
    console.error(e);
    return fail(safeError(e));
  }
});

router.post('/integrations/meta/agency/disconnect', requireAuth, async (req, res) => {
  const identityId = Number(req.body?.identity_id || 0) || null;
  if (identityId) {
    const { getIdentity } = require('../lib/identities/data');
    const row = getIdentity(identityId);
    let revoked = false;
    if (
      row &&
      row.user_id === req.user.id &&
      row.provider === 'meta' &&
      row.encrypted_token &&
      tokenReadable(row.encrypted_token)
    ) {
      try {
        const token = decrypt(row.encrypted_token);
        const r = await revokeMetaToken(token);
        revoked = Boolean(r.ok);
      } catch {
        revoked = false;
      }
    }
    disconnectMetaIdentity(req.user.id, identityId);
    return res.json({
      ok: true,
      revoked,
      identityId,
      note: 'That Meta identity was cleared. Other accounts and website links stay.',
    });
  }

  const row = getAdminMetaToken(req.user.id);
  let revoked = false;
  if (row?.encrypted_access_token && tokenReadable(row.encrypted_access_token)) {
    try {
      const token = decrypt(row.encrypted_access_token);
      const r = await revokeMetaToken(token);
      revoked = Boolean(r.ok);
    } catch {
      revoked = false;
    }
  }
  clearAdminMetaToken(req.user.id);
  res.json({
    ok: true,
    revoked,
    note: 'Meta login cleared. Website Meta links kept.',
  });
});

router.get('/integrations/meta/accounts', requireAuth, async (req, res) => {
  const identityId = Number(req.query.identity_id || 0) || null;
  const status = agencyMetaStatus(req.user.id);
  const identities = listMetaDataIdentities(req.user.id);
  const selected =
    identities.find((i) => i.id === identityId) ||
    identities.find((i) => i.isDefault) ||
    identities[0] ||
    null;
  const resolvedId = selected?.id || null;

  const empty = (extra = {}) =>
    res.json({
      connected: false,
      accounts: [],
      available: 0,
      imported: 0,
      identities,
      identityId: resolvedId,
      ...status,
      ...extra,
    });

  if (!selected?.hasToken || selected.status === 'needs_reauth') {
    return empty({
      needsReauth: Boolean(selected),
      error: selected
        ? 'Meta login needs reconnect. Use Reconnect / Add Meta account.'
        : 'Meta is not connected.',
      code: selected ? 'NEEDS_REAUTH' : 'NOT_CONNECTED',
    });
  }

  try {
    const accessToken = getMetaAccessTokenPlain(req.user.id, resolvedId);
    const accounts = await listMetaAdAccounts(accessToken);
    const linked = getDb()
      .prepare(
        `SELECT external_account_id, website_id, client_id, status, data_identity_id
         FROM connections
         WHERE provider = 'META_ADS' AND external_account_id IS NOT NULL`
      )
      .all();
    const byId = Object.fromEntries(
      linked.map((r) => [normalizeActId(r.external_account_id), r])
    );
    const mapped = accounts.map((a) => {
      const row = byId[normalizeActId(a.id)];
      return {
        ...a,
        linked: row
          ? {
              website_id: row.website_id,
              client_id: row.client_id,
              status: row.status,
              data_identity_id: row.data_identity_id,
            }
          : null,
      };
    });
    const imported = mapped.filter((a) => a.linked).length;
    res.json({
      connected: true,
      ...status,
      identityId: resolvedId,
      identities,
      accounts: mapped,
      available: mapped.length - imported,
      imported,
      needsReauth: false,
    });
  } catch (e) {
    console.error(e);
    if (e.code === 'NOT_CONNECTED' || e.code === 'NEEDS_REAUTH') {
      if (e.code === 'NEEDS_REAUTH' && resolvedId) {
        markMetaIdentityNeedsReauth(req.user.id, resolvedId);
      }
      return empty({
        needsReauth: e.code === 'NEEDS_REAUTH',
        error: safeError(e),
        code: e.code,
      });
    }
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

router.post('/integrations/meta/identities/default', requireAuth, (req, res) => {
  try {
    const identityId = Number(req.body?.identity_id || 0);
    if (!identityId) {
      return res.status(400).json({ error: 'identity_id required' });
    }
    const row = setDefaultMetaIdentity(req.user.id, identityId);
    res.json({
      ok: true,
      identity: row,
      agency: agencyMetaStatus(req.user.id),
    });
  } catch (e) {
    res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({
      error: safeError(e),
      code: e.code,
    });
  }
});

router.post('/integrations/meta/select', requireAuth, async (req, res) => {
  try {
    const owned = resolveOwnedWebsite(
      req,
      req.body.website_id || req.selectedWebsite?.id
    );
    if (owned.error) {
      return res
        .status(owned.status)
        .json({ error: owned.error, code: owned.code });
    }
    const site = owned.site;
    const accountId = normalizeActId(req.body.external_account_id);
    const displayName = String(
      req.body.external_account_name || req.body.name || accountId
    ).trim();
    const syncAfter = req.body.sync !== false;
    const identityId =
      Number(req.body.identity_id || 0) ||
      agencyMetaStatus(req.user.id).identityId ||
      null;

    const result = await linkMetaToWebsite({
      userId: req.user.id,
      websiteId: site.id,
      accountId,
      displayName,
      identityId,
      syncAfter,
    });

    setSession(res, {
      userId: req.user.id,
      role: req.user.role,
      selectedClientId: result.client.id,
      selectedWebsiteId: result.website.id,
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    const status = e.status || 400;
    res.status(status).json({
      error: safeError(e),
      code: e.code,
      client_id: e.client_id,
      website_id: e.website_id,
    });
  }
});

router.post('/integrations/meta/import', requireAuth, async (req, res) => {
  try {
    const accountId = normalizeActId(req.body.external_account_id);
    const displayName = String(
      req.body.external_account_name || req.body.name || accountId
    ).trim();
    const websiteUrl = String(req.body.website_url || '').trim();
    const clientName = String(req.body.client_name || displayName || '').trim();
    const syncAfter = req.body.sync !== false;
    const identityId =
      Number(req.body.identity_id || 0) ||
      agencyMetaStatus(req.user.id).identityId ||
      null;

    const result = await importMetaAsClient({
      userId: req.user.id,
      accountId,
      displayName,
      websiteUrl,
      clientName,
      identityId,
      syncAfter,
    });

    setSession(res, {
      userId: req.user.id,
      role: req.user.role,
      selectedClientId: result.client.id,
      selectedWebsiteId: result.website.id,
    });

    res.status(201).json(result);
  } catch (e) {
    console.error(e);
    const status = e.status || 400;
    res.status(status).json({
      error: safeError(e),
      code: e.code,
      client_id: e.client_id,
      website_id: e.website_id,
    });
  }
});

module.exports = router;
