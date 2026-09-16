'use strict';

const { GRAPH_VERSION } = require('./oauth');

async function graphGet(path, accessToken, query = {}) {
  const params = new URLSearchParams({
    ...query,
    access_token: accessToken,
  });
  const url = path.startsWith('http')
    ? `${path}${path.includes('?') ? '&' : '?'}${params}`
    : `https://graph.facebook.com/${GRAPH_VERSION}${path}?${params}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(
      data.error?.message || `Meta Graph API ${res.status}`
    );
    err.code =
      data.error?.code === 190 || /session|oauth|token/i.test(err.message)
        ? 'NEEDS_REAUTH'
        : 'META_API';
    throw err;
  }
  return data;
}

function normalizeActId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('act_')) return s;
  return `act_${s.replace(/^act_/i, '')}`;
}

async function listMetaAdAccounts(accessToken) {
  const data = await graphGet('/me/adaccounts', accessToken, {
    fields: 'id,account_id,name,currency,account_status',
    limit: '200',
  });
  const out = [];
  for (const a of data.data || []) {
    const id = normalizeActId(a.id || a.account_id);
    if (!id) continue;
    out.push({
      id,
      name: a.name || id,
      currency: a.currency || null,
      accountStatus: a.account_status,
    });
  }
  return out;
}

async function probeMetaAds(accessToken, adAccountId) {
  const id = normalizeActId(adAccountId);
  await graphGet(`/${id}`, accessToken, {
    fields: 'id,name,account_id',
  });
  return true;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchMetaDaily(accessToken, adAccountId, from, to) {
  const id = normalizeActId(adAccountId);
  const data = await graphGet(`/${id}/insights`, accessToken, {
    fields: 'spend,impressions,clicks,ctr,actions,date_start',
    time_increment: '1',
    time_range: JSON.stringify({ since: from, until: to }),
    level: 'account',
    limit: '500',
  });

  const rows = [];
  for (const r of data.data || []) {
    const date = r.date_start;
    if (!date) continue;
    let conversions = 0;
    for (const action of r.actions || []) {
      const t = String(action.action_type || '');
      if (
        t.includes('purchase') ||
        t.includes('lead') ||
        t === 'offsite_conversion.fb_pixel_purchase'
      ) {
        conversions += num(action.value);
      }
    }
    rows.push({
      date,
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      ctr: num(r.ctr) / (String(r.ctr).includes('%') ? 100 : 1),
      primary_conversions: conversions,
    });
  }
  return rows;
}

module.exports = {
  listMetaAdAccounts,
  probeMetaAds,
  fetchMetaDaily,
  normalizeActId,
};
