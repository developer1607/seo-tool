/** Keep in sync with src/lib/report-kpis.js */

export type ChartType = "line" | "bar" | "area" | "pie";

export type ReportKpiDef = {
  key: string;
  section: string;
  metric: string;
  label: string;
  seriesBucket: string;
  seriesField: string;
  kind: "series";
  defaultChart: ChartType;
  charts: ChartType[];
  digits: number;
  suffix?: string;
  reverseY?: boolean;
  derived?: string;
  pieShare?: string[];
};

export const REPORT_KPI_DEFS: ReportKpiDef[] = [
  {
    key: "key_wins.organic_clicks",
    section: "key_wins",
    metric: "organic_clicks",
    label: "Organic clicks",
    seriesBucket: "gsc",
    seriesField: "clicks",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "key_wins.sessions",
    section: "key_wins",
    metric: "sessions",
    label: "Sessions",
    seriesBucket: "ga4",
    seriesField: "sessions",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "key_wins.avg_position",
    section: "key_wins",
    metric: "avg_position",
    label: "Avg. position",
    seriesBucket: "gsc",
    seriesField: "avg_position",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "area"],
    digits: 1,
    reverseY: true,
  },
  {
    key: "key_wins.primary_conversions",
    section: "key_wins",
    metric: "primary_conversions",
    label: "Conversions",
    seriesBucket: "conversions",
    seriesField: "primary_conversions",
    kind: "series",
    defaultChart: "bar",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "key_wins.spend",
    section: "key_wins",
    metric: "spend",
    label: "Ad spend",
    seriesBucket: "paid",
    seriesField: "spend",
    kind: "series",
    defaultChart: "area",
    charts: ["line", "bar", "area", "pie"],
    digits: 0,
    pieShare: ["ads", "meta"],
  },
  {
    key: "gsc.clicks",
    section: "gsc",
    metric: "clicks",
    label: "Total clicks",
    seriesBucket: "gsc",
    seriesField: "clicks",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "gsc.impressions",
    section: "gsc",
    metric: "impressions",
    label: "Impressions",
    seriesBucket: "gsc",
    seriesField: "impressions",
    kind: "series",
    defaultChart: "bar",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "gsc.ctr",
    section: "gsc",
    metric: "ctr",
    label: "Avg. CTR",
    seriesBucket: "gsc",
    seriesField: "ctr",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "area"],
    digits: 1,
    suffix: "%",
  },
  {
    key: "gsc.avg_position",
    section: "gsc",
    metric: "avg_position",
    label: "Avg. position",
    seriesBucket: "gsc",
    seriesField: "avg_position",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "area"],
    digits: 1,
    reverseY: true,
  },
  {
    key: "ga4.sessions",
    section: "ga4",
    metric: "sessions",
    label: "Sessions",
    seriesBucket: "ga4",
    seriesField: "sessions",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "ga4.users",
    section: "ga4",
    metric: "users",
    label: "Users",
    seriesBucket: "ga4",
    seriesField: "users",
    kind: "series",
    defaultChart: "line",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
  {
    key: "ga4.engagement_rate",
    section: "ga4",
    metric: "engagement_rate",
    label: "Engagement rate",
    seriesBucket: "ga4",
    seriesField: "engagement_rate",
    kind: "series",
    defaultChart: "area",
    charts: ["line", "area"],
    digits: 1,
    suffix: "%",
  },
  {
    key: "ga4.primary_conversions",
    section: "ga4",
    metric: "primary_conversions",
    label: "Conversions",
    seriesBucket: "ga4",
    seriesField: "primary_conversions",
    kind: "series",
    defaultChart: "bar",
    charts: ["line", "bar", "area"],
    digits: 0,
  },
];

export function defaultChartTypes(): Record<string, ChartType> {
  return Object.fromEntries(
    REPORT_KPI_DEFS.map((d) => [d.key, d.defaultChart])
  );
}

export function normalizeChartTypes(
  input: Record<string, string> | null | undefined,
  sections?: Record<string, boolean> | null
): Record<string, ChartType> {
  const base = defaultChartTypes();
  if (!input) return base;
  for (const def of REPORT_KPI_DEFS) {
    if (sections && sections[def.section] === false) continue;
    const raw = String(input[def.key] || "").toLowerCase() as ChartType;
    if (def.charts.includes(raw)) base[def.key] = raw;
  }
  return base;
}

export function kpisForEnabledSections(
  sections: Record<string, boolean>
): ReportKpiDef[] {
  return REPORT_KPI_DEFS.filter((d) => sections[d.section]);
}
