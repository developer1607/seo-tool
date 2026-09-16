export type ReportSectionDef = {
  id: string;
  label: string;
  description: string;
  phase: number;
  defaultOn: boolean;
  required?: boolean;
};

/** Keep in sync with src/lib/reports.js */
export const REPORT_SECTIONS: ReportSectionDef[] = [
  {
    id: "cover",
    label: "Cover & period",
    description: "Client, website, reporting dates",
    phase: 1,
    defaultOn: true,
    required: true,
  },
  {
    id: "key_wins",
    label: "Key wins (KPI strip)",
    description: "Headline metrics vs prior period — each with a chart",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "gsc",
    label: "Search Console",
    description: "Clicks, impressions, CTR, average position — each with a chart",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "ga4",
    label: "Google Analytics (GA4)",
    description: "Sessions, users, conversions — each with a chart",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "platforms",
    label: "Platform connection status",
    description: "Which sources are ACTIVE for this website",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "summary",
    label: "Summary narrative",
    description: "Plain-language overview (editable AI later)",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "recommendations",
    label: "Recommendations",
    description: "Next-step placeholders until AI/manual edit",
    phase: 1,
    defaultOn: true,
  },
  {
    id: "keywords",
    label: "Keyword rankings",
    description: "Requires rank tracking (Phase 3)",
    phase: 3,
    defaultOn: false,
  },
  {
    id: "backlinks",
    label: "Backlink profile",
    description: "Requires backlink data (Phase 3)",
    phase: 3,
    defaultOn: false,
  },
  {
    id: "technical",
    label: "Technical website health",
    description: "Requires site audit (Phase 3)",
    phase: 3,
    defaultOn: false,
  },
  {
    id: "competitors",
    label: "Competitor analysis",
    description: "Requires competitor pack (Phase 3)",
    phase: 3,
    defaultOn: false,
  },
];

export type SectionsMap = Record<string, boolean>;

/**
 * Body sections that receive dynamic 1…N when included.
 * Cover, summary narrative, and platform status stay unnumbered front/back matter.
 * Order = reading order in the report document.
 */
export const NUMBERED_BODY_IDS = [
  "key_wins",
  "keywords",
  "backlinks",
  "gsc",
  "ga4",
  "technical",
  "competitors",
  "recommendations",
] as const;

export function dynamicSectionNumbers(on: SectionsMap): Record<string, number> {
  const map: Record<string, number> = {};
  let n = 0;
  for (const id of NUMBERED_BODY_IDS) {
    if (on[id]) map[id] = ++n;
  }
  return map;
}

export function defaultSectionsMap(): SectionsMap {
  return Object.fromEntries(
    REPORT_SECTIONS.map((s) => [s.id, Boolean(s.defaultOn)])
  );
}

export function normalizeSections(input?: SectionsMap | null): SectionsMap {
  const base = defaultSectionsMap();
  if (!input) return base;
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

