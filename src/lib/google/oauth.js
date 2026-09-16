'use strict';

const { signState, verifyState } = require('../crypto');
const { ADS_SCOPE } = require('./ads');

const BASE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  ADS_SCOPE, // one Google login covers GA4 + GSC + Ads
];

/** App sign-in only — never request Analytics / Ads here. */
const LOGIN_SCOPES = ['openid', 'email', 'profile'];

const SCOPES = [...BASE_SCOPES];

function scopesForProviders(_providers) {
  return [...BASE_SCOPES];
}

function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

function redirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/auth/google/callback'
  );
}

function buildAuthUrl({
  websiteId,
  userId,
  providers,
  mode,
  scopes,
  localOnly,
  connectMode = 'replace',
  identityId = null,
}) {
  if (!googleConfigured()) {
    throw new Error('Google OAuth is not configured');
  }
  const providerList = providers || [
    'GOOGLE_ANALYTICS',
    'GOOGLE_SEARCH_CONSOLE',
  ];
  const scopeList = scopes || scopesForProviders(providerList);
  const state = signState({
    websiteId: websiteId != null ? Number(websiteId) : 0,
    userId: Number(userId),
    mode: mode || 'website',
    localOnly: Boolean(localOnly),
    providers: providerList,
    connectMode:
      connectMode === 'add'
        ? 'add'
        : connectMode === 'reconnect'
          ? 'reconnect'
          : 'replace',
    identityId: identityId ? Number(identityId) : null,
    exp: Date.now() + 10 * 60 * 1000,
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: scopeList.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Portal sign-in / link Google login (OIDC). Same OAuth client + redirect as data
 * connect; mode in state keeps tokens out of admin_google_tokens.
 */
function buildLoginAuthUrl({ userId = 0, intent = 'login' } = {}) {
  if (!googleConfigured()) {
    throw new Error('Google OAuth is not configured');
  }
  const mode = intent === 'link' ? 'link_login' : 'login';
  const state = signState({
    websiteId: 0,
    userId: Number(userId) || 0,
    mode,
    localOnly: false,
    providers: [],
    exp: Date.now() + 10 * 60 * 1000,
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: LOGIN_SCOPES.join(' '),
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error_description || data.error || 'Token exchange failed';
    throw new Error(msg);
  }
  return data;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const revoked = data.error === 'invalid_grant';
    const msg = revoked
      ? 'Google access revoked (token rejected by Google).'
      : data.error_description || data.error || 'Token refresh failed';
    const err = new Error(msg);
    err.code = revoked ? 'NEEDS_REAUTH' : 'TOKEN_ERROR';
    throw err;
  }
  return data;
}

/** Revoke a Google OAuth refresh/access token (best-effort). */
async function revokeGoogleToken(token) {
  if (!token) return { ok: false, skipped: true };
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  return { ok: res.ok || res.status === 200, status: res.status };
}

/** OpenID userinfo for the access token (email + sub). */
async function fetchGoogleUserInfo(accessToken) {
  if (!accessToken) return null;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  return {
    email: data.email ? String(data.email) : null,
    sub: data.sub ? String(data.sub) : null,
    name: data.name ? String(data.name) : null,
  };
}

module.exports = {
  SCOPES,
  BASE_SCOPES,
  LOGIN_SCOPES,
  ADS_SCOPE,
  scopesForProviders,
  googleConfigured,
  redirectUri,
  buildAuthUrl,
  buildLoginAuthUrl,
  exchangeCode,
  refreshAccessToken,
  revokeGoogleToken,
  fetchGoogleUserInfo,
  verifyState,
};
