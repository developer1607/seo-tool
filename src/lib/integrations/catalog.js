'use strict';

/**
 * Single registry for platforms. DB stores free TEXT keys;
 * this module is the product catalog (phase, family, labels).
 * Add a row here when a new integration ships — no DDL rewrite.
 */

const ORIGIN_FAMILIES = [
  'MANUAL',
  'GOOGLE',
  'META',
  'LINKEDIN',
  'TIKTOK',
  'MICROSOFT',
  'OTHER',
];

/** @type {Array<{
 *   key: string,
 *   family: string,
 *   label: string,
 *   phase: string,
 *   auth: string,
 *   sourceKey: string,
 *   identityProvider: string|null,
 *   enabled: boolean,
 *   metricSource: string|null,
 * }>} */
const PROVIDERS = [
  {
    key: 'GOOGLE_ANALYTICS',
    family: 'GOOGLE',
    label: 'Google Analytics 4',
    phase: '0',
    auth: 'google_oauth',
    sourceKey: 'GOOGLE_GA4',
    identityProvider: 'google',
    enabled: true,
    metricSource: 'GOOGLE_ANALYTICS',
  },
  {
    key: 'GOOGLE_SEARCH_CONSOLE',
    family: 'GOOGLE',
    label: 'Google Search Console',
    phase: '0',
    auth: 'google_oauth',
    sourceKey: 'GOOGLE_GSC',
    identityProvider: 'google',
    enabled: true,
    metricSource: 'GOOGLE_SEARCH_CONSOLE',
  },
  {
    key: 'GOOGLE_ADS',
    family: 'GOOGLE',
    label: 'Google Ads',
    phase: '1',
    auth: 'google_oauth',
    sourceKey: 'GOOGLE_ADS',
    identityProvider: 'google',
    enabled: true,
    metricSource: 'GOOGLE_ADS',
  },
  {
    key: 'META_ADS',
    family: 'META',
    label: 'Meta Ads',
    phase: '0',
    auth: 'meta_oauth',
    sourceKey: 'META_ADS',
    identityProvider: 'meta',
    enabled: true,
    metricSource: 'META_ADS',
  },
  {
    key: 'LINKEDIN_ADS',
    family: 'LINKEDIN',
    label: 'LinkedIn Ads',
    phase: 'later',
    auth: 'linkedin_oauth',
    sourceKey: 'LINKEDIN_ADS',
    identityProvider: 'linkedin',
    enabled: false,
    metricSource: 'LINKEDIN_ADS',
  },
  {
    key: 'TIKTOK_ADS',
    family: 'TIKTOK',
    label: 'TikTok Ads',
    phase: 'later',
    auth: 'tiktok_oauth',
    sourceKey: 'TIKTOK_ADS',
    identityProvider: 'tiktok',
    enabled: false,
    metricSource: 'TIKTOK_ADS',
  },
  {
    key: 'MICROSOFT_ADS',
    family: 'MICROSOFT',
    label: 'Microsoft Advertising',
    phase: 'later',
    auth: 'microsoft_oauth',
    sourceKey: 'MICROSOFT_ADS',
    identityProvider: 'microsoft',
    enabled: false,
    metricSource: 'MICROSOFT_ADS',
  },
];

const MANUAL_SOURCE = {
  key: 'MANUAL',
  family: 'MANUAL',
  label: 'Manual',
  sourceKey: 'MANUAL',
};

const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map((p) => [p.key, p]));
const PROVIDER_BY_SOURCE = Object.fromEntries(
  PROVIDERS.map((p) => [p.sourceKey, p])
);

const KNOWN_SOURCES = [
  MANUAL_SOURCE.sourceKey,
  ...PROVIDERS.map((p) => p.sourceKey),
];

const KNOWN_IDENTITY_PROVIDERS = [
  ...new Set(
    PROVIDERS.map((p) => p.identityProvider).filter(Boolean)
  ),
];

function getProvider(key) {
  return PROVIDER_BY_KEY[key] || null;
}

function familyForProvider(providerKey) {
  return PROVIDER_BY_KEY[providerKey]?.family || 'OTHER';
}

function sourceForProvider(providerKey) {
  if (providerKey === 'MANUAL') return 'MANUAL';
  return PROVIDER_BY_KEY[providerKey]?.sourceKey || null;
}

function originForFamily(family) {
  if (ORIGIN_FAMILIES.includes(family)) return family;
  return 'OTHER';
}

function isKnownOrigin(origin) {
  return ORIGIN_FAMILIES.includes(origin);
}

function isKnownSource(source) {
  return KNOWN_SOURCES.includes(source);
}

function isEnabledProvider(providerKey) {
  return Boolean(PROVIDER_BY_KEY[providerKey]?.enabled);
}

function listCatalog({ includeDisabled = true } = {}) {
  return PROVIDERS.filter((p) => includeDisabled || p.enabled).map((p) => ({
    ...p,
  }));
}

function seedRows() {
  return PROVIDERS.map((p) => ({
    provider_key: p.key,
    family: p.family,
    label: p.label,
    phase: p.phase,
    auth_kind: p.auth,
    source_key: p.sourceKey,
    identity_provider: p.identityProvider,
    metric_source: p.metricSource,
    enabled: p.enabled ? 1 : 0,
  }));
}

module.exports = {
  ORIGIN_FAMILIES,
  PROVIDERS,
  MANUAL_SOURCE,
  PROVIDER_BY_KEY,
  PROVIDER_BY_SOURCE,
  KNOWN_SOURCES,
  KNOWN_IDENTITY_PROVIDERS,
  getProvider,
  familyForProvider,
  sourceForProvider,
  originForFamily,
  isKnownOrigin,
  isKnownSource,
  isEnabledProvider,
  listCatalog,
  seedRows,
};
