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
  findMetaAccessToken,
} = require('../lib/meta/agency');
const {
  listMetaAdAccounts,
  probeMetaAds,
  normalizeActId,
} = require('../lib/meta/ads');
const {
  upsertConnection,
  getConnection,
  publicConnection,
} = require('../lib/connections');
const { getWebsite } = require('../lib/websites');
const { getClient, platformStatus } = require('../lib/clients');
const { setSession } = require('../lib/session');
const { createNotification } = require('../lib/notifications');
const { getDb } = require('../lib/db');
const { syncProvider, probeAndActivate } = require('../lib/google/sync');

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
  const url = buildMetaAuthUrl({ userId: req.user.id, mode: 'agency' });
  if (req.query.format === 'json') return res.json({ url });
  return res.redirect(url);
});

router.get('/auth/meta/callback', async (req, res) => {
  const fail = (msg) => {
    const params = new URLSearchParams();
    params.set('meta_error', String(msg));
    return res.redirect(
      `${appBase()}/integrations?tab=services&${params.toString()}`
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

    saveAdminMetaToken(req.user.id, encrypt(tokenPack.access_token), {
      scopesJson: JSON.stringify(META_SCOPES),
      expiresAt,
      metaUserId: me?.id || null,
      metaName: me?.name || null,
      metaEmail: me?.email || null,
    });

    createNotification({
      userId: req.user.id,
      clientId: null,
      layer: 'PLATFORM',
      type: 'meta.agency_authorized',
      severity: 'info',
      title: 'Meta linked',
      body: me?.name
        ? `Connected as ${me.name}. Link an ad account to a website.`
        : 'Meta connected. Link an ad account to a website.',
      href: '/integrations?tab=services',
    });

    return res.redirect(`${appBase()}/integrations?tab=services&meta=1`);
  } catch (e) {
    console.error(e);
    return fail(safeError(e));
  }
});

router.post('/integrations/meta/agency/disconnect', requireAuth, async (req, res) => {
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
  try {
    const accessToken = getMetaAccessTokenPlain(req.user.id);
    const accounts = await listMetaAdAccounts(accessToken);
    const linked = getDb()
      .prepare(
        `SELECT external_account_id, website_id, client_id, status
         FROM connections
         WHERE provider = 'META_ADS' AND external_account_id IS NOT NULL`
      )
      .all();
    const byId = Object.fromEntries(
      linked.map((r) => [normalizeActId(r.external_account_id), r])
    );
    res.json({
      connected: true,
      ...agencyMetaStatus(req.user.id),
      accounts: accounts.map((a) => ({
        ...a,
        linked: byId[normalizeActId(a.id)] || null,
      })),
    });
  } catch (e) {
    console.error(e);
    if (e.code === 'NOT_CONNECTED' || e.code === 'NEEDS_REAUTH') {
      return res.json({
        connected: false,
        accounts: [],
        needsReauth: e.code === 'NEEDS_REAUTH',
        error: safeError(e),
        code: e.code,
      });
    }
    res.status(400).json({ error: safeError(e), code: e.code });
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

    if (!accountId) {
      return res.status(400).json({ error: 'Select a Meta ad account' });
    }
    if (!findMetaAccessToken(req.user.id)) {
      return res.status(400).json({
        error: 'Connect Meta under Integrations first.',
        code: 'NOT_CONNECTED',
      });
    }

    const existing = getDb()
      .prepare(
        `SELECT * FROM connections
         WHERE provider = 'META_ADS' AND external_account_id = ?`
      )
      .get(accountId);
    if (
      existing &&
      existing.status === 'ACTIVE' &&
      existing.website_id !== site.id
    ) {
      return res.status(400).json({
        error: 'Already linked to another website',
        website_id: existing.website_id,
        client_id: existing.client_id,
        code: 'ALREADY_LINKED',
      });
    }

    const metaStatus = agencyMetaStatus(req.user.id);
    upsertConnection({
      clientId: site.client_id,
      websiteId: site.id,
      provider: 'META_ADS',
      status: 'PENDING_SELECT',
      externalAccountId: accountId,
      externalAccountName: displayName,
      connectedByUserId: req.user.id,
      dataIdentityId: metaStatus.identityId || null,
      lastError: null,
    });

    const accessToken = getMetaAccessTokenPlain(
      req.user.id,
      metaStatus.identityId || null
    );
    await probeAndActivate(site.id, 'META_ADS', accessToken);

    let syncResult = null;
    if (syncAfter) {
      try {
        syncResult = await syncProvider(site.id, 'META_ADS');
      } catch (syncErr) {
        syncResult = { ok: false, error: safeError(syncErr) };
      }
    }

    setSession(res, {
      userId: req.user.id,
      role: req.user.role,
      selectedClientId: site.client_id,
      selectedWebsiteId: site.id,
    });

    res.json({
      ok: true,
      client: getClient(site.client_id),
      website: site,
      connection: publicConnection(getConnection(site.id, 'META_ADS')),
      sync: syncResult,
      platforms: platformsForUser(site.id, req.user.id),
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

module.exports = router;
