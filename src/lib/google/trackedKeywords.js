'use strict';

const { getDb } = require('../db');

const MAX_CUSTOM = 25;
const TOP_AUTO = 10;

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function queryKey(raw) {
  return normalizeQuery(raw).toLowerCase();
}

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS website_gsc_keywords (
      id BIGSERIAL PRIMARY KEY,
      website_id BIGINT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'custom'
        CHECK (kind IN ('custom', 'hidden')),
      created_at TEXT NOT NULL DEFAULT (NOW()::text),
      UNIQUE (website_id, query)
    );
    CREATE INDEX IF NOT EXISTS idx_website_gsc_keywords_website
      ON website_gsc_keywords(website_id);
  `);
}

function listKeywordRows(websiteId) {
  ensureTable();
  return getDb()
    .prepare(
      `SELECT id, website_id, query, kind, created_at
       FROM website_gsc_keywords
       WHERE website_id = ?
       ORDER BY kind ASC, created_at ASC`
    )
    .all(Number(websiteId));
}

function listCustomQueries(websiteId) {
  return listKeywordRows(websiteId)
    .filter((r) => r.kind === 'custom')
    .map((r) => r.query);
}

function listHiddenKeys(websiteId) {
  return new Set(
    listKeywordRows(websiteId)
      .filter((r) => r.kind === 'hidden')
      .map((r) => queryKey(r.query))
  );
}

function findByKey(websiteId, key) {
  ensureTable();
  const rows = listKeywordRows(websiteId);
  return rows.find((r) => queryKey(r.query) === key) || null;
}

function addCustomKeyword(websiteId, rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (!query) {
    const err = new Error('Keyword is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (query.length > 200) {
    const err = new Error('Keyword is too long (max 200 characters)');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  ensureTable();
  const key = queryKey(query);
  const existing = findByKey(websiteId, key);
  if (existing?.kind === 'custom') {
    const err = new Error('Keyword is already tracked');
    err.code = 'DUPLICATE';
    err.status = 400;
    throw err;
  }

  const customs = listCustomQueries(websiteId);
  if (!existing && customs.length >= MAX_CUSTOM) {
    const err = new Error(`You can track up to ${MAX_CUSTOM} custom keywords`);
    err.code = 'LIMIT';
    err.status = 400;
    throw err;
  }

  if (existing) {
    getDb()
      .prepare(
        `UPDATE website_gsc_keywords
         SET kind = 'custom', query = ?
         WHERE id = ?`
      )
      .run(query, existing.id);
  } else {
    getDb()
      .prepare(
        `INSERT INTO website_gsc_keywords (website_id, query, kind)
         VALUES (?, ?, 'custom')`
      )
      .run(Number(websiteId), query);
  }

  return { query, kind: 'custom' };
}

function removeKeyword(websiteId, rawQuery, { hideAuto = true } = {}) {
  const query = normalizeQuery(rawQuery);
  if (!query) {
    const err = new Error('Keyword is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  ensureTable();
  const key = queryKey(query);
  const existing = findByKey(websiteId, key);

  if (existing?.kind === 'custom') {
    getDb()
      .prepare(`DELETE FROM website_gsc_keywords WHERE id = ?`)
      .run(existing.id);
    return { removed: true, kind: 'custom', query: existing.query };
  }

  if (!hideAuto) {
    const err = new Error('Keyword not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (existing?.kind === 'hidden') {
    return { removed: true, kind: 'hidden', query: existing.query };
  }

  getDb()
    .prepare(
      `INSERT INTO website_gsc_keywords (website_id, query, kind)
       VALUES (?, ?, 'hidden')
       ON CONFLICT (website_id, query) DO UPDATE SET kind = 'hidden'`
    )
    .run(Number(websiteId), query);

  return { removed: true, kind: 'hidden', query };
}

/**
 * Build keyword table rows: custom tracked first, then top auto (≤10), minus hidden.
 */
function buildKeywordRows(snapshotRows, websiteId, autoLimit = TOP_AUTO) {
  const aggregated = aggregateFromSnapshots(snapshotRows);
  const byKey = new Map(
    aggregated.map((row) => [queryKey(row.query), row])
  );

  const customQueries = listCustomQueries(websiteId);
  const hidden = listHiddenKeys(websiteId);

  const customRows = customQueries.map((query) => {
    const hit = byKey.get(queryKey(query));
    return {
      query,
      clicks: hit?.clicks || 0,
      impressions: hit?.impressions || 0,
      ctr: hit?.ctr || 0,
      avg_position: hit?.avg_position ?? null,
      origin: 'custom',
      tracked: true,
    };
  });

  const customKeys = new Set(customQueries.map(queryKey));
  const autoRows = aggregated
    .filter((row) => {
      const key = queryKey(row.query);
      return !customKeys.has(key) && !hidden.has(key);
    })
    .slice(0, autoLimit)
    .map((row) => ({
      ...row,
      origin: 'auto',
      tracked: false,
    }));

  return [...customRows, ...autoRows];
}

function aggregateFromSnapshots(rows) {
  const byQuery = new Map();
  for (const row of rows || []) {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    for (const q of payload.top_queries || []) {
      const query = normalizeQuery(q.query);
      if (!query) continue;
      const key = queryKey(query);
      const prev = byQuery.get(key) || {
        query,
        clicks: 0,
        impressions: 0,
        positionWeight: 0,
      };
      const clicks = Number(q.clicks) || 0;
      const impressions = Number(q.impressions) || 0;
      prev.clicks += clicks;
      prev.impressions += impressions;
      prev.positionWeight += (Number(q.position) || 0) * impressions;
      byQuery.set(key, prev);
    }
  }
  return Array.from(byQuery.values())
    .map((row) => ({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      avg_position:
        row.impressions > 0 ? row.positionWeight / row.impressions : null,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        (a.avg_position || 0) - (b.avg_position || 0)
    );
}

/**
 * Tracked/auto keywords with prior-period position for change column.
 * Positive position_change = improved (moved up in SERP).
 */
function buildKeywordRowsWithCompare(
  currentSnapshotRows,
  priorSnapshotRows,
  websiteId,
  autoLimit = TOP_AUTO
) {
  const current = buildKeywordRows(
    currentSnapshotRows,
    websiteId,
    autoLimit
  );
  const priorByKey = new Map(
    aggregateFromSnapshots(priorSnapshotRows).map((row) => [
      queryKey(row.query),
      row,
    ])
  );
  return current.map((row) => {
    const prev = priorByKey.get(queryKey(row.query));
    const prevPos = prev?.avg_position ?? null;
    const curPos = row.avg_position;
    let positionChange = null;
    if (prevPos != null && curPos != null) {
      positionChange = prevPos - curPos;
    }
    return {
      ...row,
      prev_position: prevPos,
      position_change: positionChange,
      prev_clicks: prev?.clicks || 0,
      prev_impressions: prev?.impressions || 0,
    };
  });
}

/** Top queries by clicks for GSC performance tables (not limited to tracked set). */
function buildTopQueries(snapshotRows, limit = 15) {
  return aggregateFromSnapshots(snapshotRows).slice(0, limit);
}

/**
 * Channel mix from sources we already store (no GA4 channel dimension yet).
 */
function buildTrafficMix(sourceKpis) {
  const gsc = sourceKpis.gsc || {};
  const ga4 = sourceKpis.ga4 || {};
  const ads = sourceKpis.ads || {};
  const meta = sourceKpis.meta || {};
  return [
    {
      channel: 'Organic search',
      metric: 'Clicks',
      value: Number(gsc.clicks) || 0,
      conversions: null,
      source: 'Search Console',
    },
    {
      channel: 'Website traffic',
      metric: 'Sessions',
      value: Number(ga4.sessions) || 0,
      conversions: Number(ga4.primary_conversions) || 0,
      source: 'GA4 (all channels)',
    },
    {
      channel: 'Google Ads',
      metric: 'Clicks',
      value: Number(ads.clicks) || 0,
      conversions: Number(ads.primary_conversions) || 0,
      source: 'Paid search',
    },
    {
      channel: 'Meta Ads',
      metric: 'Clicks',
      value: Number(meta.clicks) || 0,
      conversions: Number(meta.primary_conversions) || 0,
      source: 'Paid social',
    },
  ];
}

function positionBucket(pos) {
  const p = Number(pos);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p <= 3) return 'b1_3';
  if (p <= 10) return 'b4_10';
  if (p <= 20) return 'b11_20';
  if (p <= 50) return 'b21_50';
  return 'b51';
}

/**
 * Daily stacked ranking distribution from GSC top_queries (AgencyAnalytics chart).
 */
function buildRankingSeries(snapshotRows) {
  const byDate = new Map();
  for (const row of snapshotRows || []) {
    const date = String(row.date || '');
    if (!date) continue;
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    const point = byDate.get(date) || {
      date,
      label: date.length >= 10 ? date.slice(5) : date,
      b1_3: 0,
      b4_10: 0,
      b11_20: 0,
      b21_50: 0,
      b51: 0,
      avg_position: Number(row.avg_position) || 0,
    };
    if (!point.avg_position && row.avg_position) {
      point.avg_position = Number(row.avg_position) || 0;
    }
    for (const q of payload.top_queries || []) {
      const key = positionBucket(q.position);
      if (key) point[key] += 1;
    }
    byDate.set(date, point);
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Hero stats for AA-style dashboard tiles + gauges.
 */
function buildDashboardHero(keywords, sourceBlocks, kpis, compare) {
  const rows = keywords || [];
  let improved = 0;
  let declined = 0;
  let top10 = 0;
  for (const row of rows) {
    const ch = Number(row.position_change);
    if (Number.isFinite(ch)) {
      if (ch > 0.05) improved += 1;
      else if (ch < -0.05) declined += 1;
    }
    if (row.avg_position != null && Number(row.avg_position) <= 10) top10 += 1;
  }
  const gsc = sourceBlocks.gsc?.kpis || {};
  const ga4 = sourceBlocks.ga4?.kpis || {};
  const ctr = Number(gsc.ctr) || 0;
  const engagement = Number(ga4.engagement_rate) || 0;
  const top10Share =
    rows.length > 0 ? (top10 / rows.length) * 100 : 0;
  const clickDelta =
    (Number(kpis?.organic_clicks) || 0) - (Number(compare?.organic_clicks) || 0);
  const clickGrowthScore = clampScore(
    50 + Math.max(-50, Math.min(50, clickDelta))
  );

  return {
    googleChange: improved,
    googleDecline: declined,
    googleRankings: top10,
    keywordsTracked: rows.length,
    visibility: ctr,
    scores: [
      {
        id: 'ctr',
        label: 'CTR score',
        value: clampScore(ctr * 10),
        note: `${ctr.toFixed(1)}% CTR`,
      },
      {
        id: 'engagement',
        label: 'Engagement score',
        value: clampScore(engagement),
        note: `${engagement.toFixed(1)}% eng. rate`,
      },
      {
        id: 'top10',
        label: 'Top-10 share',
        value: clampScore(top10Share),
        note: `${top10} of ${rows.length || 0} keywords`,
      },
      {
        id: 'momentum',
        label: 'Click momentum',
        value: clickGrowthScore,
        note:
          clickDelta === 0
            ? 'Flat vs prior'
            : `${clickDelta > 0 ? '+' : ''}${Math.round(clickDelta)} clicks`,
      },
    ],
  };
}

module.exports = {
  MAX_CUSTOM,
  TOP_AUTO,
  normalizeQuery,
  queryKey,
  ensureTable,
  listKeywordRows,
  listCustomQueries,
  listHiddenKeys,
  addCustomKeyword,
  removeKeyword,
  buildKeywordRows,
  buildKeywordRowsWithCompare,
  buildTopQueries,
  buildTrafficMix,
  buildRankingSeries,
  buildDashboardHero,
  aggregateFromSnapshots,
};
