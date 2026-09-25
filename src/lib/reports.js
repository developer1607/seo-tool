'use strict';

/** Report section catalog — aligned to E-Moto sample + SRS Phase 1/2/3. */

const {
  defaultChartTypes,
  normalizeChartTypes,
  REPORT_KPI_DEFS,
} = require('./report-kpis');

const REPORT_SECTIONS = [
  {
    id: 'cover',
    label: 'Cover & period',
    description: 'Client, website, reporting dates',
    phase: 1,
    defaultOn: true,
    required: true,
  },
  {
    id: 'key_wins',
    label: 'Key wins (KPI strip)',
    description: 'Headline metrics vs prior period — each with a chart',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'gsc',
    label: 'Search Console',
    description: 'Clicks, impressions, CTR, average position — each with a chart',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'ga4',
    label: 'Google Analytics (GA4)',
    description: 'Sessions, users, conversions — each with a chart',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'platforms',
    label: 'Platform connection status',
    description: 'Which sources are ACTIVE for this website',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'summary',
    label: 'Summary narrative',
    description: 'Plain-language overview (editable AI later)',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    description: 'Next-step placeholders until AI/manual edit',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'keywords',
    label: 'Keyword rankings',
    description: 'Top + tracked Search Console queries with position change',
    phase: 1,
    defaultOn: true,
  },
  {
    id: 'backlinks',
    label: 'Backlink profile',
    description: 'Requires backlink data (Phase 3)',
    phase: 3,
    defaultOn: false,
  },
  {
    id: 'technical',
    label: 'Technical website health',
    description: 'Requires site audit (Phase 3)',
    phase: 3,
    defaultOn: false,
  },
  {
    id: 'competitors',
    label: 'Competitor analysis',
    description: 'Requires competitor pack (Phase 3)',
    phase: 3,
    defaultOn: false,
  },
];

/** Body sections numbered 1…N when included (keep in sync with web/lib/report-sections.ts). */
const NUMBERED_BODY_IDS = [
  'key_wins',
  'keywords',
  'gsc',
  'ga4',
  'backlinks',
  'technical',
  'competitors',
  'recommendations',
];

function dynamicSectionNumbers(sections) {
  const on = normalizeSections(sections);
  const map = {};
  let n = 0;
  for (const id of NUMBERED_BODY_IDS) {
    if (on[id]) map[id] = ++n;
  }
  return map;
}

function defaultSectionsMap() {
  return Object.fromEntries(
    REPORT_SECTIONS.map((s) => [s.id, Boolean(s.defaultOn)])
  );
}

function normalizeSections(input) {
  const base = defaultSectionsMap();
  if (!input || typeof input !== 'object') return base;
  for (const s of REPORT_SECTIONS) {
    if (s.required) {
      base[s.id] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(input, s.id)) {
      base[s.id] = Boolean(input[s.id]);
    }
  }
  return base;
}

function parseColumnsConfig(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
    const sections = normalizeSections(parsed.sections || parsed);
    const useOverviewDefaults =
      parsed.use_overview_defaults === undefined
        ? true
        : Boolean(parsed.use_overview_defaults);
    const chart_types = normalizeChartTypes(parsed.chart_types, sections);
    return {
      version: 2,
      use_overview_defaults: useOverviewDefaults,
      sections,
      chart_types,
    };
  } catch {
    const sections = defaultSectionsMap();
    return {
      version: 2,
      use_overview_defaults: true,
      sections,
      chart_types: defaultChartTypes(),
    };
  }
}

function parseColumnsJson(raw) {
  return parseColumnsConfig(raw).sections;
}

function buildColumnsJson({
  sections,
  use_overview_defaults = true,
  chart_types,
} = {}) {
  const on = normalizeSections(sections);
  return JSON.stringify({
    version: 2,
    use_overview_defaults: Boolean(use_overview_defaults),
    sections: on,
    chart_types: normalizeChartTypes(chart_types, on),
  });
}

function buildAutoSummary({ clientName, websiteUrl, from, to, kpis, compare }) {
  const parts = [];
  parts.push(
    `Performance snapshot for ${clientName} (${websiteUrl}) from ${from} to ${to}.`
  );
  const org = Number(kpis.organic_clicks) || 0;
  const orgPrev = Number(compare.organic_clicks) || 0;
  if (org || orgPrev) {
    const d = orgPrev ? (((org - orgPrev) / Math.abs(orgPrev)) * 100).toFixed(1) : null;
    parts.push(
      d != null
        ? `Organic clicks were ${org} (${d > 0 ? '+' : ''}${d}% vs prior).`
        : `Organic clicks were ${org}.`
    );
  }
  const sess = Number(kpis.sessions) || 0;
  const sessPrev = Number(compare.sessions) || 0;
  if (sess || sessPrev) {
    const d = sessPrev
      ? (((sess - sessPrev) / Math.abs(sessPrev)) * 100).toFixed(1)
      : null;
    parts.push(
      d != null
        ? `GA4 sessions were ${sess} (${d > 0 ? '+' : ''}${d}% vs prior).`
        : `GA4 sessions were ${sess}.`
    );
  }
  parts.push(
    'Focus next on protecting winning organic queries, improving engagement on high-traffic pages, and keeping paid efficiency aligned with conversion goals.'
  );
  return parts.join(' ');
}

module.exports = {
  REPORT_SECTIONS,
  NUMBERED_BODY_IDS,
  REPORT_KPI_DEFS,
  defaultSectionsMap,
  normalizeSections,
  dynamicSectionNumbers,
  parseColumnsJson,
  parseColumnsConfig,
  buildColumnsJson,
  buildAutoSummary,
  defaultChartTypes,
  normalizeChartTypes,
};
