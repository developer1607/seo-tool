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

async function listGscSites(accessToken) {
  const data = await googleGet(
    'https://www.googleapis.com/webmasters/v3/sites',
    accessToken
  );
  return (data.siteEntry || []).map((s) => ({
    id: s.siteUrl,
    name: s.siteUrl,
    permissionLevel: s.permissionLevel || null,
  }));
}

function encodeSiteUrl(siteUrl) {
  return encodeURIComponent(siteUrl);
}

async function probeGsc(accessToken, siteUrl) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 3);
  const ymd = yesterday.toISOString().slice(0, 10);
  await googlePost(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`,
    accessToken,
    {
      startDate: ymd,
      endDate: ymd,
      dimensions: ['date'],
      rowLimit: 1,
    }
  );
  return true;
}

async function fetchGscDaily(accessToken, siteUrl, from, to) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`;
  const bodies = [
    {
      startDate: from,
      endDate: to,
      dimensions: ['date'],
      rowLimit: 25000,
      dataState: 'final',
    },
    {
      startDate: from,
      endDate: to,
      dimensions: ['date'],
      rowLimit: 25000,
    },
  ];
  let data;
  let lastErr;
  for (const body of bodies) {
    try {
      data = await googlePost(url, accessToken, body);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr && !data) throw lastErr;
  return (data.rows || []).map((r) => ({
    date: r.keys?.[0],
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    avg_position: Number(r.position) || 0,
  }));
}

module.exports = {
  listGscSites,
  probeGsc,
  fetchGscDaily,
};
