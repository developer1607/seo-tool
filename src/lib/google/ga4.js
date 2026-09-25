'use strict';

async function googleGet(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.error_description || `Google API ${res.status}`
    );
  }
  return data;
}

async function googlePost(url, accessToken, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.error_description || `Google API ${res.status}`
    );
  }
  return data;
}

function normalizeAccountId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('accounts/')) return s;
  if (s.startsWith('accountSummaries/')) {
    return `accounts/${s.slice('accountSummaries/'.length)}`;
  }
  if (/^\d+$/.test(s)) return `accounts/${s}`;
  return s;
}

function normalizePropertyId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('properties/')) return s;
  if (/^\d+$/.test(s)) return `properties/${s}`;
  return s;
}

async function listGa4Properties(accessToken) {
  const out = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '200' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleGet(
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${params}`,
      accessToken
    );
    for (const account of data.accountSummaries || []) {
      const accountId = normalizeAccountId(account.account || account.name);
      const accountName = account.displayName || accountId;
      for (const prop of account.propertySummaries || []) {
        const propertyId = normalizePropertyId(prop.property);
        out.push({
          id: propertyId,
          name: prop.displayName || propertyId,
          account: accountName,
          accountId,
          accountName,
          propertyId,
          propertyName: prop.displayName || propertyId,
        });
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

function normalizeWebsiteUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname) return null;
    return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, ''));
  } catch {
    return null;
  }
}

async function getGa4PropertyStreamUrls(accessToken, propertyId) {
  const parent = normalizePropertyId(propertyId);
  if (!parent) return [];
  try {
    const urls = [];
    const seen = new Set();
    let pageToken = '';
    do {
      const params = new URLSearchParams({ pageSize: '200' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await googleGet(
        `https://analyticsadmin.googleapis.com/v1beta/${parent}/dataStreams?${params}`,
        accessToken
      );
      for (const stream of data.dataStreams || []) {
        if (stream.type && stream.type !== 'WEB_DATA_STREAM') continue;
        const uri = stream.webStreamData?.defaultUri;
        const normalized = normalizeWebsiteUrl(uri);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push(normalized);
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return urls;
  } catch {
    return [];
  }
}

/** First web data stream defaultUri for a GA4 property, if Google has one. */
async function getGa4PropertyWebsiteUrl(accessToken, propertyId) {
  const urls = await getGa4PropertyStreamUrls(accessToken, propertyId);
  return urls[0] || null;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function enrichGa4WithUrls(accessToken, properties) {
  return mapPool(properties, 5, async (p) => {
    const streamUrls = await getGa4PropertyStreamUrls(accessToken, p.id);
    return {
      ...p,
      streamUrls,
      url: streamUrls[0] || p.url || null,
    };
  });
}

/**
 * Account → properties inventory for grouped import.
 * Optionally enrich stream URLs (slower; used for import-account / resources).
 */
async function listGa4AccountGroups(accessToken, { enrichUrls = false } = {}) {
  const flat = await listGa4Properties(accessToken);
  const enriched = enrichUrls
    ? await enrichGa4WithUrls(accessToken, flat)
    : flat.map((p) => ({ ...p, streamUrls: [], url: p.url || null }));

  const byAccount = new Map();
  for (const p of enriched) {
    const accountId = normalizeAccountId(p.accountId || '');
    if (!accountId) continue;
    if (!byAccount.has(accountId)) {
      byAccount.set(accountId, {
        id: accountId,
        name: p.accountName || p.account || accountId,
        accountId,
        accountName: p.accountName || p.account || accountId,
        properties: [],
      });
    }
    byAccount.get(accountId).properties.push({
      id: p.propertyId || p.id,
      name: p.propertyName || p.name,
      propertyId: p.propertyId || p.id,
      propertyName: p.propertyName || p.name,
      accountId,
      accountName: p.accountName || p.account,
      url: p.url || null,
      streamUrls: p.streamUrls || [],
    });
  }

  return [...byAccount.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

async function probeGa4(accessToken, propertyId) {
  const property = String(propertyId).replace(/^properties\//, '');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ymd = yesterday.toISOString().slice(0, 10);
  await googlePost(
    `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    accessToken,
    {
      dateRanges: [{ startDate: ymd, endDate: ymd }],
      metrics: [{ name: 'sessions' }],
      limit: 1,
    }
  );
  return true;
}

async function fetchGa4Daily(accessToken, propertyId, from, to) {
  const property = String(propertyId).replace(/^properties\//, '');
  const metricSets = [
    [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
      { name: 'keyEvents' },
    ],
    [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
    ],
  ];

  let data;
  let lastErr;
  for (const metrics of metricSets) {
    try {
      data = await googlePost(
        `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
        accessToken,
        {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'date' }],
          metrics,
          orderBys: [{ dimension: { dimensionName: 'date' } }],
          limit: 100000,
        }
      );
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr && !data) throw lastErr;

  const metricNames = (data.metricHeaders || []).map((h) => h.name);
  const rows = [];
  for (const row of data.rows || []) {
    const dateRaw = row.dimensionValues?.[0]?.value || '';
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    const values = {};
    (row.metricValues || []).forEach((m, i) => {
      values[metricNames[i]] = Number(m.value) || 0;
    });
    rows.push({
      date,
      sessions: values.sessions || 0,
      users: values.totalUsers || 0,
      engaged_sessions: values.engagedSessions || 0,
      engagement_rate: values.engagementRate || 0,
      primary_conversions: values.keyEvents || 0,
    });
  }
  return rows;
}

module.exports = {
  listGa4Properties,
  listGa4AccountGroups,
  getGa4PropertyWebsiteUrl,
  getGa4PropertyStreamUrls,
  enrichGa4WithUrls,
  normalizeWebsiteUrl,
  normalizeAccountId,
  normalizePropertyId,
  probeGa4,
  fetchGa4Daily,
};
