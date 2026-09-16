'use strict';

const { signState, verifyState } = require('../crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const META_SCOPES = ['ads_read', 'business_management'];

function metaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function metaRedirectUri() {
  return (
    process.env.META_REDIRECT_URI ||
    'http://localhost:3000/auth/meta/callback'
  );
}

function buildMetaAuthUrl({ userId, mode = 'agency' }) {
  if (!metaConfigured()) {
    throw new Error('Meta OAuth is not configured');
  }
  const state = signState({
    websiteId: 0,
    userId: Number(userId),
    mode: mode || 'agency',
    localOnly: false,
    providers: ['META_ADS'],
    exp: Date.now() + 10 * 60 * 1000,
  });
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

async function exchangeMetaCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message || data.error_description || 'Meta token exchange failed'
    );
  }
  return data;
}

/** Exchange short-lived token for ~60-day user token. */
async function exchangeLongLivedToken(shortToken) {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message || 'Meta long-lived token exchange failed'
    );
  }
  return data;
}

async function fetchMetaMe(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name',
    access_token: accessToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me?${params}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) return null;
  return {
    id: data.id ? String(data.id) : null,
    name: data.name ? String(data.name) : null,
    email: data.email ? String(data.email) : null,
  };
}

async function revokeMetaToken(accessToken) {
  if (!accessToken) return { ok: false, skipped: true };
  const params = new URLSearchParams({ access_token: accessToken });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?${params}`,
    { method: 'DELETE' }
  );
  return { ok: res.ok, status: res.status };
}

module.exports = {
  GRAPH_VERSION,
  META_SCOPES,
  metaConfigured,
  metaRedirectUri,
  buildMetaAuthUrl,
  exchangeMetaCode,
  exchangeLongLivedToken,
  fetchMetaMe,
  revokeMetaToken,
  verifyState,
};
