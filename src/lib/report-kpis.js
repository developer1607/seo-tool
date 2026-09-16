'use strict';

/** Per-section KPI catalog for reports (scorecard + chart each). Keep in sync with web/lib/report-kpis.ts */

const CHART_TYPES = ['line', 'bar', 'area', 'pie'];

const REPORT_KPI_DEFS = [
  {
    key: 'key_wins.organic_clicks',
    section: 'key_wins',
    metric: 'organic_clicks',
    label: 'Organic clicks',
    seriesBucket: 'gsc',
    seriesField: 'clicks',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'key_wins.sessions',
    section: 'key_wins',
    metric: 'sessions',
    label: 'Sessions',
    seriesBucket: 'ga4',
    seriesField: 'sessions',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'key_wins.avg_position',
    section: 'key_wins',
    metric: 'avg_position',
    label: 'Avg. position',
    seriesBucket: 'gsc',
    seriesField: 'avg_position',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'area'],
    digits: 1,
    reverseY: true,
  },
  {
    key: 'key_wins.primary_conversions',
    section: 'key_wins',
    metric: 'primary_conversions',
    label: 'Conversions',
    seriesBucket: 'conversions',
    seriesField: 'primary_conversions',
    kind: 'series',
    defaultChart: 'bar',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'key_wins.spend',
    section: 'key_wins',
    metric: 'spend',
    label: 'Ad spend',
    seriesBucket: 'paid',
    seriesField: 'spend',
    kind: 'series',
    defaultChart: 'area',
    charts: ['line', 'bar', 'area', 'pie'],
    digits: 0,
    pieShare: ['ads', 'meta'],
  },
  {
    key: 'gsc.clicks',
    section: 'gsc',
    metric: 'clicks',
    label: 'Total clicks',
    seriesBucket: 'gsc',
    seriesField: 'clicks',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'gsc.impressions',
    section: 'gsc',
    metric: 'impressions',
    label: 'Impressions',
    seriesBucket: 'gsc',
    seriesField: 'impressions',
    kind: 'series',
    defaultChart: 'bar',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'gsc.ctr',
    section: 'gsc',
    metric: 'ctr',
    label: 'Avg. CTR',
    seriesBucket: 'gsc',
    seriesField: 'ctr',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'area'],
    digits: 1,
    suffix: '%',
    derived: 'ctr',
  },
  {
    key: 'gsc.avg_position',
    section: 'gsc',
    metric: 'avg_position',
    label: 'Avg. position',
    seriesBucket: 'gsc',
    seriesField: 'avg_position',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'area'],
    digits: 1,
    reverseY: true,
  },
  {
    key: 'ga4.sessions',
    section: 'ga4',
    metric: 'sessions',
    label: 'Sessions',
    seriesBucket: 'ga4',
    seriesField: 'sessions',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'ga4.users',
    section: 'ga4',
    metric: 'users',
    label: 'Users',
    seriesBucket: 'ga4',
    seriesField: 'users',
    kind: 'series',
    defaultChart: 'line',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
  {
    key: 'ga4.engagement_rate',
    section: 'ga4',
    metric: 'engagement_rate',
    label: 'Engagement rate',
    seriesBucket: 'ga4',
    seriesField: 'engagement_rate',
    kind: 'series',
    defaultChart: 'area',
    charts: ['line', 'area'],
    digits: 1,
    suffix: '%',
    derived: 'engagement_rate',
  },
  {
    key: 'ga4.primary_conversions',
    section: 'ga4',
    metric: 'primary_conversions',
    label: 'Conversions',
    seriesBucket: 'ga4',
    seriesField: 'primary_conversions',
    kind: 'series',
    defaultChart: 'bar',
    charts: ['line', 'bar', 'area'],
    digits: 0,
  },
];

function defaultChartTypes() {
  return Object.fromEntries(
    REPORT_KPI_DEFS.map((d) => [d.key, d.defaultChart])
  );
}

function normalizeChartTypes(input, sections) {
  const base = defaultChartTypes();
  if (!input || typeof input !== 'object') return base;
  for (const def of REPORT_KPI_DEFS) {
    if (sections && sections[def.section] === false) continue;
    const raw = input[def.key];
    if (!raw) continue;
    const chart = String(raw).toLowerCase();
    if (def.charts.includes(chart)) base[def.key] = chart;
  }
  return base;
}

function kpisForSections(sections) {
  return REPORT_KPI_DEFS.filter((d) => sections && sections[d.section]);
}

function mapSnapshotRows(rows) {
  return (rows || []).map((r) => {
    const clicks = Number(r.clicks) || 0;
    const impressions = Number(r.impressions) || 0;
    const sessions = Number(r.sessions) || 0;
    const engaged = Number(r.engaged_sessions) || 0;
    return {
      date: String(r.date),
      clicks,
      impressions,
      sessions,
      users: Number(r.users) || 0,
      engaged_sessions: engaged,
      primary_conversions: Number(r.primary_conversions) || 0,
      spend: Number(r.spend) || 0,
      avg_position: Number(r.avg_position) || 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      engagement_rate: sessions > 0 ? (engaged / sessions) * 100 : 0,
    };
  });
}

function mergeByDate(buckets) {
  const map = new Map();
  for (const rows of buckets) {
    for (const r of rows) {
      const prev = map.get(r.date) || {
        date: r.date,
        clicks: 0,
        impressions: 0,
        sessions: 0,
        users: 0,
        engaged_sessions: 0,
        primary_conversions: 0,
        spend: 0,
        avg_position: 0,
        ctr: 0,
        engagement_rate: 0,
        _posWeight: 0,
        _posImp: 0,
      };
      prev.clicks += r.clicks;
      prev.impressions += r.impressions;
      prev.sessions += r.sessions;
      prev.users += r.users;
      prev.engaged_sessions += r.engaged_sessions;
      prev.primary_conversions += r.primary_conversions;
      prev.spend += r.spend;
      if (r.avg_position && r.impressions) {
        prev._posWeight += r.avg_position * r.impressions;
        prev._posImp += r.impressions;
      }
      map.set(r.date, prev);
    }
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const avg_position =
        r._posImp > 0 ? r._posWeight / r._posImp : r.avg_position || 0;
      const ctr =
        r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
      const engagement_rate =
        r.sessions > 0 ? (r.engaged_sessions / r.sessions) * 100 : 0;
      return {
        date: r.date,
        clicks: r.clicks,
        impressions: r.impressions,
        sessions: r.sessions,
        users: r.users,
        engaged_sessions: r.engaged_sessions,
        primary_conversions: r.primary_conversions,
        spend: r.spend,
        avg_position,
        ctr,
        engagement_rate,
      };
    });
}

function buildSeriesPayload(bySource) {
  const gsc = mapSnapshotRows(bySource.gsc);
  const ga4 = mapSnapshotRows(bySource.ga4);
  const ads = mapSnapshotRows(bySource.ads);
  const meta = mapSnapshotRows(bySource.meta);
  const paid = mergeByDate([ads, meta]);
  const conversions = mergeByDate([ga4, ads, meta]);
  return { gsc, ga4, ads, meta, paid, conversions };
}

function pieSlicesForKpi(def, bySource) {
  if (!def.pieShare) return null;
  const sum = (rows, field) =>
    (rows || []).reduce((n, r) => n + (Number(r[field]) || 0), 0);
  const slices = [];
  for (const bucket of def.pieShare) {
    const rows = bySource[bucket] || [];
    const value = sum(rows, def.seriesField);
    if (value > 0) {
      slices.push({
        name: bucket === 'ads' ? 'Google Ads' : bucket === 'meta' ? 'Meta' : bucket,
        value,
      });
    }
  }
  return slices;
}

module.exports = {
  CHART_TYPES,
  REPORT_KPI_DEFS,
  defaultChartTypes,
  normalizeChartTypes,
  kpisForSections,
  buildSeriesPayload,
  pieSlicesForKpi,
};
