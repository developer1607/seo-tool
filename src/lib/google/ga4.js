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

async function listGa4Properties(accessToken) {
  const data = await googleGet(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
    accessToken
  );
  const out = [];
  for (const account of data.accountSummaries || []) {
    for (const prop of account.propertySummaries || []) {
      out.push({
        id: prop.property,
        name: prop.displayName || prop.property,
        account: account.displayName || account.account,
      });
    }
  }
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

/** First web data stream defaultUri for a GA4 property, if Google has one. */
async function getGa4PropertyWebsiteUrl(accessToken, propertyId) {
  const parent = String(propertyId).startsWith('properties/')
    ? String(propertyId)
    : `properties/${propertyId}`;
  try {
    const data = await googleGet(
      `https://analyticsadmin.googleapis.com/v1beta/${parent}/dataStreams`,
      accessToken
    );
    const streams = data.dataStreams || [];
    const urls = [];
    for (const stream of streams) {
      if (stream.type && stream.type !== 'WEB_DATA_STREAM') continue;
      const uri = stream.webStreamData?.defaultUri;
      const normalized = normalizeWebsiteUrl(uri);
      if (normalized) urls.push(normalized);
    }
    return urls[0] || null;
  } catch {
    return null;
  }
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
    const url = await getGa4PropertyWebsiteUrl(accessToken, p.id);
    return { ...p, url };
  });
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
  getGa4PropertyWebsiteUrl,
  enrichGa4WithUrls,
  normalizeWebsiteUrl,
  probeGa4,
  fetchGa4Daily,
};
