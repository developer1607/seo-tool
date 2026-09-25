'use strict';

const { normalizeWebsiteUrl } = require('./ga4');
const { normalizeCustomerId } = require('./ads');

function hostKey(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (raw.startsWith('sc-domain:')) {
      return raw.slice('sc-domain:'.length).replace(/^www\./, '').toLowerCase();
    }
    return new URL(
      /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    ).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return '';
  }
}

function compactKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function guessUrlFromGsc(siteUrl) {
  const raw = String(siteUrl || '').trim();
  if (!raw) return null;
  if (raw.startsWith('sc-domain:')) {
    return normalizeWebsiteUrl(`https://${raw.slice('sc-domain:'.length)}`);
  }
  return normalizeWebsiteUrl(raw);
}

/**
 * Score a Google inventory row against a website/client.
 * Prefer exact domain, then ID containment, then strong name overlap.
 */
function scoreResourceMatch(row, site, client = null) {
  const siteHost = hostKey(site?.url || site?.primary_domain || '');
  const rowHosts = [
    hostKey(row.url || ''),
    ...(Array.isArray(row.streamUrls)
      ? row.streamUrls.map((u) => hostKey(u))
      : []),
    hostKey(guessUrlFromGsc(row.id) || ''),
  ].filter(Boolean);

  if (siteHost && rowHosts.includes(siteHost)) {
    return { score: 100, reason: 'domain' };
  }

  const rowId = compactKey(row.id || row.propertyId || '');
  const siteKey = compactKey(siteHost);
  if (siteKey && rowId && (rowId.includes(siteKey) || siteKey.includes(rowId))) {
    return { score: 90, reason: 'id' };
  }

  const haystack = compactKey(
    [row.name, row.account, row.accountName, row.propertyName, row.id, row.url]
      .filter(Boolean)
      .join(' ')
  );
  if (siteKey && siteKey.length >= 4 && haystack.includes(siteKey)) {
    return { score: 80, reason: 'domain_name' };
  }

  const clientKey = compactKey(client?.name);
  if (clientKey && clientKey.length >= 5 && haystack.includes(clientKey)) {
    return { score: 50, reason: 'client_name' };
  }

  return { score: 0, reason: null };
}

function withResourceRecommendations(
  rows,
  site,
  client,
  currentId,
  idFn = (r) => r.id,
  minRecommendScore = 80
) {
  const current = String(currentId || '').trim();
  return rows
    .map((row) => {
      const scored = scoreResourceMatch(row, site, client);
      const id = String(idFn(row) || '');
      return {
        ...row,
        current: Boolean(current && id === current),
        recommended: scored.score >= minRecommendScore,
        matchReason: scored.reason,
        matchScore: scored.score,
        _score: scored.score,
      };
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return (
        b._score - a._score ||
        String(a.name || '').localeCompare(String(b.name || ''))
      );
    })
    .map(({ _score, ...row }) => row);
}

function findBestResourceMatch(
  rows,
  site,
  client,
  { minScore = 80, idFn = (r) => r.id } = {}
) {
  const ranked = withResourceRecommendations(
    rows,
    site,
    client,
    '',
    idFn,
    minScore
  );
  return ranked.find((row) => row.matchScore >= minScore) || null;
}

function findBestGscMatch(gscRows, site, client) {
  const rows = (gscRows || []).map((s) => ({
    ...s,
    url: s.url || guessUrlFromGsc(s.id),
  }));
  return findBestResourceMatch(rows, site, client, { minScore: 80 });
}

/**
 * When GA4 has no web stream URL, match GSC by brand/name tokens
 * (e.g. "Dingbats Notebooks USA" → sc-domain:dingbatsnotebooks.com).
 */
function findGscByNameTokens(gscRows, names = []) {
  const stop = new Set([
    'ga4',
    'google',
    'analytics',
    'property',
    'properties',
    'account',
    'website',
    'worldwide',
    'notebooks',
    'partnerships',
  ]);
  const needles = [
    ...new Set(
      names
        .flatMap((n) =>
          String(n || '')
            .toLowerCase()
            .match(/[a-z0-9]{4,}/g) || []
        )
        .filter((t) => !stop.has(t))
    ),
  ];
  if (!needles.length) return null;

  let best = null;
  let bestScore = 0;
  for (const site of gscRows || []) {
    const hay = compactKey(
      [site.id, site.name, guessUrlFromGsc(site.id)].filter(Boolean).join(' ')
    );
    if (!hay) continue;
    let score = 0;
    for (const needle of needles) {
      if (hay.includes(needle)) score += needle.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = {
        ...site,
        url: site.url || guessUrlFromGsc(site.id),
        matchReason: 'name_token',
        matchScore: score,
      };
    }
  }
  return bestScore >= 5 ? best : null;
}

/** Unique editable placeholder when Google has no stream URI and no GSC hit. */
function placeholderWebsiteUrl(propertyId) {
  const id = String(propertyId || '')
    .replace(/^properties\//, '')
    .replace(/[^\d]/g, '');
  if (!id) return null;
  return normalizeWebsiteUrl(`https://ga4-pending.local/properties/${id}`);
}

function findBestAdsMatch(adsRows, site, client) {
  // Ads auto-link only on strong domain/name signals (never weak client_name alone).
  return findBestResourceMatch(adsRows || [], site, client, {
    minScore: 80,
    idFn: (r) => normalizeCustomerId(r.id),
  });
}

function sourcePayloadConfig(kind, payload) {
  return JSON.stringify({
    google_auth: 'agency',
    source_kind: kind,
    source_payload: payload || {},
    source_seen_at: new Date().toISOString(),
  });
}

module.exports = {
  hostKey,
  compactKey,
  guessUrlFromGsc,
  scoreResourceMatch,
  withResourceRecommendations,
  findBestResourceMatch,
  findBestGscMatch,
  findGscByNameTokens,
  placeholderWebsiteUrl,
  findBestAdsMatch,
  sourcePayloadConfig,
};
