'use strict';

const express = require('express');
const { getWebsite, createWebsite, listWebsites } = require('../lib/websites');
const { encrypt, decrypt } = require('../lib/crypto');
const {
  GOOGLE_PROVIDERS,
  GOOGLE_ANALYTICS_PROVIDERS,
  upsertConnection,
  getConnection,
  disconnect,
  findGoogleTokenConnection,
  publicConnection,
  googleAuthConfigJson,
} = require('../lib/connections');
const {
  googleConfigured,
  buildAuthUrl,
  buildLoginAuthUrl,
  exchangeCode,
  verifyState,
  SCOPES,
  scopesForProviders,
  fetchGoogleUserInfo,
  revokeGoogleToken,
} = require('../lib/google/oauth');
const { listGa4Properties, enrichGa4WithUrls, getGa4PropertyWebsiteUrl, normalizeWebsiteUrl } = require('../lib/google/ga4');
const { listGscSites } = require('../lib/google/gsc');
const {
  adsConfigured,
  listAdsAccounts,
  normalizeCustomerId,
} = require('../lib/google/ads');
const {
  getAccessTokenForWebsite,
  probeAndActivate,
  syncProvider,
} = require('../lib/google/sync');
const {
  saveAdminGoogleToken,
  touchAdminGoogleToken,
  getAdminGoogleToken,
  getAccessTokenForDiscover,
  clearAdminGoogleToken,
  healGoogleWebsiteTokens,
  applyAgencyGoogleToWebsite,
  agencyGoogleStatus,
  findAnyGoogleEncryptedToken,
  tokenIsReadable,
  listGoogleDataIdentities,
  setDefaultGoogleIdentity,
  disconnectGoogleIdentity,
} = require('../lib/google/agency');
const { getClient, platformStatus } = require('../lib/clients');
const { setSession } = require('../lib/session');
const { createNotification } = require('../lib/notifications');
const { getDb } = require('../lib/db');
const {
  importGoogleAsset,
  importGoogleAssetsBulk,
  guessUrlFromGsc,
} = require('../lib/google/importAsset');
const {
  linkGoogleLoginIdentity,
} = require('../lib/auth/identities');

const router = express.Router();

function appBase() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function safeError(e) {
  return e.message || 'Google request failed';
}

function tokenHasAdsScope(row) {
  if (!row?.scopes_json) return false;
  try {
    const scopes = JSON.parse(row.scopes_json || '[]');
    return scopes.some((s) => String(s).includes('adwords'));
  } catch {
    return false;
  }
}

function providerLabel(provider) {
  if (provider === 'GOOGLE_ANALYTICS') return 'GA4';
  if (provider === 'GOOGLE_SEARCH_CONSOLE') return 'Search Console';
  if (provider === 'GOOGLE_ADS') return 'Google Ads';
  return provider;
}

function platformsForUser(websiteId, userId) {
  const agency = agencyGoogleStatus(userId);
  const { agencyMetaStatus } = require('../lib/meta/agency');
  const meta = agencyMetaStatus(userId);
  return platformStatus(websiteId, {
    agencyLinked: agency.linked,
    metaLinked: meta.linked,
  });
}

function resolveOwnedWebsite(req, websiteId) {
  const id = Number(websiteId || req.selectedWebsite?.id || 0);
  if (!id) {
    return { error: 'website_id required', code: 'NEED_WEBSITE', status: 400 };
  }
  const site = getWebsite(id);
  if (!site) {
    return { error: 'Website not found', code: 'NEED_WEBSITE', status: 404 };
  }
  if (
    req.selectedClient &&
    Number(req.selectedClient.id) !== Number(site.client_id)
  ) {
    return {
      error:
        'Website is not under the selected client. Switch client in the top bar first.',
      code: 'WEBSITE_CLIENT_MISMATCH',
      status: 400,
    };
  }
  return { site };
}

router.get('/integrations/google/status', requireAuth, (req, res) => {
  const row = getAdminGoogleToken(req.user.id);
  let agencyLinked = false;
  if (row?.encrypted_refresh_token) {
    try {
      agencyLinked = Boolean(decrypt(row.encrypted_refresh_token));
    } catch {
      agencyLinked = false;
    }
  }
  if (!agencyLinked) {
    agencyLinked = Boolean(findAnyGoogleEncryptedToken(req.user.id));
  }
  res.json({
    configured: googleConfigured(),
    agencyLinked,
    updatedAt: row?.updated_at || null,
  });
});

/** Portal SSO — no Webastral session required. Does not connect Analytics/Ads. */
router.get('/auth/google/login/start', (req, res) => {
  if (!googleConfigured()) {
    return res.status(400).json({
      error: 'Google OAuth env not configured',
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  const intent = req.query.intent === 'link' ? 'link' : 'login';
  if (intent === 'link') {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const url = buildLoginAuthUrl({ userId: req.user.id, intent: 'link' });
    if (req.query.format === 'json') return res.json({ url });
    return res.redirect(url);
  }
  const url = buildLoginAuthUrl({ userId: 0, intent: 'login' });
  if (req.query.format === 'json') return res.json({ url });
  return res.redirect(url);
});

router.get('/integrations/google/start', requireAuth, (req, res) => {
  if (!googleConfigured()) {
    return res.status(400).json({
      error: 'Google OAuth env not configured',
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }

  const mode = String(req.query.mode || 'website');
  if (mode === 'discover' || mode === 'agency') {
    const connectMode =
      req.query.connect === 'add'
        ? 'add'
        : req.query.connect === 'reconnect'
          ? 'reconnect'
          : 'replace';
    const identityId = Number(req.query.identity_id || 0) || null;
    const url = buildAuthUrl({
      websiteId: 0,
      userId: req.user.id,
      mode: 'discover',
      connectMode,
      identityId,
      providers: [
        'GOOGLE_ANALYTICS',
        'GOOGLE_SEARCH_CONSOLE',
        'GOOGLE_ADS',
      ],
      scopes: scopesForProviders([
        'GOOGLE_ANALYTICS',
        'GOOGLE_SEARCH_CONSOLE',
        'GOOGLE_ADS',
      ]),
    });
    if (req.query.format === 'json') {
      return res.json({ url });
    }
    return res.redirect(url);
  }

  const owned = resolveOwnedWebsite(
    req,
    req.query.website_id || req.selectedWebsite?.id
  );
  if (owned.error) {
    return res.status(owned.status).json({ error: owned.error, code: owned.code });
  }
  const site = owned.site;

  const providers = String(req.query.providers || '')
    .split(',')
    .map((s) => s.trim())
    .filter((p) => GOOGLE_PROVIDERS.includes(p));
  // Default: one Google connect prepares GA4 + GSC + Ads on this website
  const list =
    providers.length > 0
      ? providers
      : [...GOOGLE_ANALYTICS_PROVIDERS, 'GOOGLE_ADS'];

  if (list.includes('GOOGLE_ADS') && !adsConfigured()) {
    return res.status(400).json({
      error:
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID / SECRET, enable Google Ads API in Cloud Console, then retry.',
      code: 'ADS_NOT_CONFIGURED',
    });
  }

  const existingOnSite = findGoogleTokenConnection(site.id);
  const forceLocal = req.query.force === '1' || req.query.local === '1';
  const agency = forceLocal ? null : findAnyGoogleEncryptedToken(req.user.id);
  const adminRow = getAdminGoogleToken(req.user.id);
  const existingToken = existingOnSite ||
    (agency
      ? {
          encrypted_refresh_token: agency.encrypted,
          scopes_json: adminRow?.scopes_json || '[]',
        }
      : null);
  const needsAdsScope =
    list.includes('GOOGLE_ADS') && !tokenHasAdsScope(existingToken);
  const canReuse =
    existingToken &&
    !forceLocal &&
    !needsAdsScope;

  if (canReuse) {
    const agencyId = agency?.identityId || null;
    applyAgencyGoogleToWebsite(site.id, req.user.id, agencyId);
    for (const provider of list) {
      const cur = getConnection(site.id, provider);
      if (!cur || ['NOT_STARTED', 'DISCONNECTED', 'PENDING_AUTH'].includes(cur.status)) {
        upsertConnection({
          clientId: site.client_id,
          websiteId: site.id,
          provider,
          status: 'PENDING_SELECT',
          encryptedRefreshToken: existingToken.encrypted_refresh_token,
          scopesJson: existingToken.scopes_json,
          configJson: googleAuthConfigJson('agency'),
          connectedByUserId: req.user.id,
          dataIdentityId: agencyId,
          lastError: null,
        });
      } else if (!cur.encrypted_refresh_token) {
        upsertConnection({
          clientId: site.client_id,
          websiteId: site.id,
          provider,
          encryptedRefreshToken: existingToken.encrypted_refresh_token,
          scopesJson: existingToken.scopes_json,
          configJson: googleAuthConfigJson('agency'),
          connectedByUserId: req.user.id,
          dataIdentityId: cur.data_identity_id || agencyId,
        });
      }
    }
    const next = `${appBase()}/integrations?google=1&website_id=${site.id}${
      list.includes('GOOGLE_ADS') ? '&ads=1' : ''
    }`;
    if (req.query.format === 'json') {
      return res.json({ url: next, reused: true, agency: Boolean(agency) });
    }
    return res.redirect(next);
  }

  for (const provider of list) {
    upsertConnection({
      clientId: site.client_id,
      websiteId: site.id,
      provider,
      status: 'PENDING_AUTH',
      connectedByUserId: req.user.id,
      lastError: null,
    });
  }

  const url = buildAuthUrl({
    websiteId: site.id,
    userId: req.user.id,
    mode: 'website',
    localOnly: forceLocal,
    providers: list,
    scopes: scopesForProviders(list),
  });

  if (req.query.format === 'json') {
    return res.json({ url, localOnly: forceLocal });
  }
  return res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  const fail = (msg, stateHint = null) => {
    const state =
      stateHint ||
      (req.query.state ? verifyState(req.query.state) : null);
    const params = new URLSearchParams();
    params.set('google_error', String(msg));
    if (state?.mode === 'login' || state?.mode === 'link_login') {
      const dest =
        state.mode === 'link_login' ? '/settings' : '/login';
      return res.redirect(`${appBase()}${dest}?${params.toString()}`);
    }
    const websiteMode =
      state &&
      state.mode !== 'discover' &&
      Number(state.websiteId) > 0;
    if (websiteMode) {
      params.set('website_id', String(state.websiteId));
      if (state.localOnly) params.set('local', '1');
      const providers = state.providers || [];
      if (
        providers.length === 1 &&
        providers[0] === 'GOOGLE_ADS'
      ) {
        params.set('ads', '1');
      }
      return res.redirect(
        `${appBase()}/integrations?${params.toString()}`
      );
    }
    return res.redirect(
      `${appBase()}/integrations?tab=google&${params.toString()}`
    );
  };

  try {
    if (req.query.error) {
      return fail(String(req.query.error_description || req.query.error));
    }
    const state = verifyState(req.query.state);
    if (!state) {
      return fail('Invalid or expired OAuth state. Try again.');
    }

    // —— Portal sign-in / link Google login (OIDC only; no data tokens) ——
    if (state.mode === 'login' || state.mode === 'link_login') {
      if (state.mode === 'link_login') {
        if (!req.user || state.userId !== req.user.id) {
          return fail(
            'Sign in to Webastral first, then link Google from Settings.',
            state
          );
        }
      }

      const tokens = await exchangeCode(String(req.query.code || ''));
      if (!tokens.access_token) {
        return fail('Google did not return an access token.', state);
      }
      const userInfo = await fetchGoogleUserInfo(tokens.access_token);
      if (!userInfo?.email || !userInfo?.sub) {
        return fail(
          'Could not read Google profile (email). Allow email permission and try again.',
          state
        );
      }

      if (state.mode === 'link_login') {
        const adminEmail = String(req.user.email || '').toLowerCase();
        const googleEmail = String(userInfo.email).toLowerCase();
        if (adminEmail !== googleEmail) {
          return fail(
            `Google account (${userInfo.email}) must match your Webastral email (${req.user.email}).`,
            state
          );
        }
      }

      let linked;
      try {
        linked = linkGoogleLoginIdentity({
          sub: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
        });
      } catch (e) {
        return fail(safeError(e), state);
      }

      if (state.mode === 'link_login' && linked.user.id !== req.user.id) {
        return fail(
          'That Google account belongs to a different admin.',
          state
        );
      }

      const user = linked.user;
      const first = getDb()
        .prepare(`SELECT id FROM clients ORDER BY name LIMIT 1`)
        .get();
      const site = first ? listWebsites(first.id)[0] || null : null;
      setSession(res, {
        userId: user.id,
        role: user.role,
        selectedClientId: first?.id || null,
        selectedWebsiteId: site?.id || null,
      });

      if (state.mode === 'link_login') {
        return res.redirect(
          `${appBase()}/settings?google_login=1`
        );
      }
      return res.redirect(`${appBase()}/agency?google_login=1`);
    }

    // —— Data OAuth (agency / website) — requires existing Webastral session ——
    if (!req.user || state.userId !== req.user.id) {
      return fail('Invalid or expired OAuth state. Try Connect again.', state);
    }

    const tokens = await exchangeCode(String(req.query.code || ''));
    if (!tokens.refresh_token) {
      return fail(
        'No refresh token returned. Revoke Webastral access in Google Account and connect again with consent.',
        state
      );
    }

    const encrypted = encrypt(tokens.refresh_token);
    const scopes = tokens.scope
      ? JSON.stringify(String(tokens.scope).split(/\s+/))
      : JSON.stringify(SCOPES);
    const userInfo = await fetchGoogleUserInfo(tokens.access_token).catch(
      () => null
    );
    const identity = {
      googleEmail: userInfo?.email || null,
      googleSub: userInfo?.sub || null,
    };

    if (state.mode === 'discover') {
      const connectMode =
        state.connectMode === 'add'
          ? 'add'
          : state.connectMode === 'reconnect'
            ? 'reconnect'
            : 'replace';
      const saved = saveAdminGoogleToken(req.user.id, encrypted, scopes, {
        ...identity,
        mode: connectMode,
        identityId: state.identityId || null,
      });
      const identityId = saved?.data_identity_id || null;
      const healed = healGoogleWebsiteTokens(
        encrypted,
        req.user.id,
        scopes,
        identityId
      );
      createNotification({
        userId: req.user.id,
        clientId: null,
        layer: 'PLATFORM',
        type: 'google.agency_authorized',
        severity: 'info',
        title:
          connectMode === 'add'
            ? 'Google account added'
            : 'Agency Google linked',
        body:
          healed > 0
            ? `Review accounts. Refreshed ${healed} website Google connection(s).`
            : identity.googleEmail
              ? `Linked as ${identity.googleEmail}. Review GA4 and Search Console accounts.`
              : 'Review GA4 and Search Console accounts you can access.',
        href: `/integrations?tab=google${identityId ? `&identity_id=${identityId}` : ''}`,
      });
      return res.redirect(
        `${appBase()}/integrations?tab=google&google=1${identityId ? `&identity_id=${identityId}` : ''}`
      );
    }

    const site = getWebsite(state.websiteId);
    if (!site) return fail('Website not found', state);

    const providers = (state.providers || GOOGLE_ANALYTICS_PROVIDERS).filter(
      (p) => GOOGLE_PROVIDERS.includes(p)
    );
    const localOnly = Boolean(state.localOnly);
    const authConfig = googleAuthConfigJson(
      localOnly ? 'website' : 'agency'
    );

    for (const provider of providers) {
      upsertConnection({
        clientId: site.client_id,
        websiteId: site.id,
        provider,
        status: 'PENDING_SELECT',
        encryptedRefreshToken: encrypted,
        scopesJson: scopes,
        configJson: authConfig,
        connectedByUserId: req.user.id,
        lastError: null,
      });
    }

    // Keep GA4/GSC token rows in sync when Ads OAuth grants combined scopes
    if (providers.includes('GOOGLE_ADS')) {
      for (const p of GOOGLE_ANALYTICS_PROVIDERS) {
        const cur = getConnection(site.id, p);
        if (cur?.encrypted_refresh_token || cur?.status === 'ACTIVE') {
          upsertConnection({
            clientId: site.client_id,
            websiteId: site.id,
            provider: p,
            encryptedRefreshToken: encrypted,
            scopesJson: scopes,
            configJson: authConfig,
            connectedByUserId: req.user.id,
          });
        }
      }
    }

    // Per-website (client) Google must NOT replace agency portal login
    if (!localOnly) {
      const saved = saveAdminGoogleToken(req.user.id, encrypted, scopes, identity);
      healGoogleWebsiteTokens(
        encrypted,
        req.user.id,
        scopes,
        saved?.data_identity_id || null
      );
    }

    const adsOnly =
      providers.length === 1 && providers[0] === 'GOOGLE_ADS';
    createNotification({
      userId: req.user.id,
      clientId: site.client_id,
      layer: 'CLIENT',
      type: 'google.authorized',
      severity: 'info',
      title: localOnly
        ? 'Website Google authorized'
        : 'Google authorized',
      body: adsOnly
        ? `Select a Google Ads account for ${site.name}`
        : localOnly
          ? `This website uses its own Google login — pick GA4 / GSC for ${site.name}`
          : `Select GA4 / Search Console for ${site.name}`,
      href: `/integrations?website_id=${site.id}`,
    });

    const qs = `${adsOnly ? '&ads=1' : ''}${localOnly ? '&local=1' : ''}`;
    return res.redirect(
      `${appBase()}/integrations?google=1&website_id=${site.id}${qs}`
    );
  } catch (e) {
    console.error(e);
    return fail(safeError(e));
  }
});

router.get('/integrations/google/discover', requireAuth, async (req, res) => {
  try {
    const identityId = Number(req.query.identity_id || 0) || null;
    const {
      accessToken,
      source,
      updatedAt,
      googleEmail,
      googleSub,
      identityId: resolvedId,
    } = await getAccessTokenForDiscover(req.user.id, identityId);
    let agency = agencyGoogleStatus(req.user.id);
    const identities = listGoogleDataIdentities(req.user.id);
    const activeIdentity =
      identities.find((i) => i.id === resolvedId) ||
      identities.find((i) => i.isDefault) ||
      identities[0] ||
      null;

    // Backfill email/sub once for tokens connected before Phase 0.
    if (agency.linked && !agency.email && !identityId) {
      const info = await fetchGoogleUserInfo(accessToken).catch(() => null);
      if (info?.email || info?.sub) {
        const admin = getAdminGoogleToken(req.user.id);
        if (admin?.encrypted_refresh_token) {
          saveAdminGoogleToken(
            req.user.id,
            admin.encrypted_refresh_token,
            admin.scopes_json,
            {
              googleEmail: info.email || null,
              googleSub: info.sub || null,
            }
          );
          agency = agencyGoogleStatus(req.user.id);
        }
      }
    }

    // Parallel fetch — do NOT bulk-enrich GA4 URLs here (50+ properties times out the UI).
    // Discover is read-only for connection tokens: no heal / apply writes on GET.
    const [ga4Raw, gsc, adsPack] = await Promise.all([
      listGa4Properties(accessToken),
      listGscSites(accessToken),
      adsConfigured()
        ? listAdsAccounts(accessToken)
            .then((ads) => ({ ads, adsError: null }))
            .catch((e) => ({ ads: [], adsError: safeError(e) }))
        : Promise.resolve({ ads: [], adsError: null }),
    ]);
    const ga4 = ga4Raw.map((p) => ({ ...p, url: p.url || null }));
    const ads = adsPack.ads || [];
    const adsError = adsPack.adsError;

    const linked = getDb()
      .prepare(
        `SELECT provider, external_account_id, website_id, client_id, status, data_identity_id
         FROM connections
         WHERE external_account_id IS NOT NULL
           AND provider IN ('GOOGLE_ANALYTICS', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ADS')`
      )
      .all();

    const byExt = Object.fromEntries(
      linked.map((r) => [`${r.provider}:${r.external_account_id}`, r])
    );

    // Repair placeholder .example website URLs from GSC links on same website
    const badSites = getDb()
      .prepare(
        `SELECT w.id, w.url FROM websites w
         WHERE w.url LIKE '%.example' OR w.url LIKE '%.example/%'`
      )
      .all();
    for (const site of badSites) {
      const gscConn = getDb()
        .prepare(
          `SELECT external_account_id FROM connections
           WHERE website_id = ? AND provider = 'GOOGLE_SEARCH_CONSOLE'
             AND external_account_id IS NOT NULL`
        )
        .get(site.id);
      const fixed = gscConn
        ? guessUrlFromGsc(gscConn.external_account_id)
        : null;
      if (fixed) {
        getDb()
          .prepare(
            `UPDATE websites SET url = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .run(fixed, site.id);
        getDb()
          .prepare(
            `UPDATE clients SET website_url = ?, updated_at = datetime('now')
             WHERE id = (SELECT client_id FROM websites WHERE id = ?)`
          )
          .run(fixed, site.id);
      }
    }

    const ga4Out = ga4.map((p) => ({
      ...p,
      linked: byExt[`GOOGLE_ANALYTICS:${p.id}`] || null,
    }));
    const gscOut = gsc.map((s) => ({
      ...s,
      url: guessUrlFromGsc(s.id),
      linked: byExt[`GOOGLE_SEARCH_CONSOLE:${s.id}`] || null,
    }));
    const adsOut = ads.map((a) => ({
      ...a,
      linked:
        byExt[`GOOGLE_ADS:${a.id}`] ||
        byExt[`GOOGLE_ADS:${normalizeCustomerId(a.id)}`] ||
        null,
    }));

    const imported =
      ga4Out.filter((p) => p.linked).length +
      gscOut.filter((s) => s.linked).length +
      adsOut.filter((a) => a.linked).length;
    const available =
      ga4Out.filter((p) => !p.linked).length +
      gscOut.filter((s) => !s.linked).length +
      adsOut.filter((a) => !a.linked).length;

    res.json({
      connected: true,
      agencyLinked: agency.linked,
      source,
      updatedAt,
      email: googleEmail || activeIdentity?.email || agency.email || null,
      sub: googleSub || activeIdentity?.sub || agency.sub || null,
      identityId: resolvedId || activeIdentity?.id || null,
      identities,
      imported,
      available,
      ga4: ga4Out,
      gsc: gscOut,
      ads: adsOut,
      adsError,
    });
  } catch (e) {
    console.error(e);
    const identities = listGoogleDataIdentities(req.user.id);
    if (e.code === 'NOT_CONNECTED' || e.code === 'NEEDS_REAUTH') {
      return res.json({
        connected: false,
        agencyLinked: false,
        source: null,
        updatedAt: null,
        email: null,
        sub: null,
        identityId: null,
        identities,
        imported: 0,
        available: 0,
        ga4: [],
        gsc: [],
        ads: [],
        needsReauth: e.code === 'NEEDS_REAUTH',
        error: safeError(e),
        code: e.code,
      });
    }
    // Keep UI usable — never opaque 500 HTML through the Next proxy
    const agency = agencyGoogleStatus(req.user.id);
    return res.status(200).json({
      connected: false,
      agencyLinked: agency.linked,
      source: null,
      updatedAt: null,
      email: agency.email || null,
      sub: agency.sub || null,
      identityId: agency.identityId || null,
      identities,
      imported: 0,
      available: 0,
      ga4: [],
      gsc: [],
      ads: [],
      error: safeError(e),
      code: e.code || 'DISCOVER_ERROR',
    });
  }
});

router.post('/integrations/google/import', requireAuth, async (req, res) => {
  try {
    const identityId = Number(req.body.identity_id || 0) || null;
    const { accessToken, encrypted, identityId: resolvedId } =
      await getAccessTokenForDiscover(req.user.id, identityId);
    const dataIdentityId = resolvedId || identityId || null;
    const kind = String(req.body.kind || '').toUpperCase();

    let targetWebsiteId = Number(req.body.website_id || 0) || null;
    if (kind === 'ADS') {
      const owned = resolveOwnedWebsite(
        req,
        targetWebsiteId || req.selectedWebsite?.id
      );
      if (owned.error) {
        return res.status(owned.status).json({
          error:
            owned.code === 'NEED_WEBSITE'
              ? 'Pick a website first (client + website), then link this Ads account to it.'
              : owned.error,
          code: owned.code,
        });
      }
      targetWebsiteId = owned.site.id;
    }

    const result = await importGoogleAsset({
      userId: req.user.id,
      accessToken,
      encrypted,
      dataIdentityId,
      kind,
      externalId: req.body.external_account_id,
      displayName: req.body.name,
      clientName: req.body.client_name,
      url: req.body.url,
      syncAfter: req.body.sync !== false,
      targetWebsiteId,
      loginCustomerId: req.body.login_customer_id || '',
      alsoGscId: req.body.also_gsc_id || '',
      alsoGa4Id: req.body.also_ga4_id || '',
      notify: true,
    });

    const clientId = result.client?.id;
    const websiteId = result.website?.id;
    if (clientId && websiteId) {
      setSession(res, {
        userId: req.user.id,
        role: req.user.role,
        selectedClientId: clientId,
        selectedWebsiteId: websiteId,
      });
    }

    const status = result.created ? 201 : 200;
    return res.status(status).json(result);
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

/** Bulk-import available GA4 + GSC (Ads skipped — needs website). */
router.post('/integrations/google/import-bulk', requireAuth, async (req, res) => {
  try {
    const identityId = Number(req.body.identity_id || 0) || null;
    const { accessToken, encrypted, identityId: resolvedId } =
      await getAccessTokenForDiscover(req.user.id, identityId);
    const dataIdentityId = resolvedId || identityId || null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'items[] required', code: 'BAD_REQUEST' });
    }
    const syncAfter = req.body.sync === true;
    const out = await importGoogleAssetsBulk({
      userId: req.user.id,
      accessToken,
      encrypted,
      dataIdentityId,
      items,
      syncAfter,
    });
    const firstOk = out.results.find((r) => r.ok && r.client_id && r.website_id);
    if (firstOk) {
      setSession(res, {
        userId: req.user.id,
        role: req.user.role,
        selectedClientId: firstOk.client_id,
        selectedWebsiteId: firstOk.website_id,
      });
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

router.post('/integrations/google/agency/disconnect', requireAuth, async (req, res) => {
  const identityId = Number(req.body?.identity_id || 0) || null;
  if (identityId) {
    const { getIdentity } = require('../lib/identities/data');
    const row = getIdentity(identityId);
    let revoked = false;
    if (
      row &&
      row.user_id === req.user.id &&
      row.encrypted_token &&
      tokenIsReadable(row.encrypted_token)
    ) {
      try {
        const refresh = decrypt(row.encrypted_token);
        const result = await revokeGoogleToken(refresh);
        revoked = Boolean(result.ok);
      } catch {
        revoked = false;
      }
    }
    disconnectGoogleIdentity(req.user.id, identityId);
    return res.json({
      ok: true,
      revoked,
      identityId,
      note:
        'That Google data identity was cleared. Other accounts and website links stay.',
    });
  }

  const admin = getAdminGoogleToken(req.user.id);
  let revoked = false;
  if (
    admin?.encrypted_refresh_token &&
    tokenIsReadable(admin.encrypted_refresh_token)
  ) {
    try {
      const refresh = decrypt(admin.encrypted_refresh_token);
      const result = await revokeGoogleToken(refresh);
      revoked = Boolean(result.ok);
    } catch {
      revoked = false;
    }
  }
  clearAdminGoogleToken(req.user.id);
  res.json({
    ok: true,
    revoked,
    note:
      'All agency Google data identities cleared. Website connections kept; Connect again to re-enable inventory.',
  });
});

router.get('/integrations/google/identities', requireAuth, (req, res) => {
  res.json({
    identities: listGoogleDataIdentities(req.user.id),
    agency: agencyGoogleStatus(req.user.id),
  });
});

router.post('/integrations/google/identities/default', requireAuth, (req, res) => {
  try {
    const identityId = Number(req.body?.identity_id || 0);
    if (!identityId) {
      return res.status(400).json({ error: 'identity_id required' });
    }
    const row = setDefaultGoogleIdentity(req.user.id, identityId);
    res.json({ ok: true, identity: row, agency: agencyGoogleStatus(req.user.id) });
  } catch (e) {
    res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({
      error: safeError(e),
      code: e.code,
    });
  }
});

router.get('/integrations/google/resources', requireAuth, async (req, res) => {
  try {
    const owned = resolveOwnedWebsite(
      req,
      req.query.website_id || req.selectedWebsite?.id
    );
    if (owned.error) {
      return res
        .status(owned.status)
        .json({ error: owned.error, code: owned.code });
    }
    const websiteId = owned.site.id;
    // Read-only: do not seed/apply agency rows on GET.
    if (
      !findGoogleTokenConnection(websiteId) &&
      !findAnyGoogleEncryptedToken(req.user.id)
    ) {
      return res.status(400).json({
        error:
          'Connect agency Google once under Google accounts — then every client reuses it.',
        code: 'NOT_CONNECTED',
      });
    }
    const accessToken = await getAccessTokenForWebsite(websiteId, req.user.id);
    const [ga4, gsc] = await Promise.all([
      listGa4Properties(accessToken),
      listGscSites(accessToken),
    ]);
    let ads = [];
    let adsError = null;
    if (adsConfigured()) {
      try {
        ads = await listAdsAccounts(accessToken);
      } catch (e) {
        adsError = safeError(e);
        if (
          String(e.message || '')
            .toLowerCase()
            .includes('scope') ||
          e.code === 'NEEDS_REAUTH'
        ) {
          adsError =
            'Google Ads scope missing — click Connect Google Ads to re-authorize with Ads access.';
        }
      }
    }
    res.json({
      ga4,
      gsc,
      ads,
      adsConfigured: adsConfigured(),
      adsError,
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

router.post('/integrations/google/select', requireAuth, async (req, res) => {
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
    const websiteId = owned.site.id;
    const site = owned.site;
    const provider = String(req.body.provider || '');
    const externalAccountId = String(req.body.external_account_id || '').trim();
    const externalAccountName = String(
      req.body.external_account_name || externalAccountId
    ).trim();
    const loginCustomerId = normalizeCustomerId(
      req.body.login_customer_id || ''
    );
    const syncAfter = req.body.sync !== false;

    if (!GOOGLE_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    if (provider === 'GOOGLE_ADS' && !adsConfigured()) {
      return res.status(400).json({
        error: 'Google OAuth / Ads API is not configured',
        code: 'ADS_NOT_CONFIGURED',
      });
    }

    applyAgencyGoogleToWebsite(websiteId, req.user.id);
    let tokenRow = findGoogleTokenConnection(websiteId);
    const agency = findAnyGoogleEncryptedToken(req.user.id);
    const dataIdentityId =
      tokenRow?.data_identity_id || agency?.identityId || null;
    if (!tokenRow) {
      if (!agency) {
        return res.status(400).json({
          error:
            'Connect agency Google once under Integrations → Google — then pick accounts here.',
          code: 'NOT_CONNECTED',
        });
      }
      tokenRow = {
        encrypted_refresh_token: agency.encrypted,
        scopes_json: getAdminGoogleToken(req.user.id)?.scopes_json || '[]',
        data_identity_id: agency.identityId || null,
      };
    }
    if (!externalAccountId) {
      return res.status(400).json({ error: 'Select an account' });
    }

    const accountId =
      provider === 'GOOGLE_ADS'
        ? normalizeCustomerId(externalAccountId)
        : externalAccountId;

    upsertConnection({
      clientId: site.client_id,
      websiteId: site.id,
      provider,
      status: 'PENDING_SELECT',
      encryptedRefreshToken: tokenRow.encrypted_refresh_token,
      scopesJson: tokenRow.scopes_json,
      externalAccountId: accountId,
      externalAccountName,
      loginCustomerId:
        provider === 'GOOGLE_ADS'
          ? loginCustomerId || accountId
          : undefined,
      connectedByUserId: req.user.id,
      dataIdentityId:
        dataIdentityId || tokenRow.data_identity_id || null,
      lastError: null,
    });

    const accessToken = await getAccessTokenForWebsite(websiteId, req.user.id);
    await probeAndActivate(websiteId, provider, accessToken);

    let syncResult = null;
    if (syncAfter) {
      try {
        syncResult = await syncProvider(websiteId, provider);
      } catch (syncErr) {
        console.error(syncErr);
        syncResult = { ok: false, error: safeError(syncErr) };
      }
    }

    createNotification({
      userId: req.user.id,
      clientId: site.client_id,
      layer: 'CLIENT',
      type: 'connection.activated',
      severity: 'success',
      title: `${providerLabel(provider)} connected`,
      body: externalAccountName,
      href: '/integrations',
    });

    res.json({
      ok: true,
      connection: publicConnection(getConnection(websiteId, provider)),
      sync: syncResult,
      platforms: platformsForUser(websiteId, req.user.id),
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

router.post('/integrations/:provider/sync', requireAuth, async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toUpperCase();
    const owned = resolveOwnedWebsite(
      req,
      req.body.website_id || req.selectedWebsite?.id
    );
    if (owned.error) {
      return res
        .status(owned.status)
        .json({ error: owned.error, code: owned.code });
    }
    const websiteId = owned.site.id;
    if (
      !GOOGLE_PROVIDERS.includes(provider) &&
      provider !== 'META_ADS'
    ) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }
    const result = await syncProvider(websiteId, provider);
    res.json({
      ...result,
      platforms: platformsForUser(websiteId, req.user.id),
      connection: publicConnection(getConnection(websiteId, provider)),
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: safeError(e), code: e.code });
  }
});

router.post(
  '/integrations/:provider/disconnect',
  requireAuth,
  (req, res) => {
    const provider = String(req.params.provider || '').toUpperCase();
    const owned = resolveOwnedWebsite(
      req,
      req.body.website_id || req.selectedWebsite?.id
    );
    if (owned.error) {
      return res
        .status(owned.status)
        .json({ error: owned.error, code: owned.code });
    }
    const websiteId = owned.site.id;
    disconnect(websiteId, provider);
    res.json({
      ok: true,
      platforms: platformsForUser(websiteId, req.user.id),
    });
  }
);

module.exports = router;
