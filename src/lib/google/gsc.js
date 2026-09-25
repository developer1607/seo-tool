'use strict';

const TOP_QUERIES_PER_DAY = 25;

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

async function postSearchAnalytics(accessToken, siteUrl, body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`;
  const bodies = [
    { ...body, dataState: 'final' },
    { ...body },
  ];
  let data;
  let lastErr;
  for (const attempt of bodies) {
    try {
      data = await googlePost(url, accessToken, attempt);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr && !data) throw lastErr;
  return data.rows || [];
}

/**
 * Pull daily site totals + top queries. Optionally merge metrics for trackedQueries
 * that may fall outside the top-N auto list.
 */
async function fetchGscDaily(
  accessToken,
  siteUrl,
  from,
  to,
  { trackedQueries = [] } = {}
) {
  const [dailyRows, queryRows] = await Promise.all([
    postSearchAnalytics(accessToken, siteUrl, {
      startDate: from,
      endDate: to,
      dimensions: ['date'],
      rowLimit: 25000,
    }),
    postSearchAnalytics(accessToken, siteUrl, {
      startDate: from,
      endDate: to,
      dimensions: ['date', 'query'],
      rowLimit: 25000,
    }),
  ]);

  const queriesByDate = new Map();
  for (const r of queryRows) {
    const date = r.keys?.[0];
    const query = String(r.keys?.[1] || '').trim();
    if (!date || !query) continue;
    const rows = queriesByDate.get(date) || [];
    rows.push({
      query,
      clicks: Number(r.clicks) || 0,
      impressions: Number(r.impressions) || 0,
      ctr: Number(r.ctr) || 0,
      position: Number(r.position) || 0,
    });
    queriesByDate.set(date, rows);
  }

  const tracked = [
    ...new Set(
      (trackedQueries || [])
        .map((q) => String(q || '').trim())
        .filter(Boolean)
    ),
  ].slice(0, 25);

  const trackedByDate = new Map();
  if (tracked.length) {
    await Promise.all(
      tracked.map(async (query) => {
        try {
          const rows = await postSearchAnalytics(accessToken, siteUrl, {
            startDate: from,
            endDate: to,
            dimensions: ['date'],
            rowLimit: 25000,
            dimensionFilterGroups: [
              {
                filters: [
                  {
                    dimension: 'query',
                    operator: 'equals',
                    expression: query,
                  },
                ],
              },
            ],
          });
          for (const r of rows) {
            const date = r.keys?.[0];
            if (!date) continue;
            const list = trackedByDate.get(date) || [];
            list.push({
              query,
              clicks: Number(r.clicks) || 0,
              impressions: Number(r.impressions) || 0,
              ctr: Number(r.ctr) || 0,
              position: Number(r.position) || 0,
              tracked: true,
            });
            trackedByDate.set(date, list);
          }
        } catch {
          /* skip individual keyword failures; site totals still sync */
        }
      })
    );
  }

  for (const [date, rows] of queriesByDate.entries()) {
    rows.sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        a.position - b.position
    );
    rows.splice(TOP_QUERIES_PER_DAY);

    const extras = trackedByDate.get(date) || [];
    const have = new Set(rows.map((r) => r.query.toLowerCase()));
    for (const extra of extras) {
      const key = extra.query.toLowerCase();
      if (have.has(key)) {
        const idx = rows.findIndex((r) => r.query.toLowerCase() === key);
        if (idx >= 0) rows[idx] = { ...rows[idx], tracked: true };
        continue;
      }
      rows.push(extra);
      have.add(key);
    }
  }

  // Days that only have tracked hits (no bulk top query rows yet)
  for (const [date, extras] of trackedByDate.entries()) {
    if (queriesByDate.has(date)) continue;
    queriesByDate.set(date, extras.slice());
  }

  return dailyRows.map((r) => ({
    date: r.keys?.[0],
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    avg_position: Number(r.position) || 0,
    top_queries: queriesByDate.get(r.keys?.[0]) || [],
  }));
}

module.exports = {
  listGscSites,
  probeGsc,
  fetchGscDaily,
  TOP_QUERIES_PER_DAY,
};
