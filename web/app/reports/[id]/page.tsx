"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell, { PageHeader } from "../../components/admin-shell";
import TrendBadge from "../../components/trend-badge";
import ReportKpiChart from "../../components/report-kpi-chart";
import { api } from "../../../lib/api";
import { useSession } from "../../providers";
import {
  REPORT_SECTIONS,
  normalizeSections,
  dynamicSectionNumbers,
  type SectionsMap,
} from "../../../lib/report-sections";
import {
  REPORT_KPI_DEFS,
  defaultChartTypes,
  type ChartType,
  type ReportKpiDef,
} from "../../../lib/report-kpis";

type SourceBlock = {
  kpis: Record<string, number | null>;
  compare: Record<string, number | null>;
};

type SeriesPoint = { date: string; [key: string]: string | number };
type SeriesBuckets = Record<string, SeriesPoint[]>;
type PieMap = Record<string, { name: string; value: number }[]>;

type ReportDetail = {
  report: {
    id: number;
    title: string | null;
    range_from: string;
    range_to: string;
    compare_from: string | null;
    compare_to: string | null;
    created_at: string;
    summary_text?: string | null;
    sections?: SectionsMap;
    chart_types?: Record<string, ChartType>;
    ai_summary?: string;
    branding_json?: string | null;
  };
  catalog?: typeof REPORT_SECTIONS;
  kpis: Record<string, number>;
  compare: Record<string, number>;
  gsc?: SourceBlock;
  ga4?: SourceBlock;
  series?: SeriesBuckets;
  compareSeries?: SeriesBuckets;
  pie?: PieMap;
  range?: {
    from: string;
    to: string;
    compareFrom: string;
    compareTo: string;
  };
  website: { id: number; name: string; url: string };
  client: {
    id: number;
    name: string;
    brand_primary?: string;
    brand_secondary?: string;
  };
  platforms: {
    key: string;
    label: string;
    status: string;
    account_name: string | null;
  }[];
};

function fmt(n: number | null | undefined, digits = 0) {
  const v = Number(n) || 0;
  if (digits) return v.toFixed(digits);
  return String(Math.round(v));
}

function shortName(name: string) {
  return name.split(/\s+[—–-]\s+/)[0] || name;
}

function parseBranding(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      client_name?: string;
      website_url?: string;
      brand_primary?: string;
    };
  } catch {
    return null;
  }
}

function Section({
  n,
  title,
  children,
  className,
}: {
  n?: string | number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`report-section${className ? ` ${className}` : ""}`}>
      <header className="report-section-head">
        <h2>
          {n != null && n !== "" ? (
            <span className="report-section-num">{n}</span>
          ) : null}
          {title}
        </h2>
      </header>
      <div className="report-section-body">{children}</div>
    </section>
  );
}

function kpiValue(
  def: ReportKpiDef,
  data: ReportDetail
): { value: string; cur: number; prev: number } {
  if (def.section === "key_wins") {
    const cur = Number(data.kpis[def.metric]) || 0;
    const prev = Number(data.compare[def.metric]) || 0;
    const raw = fmt(cur, def.digits);
    return {
      value: def.suffix ? `${raw}${def.suffix}` : raw,
      cur,
      prev,
    };
  }
  const block = def.section === "gsc" ? data.gsc : data.ga4;
  const cur = Number(block?.kpis?.[def.metric]) || 0;
  const prev = Number(block?.compare?.[def.metric]) || 0;
  const raw = fmt(cur, def.digits);
  return {
    value: def.suffix ? `${raw}${def.suffix}` : raw,
    cur,
    prev,
  };
}

function KpiChartGrid({
  section,
  tone,
  data,
  chartTypes,
}: {
  section: string;
  tone: "brand" | "gsc" | "ga4";
  data: ReportDetail;
  chartTypes: Record<string, ChartType>;
}) {
  const defs = REPORT_KPI_DEFS.filter((d) => d.section === section);
  const color =
    tone === "gsc" ? "#e68a58" : tone === "ga4" ? "#58ae91" : "#6658d3";
  const thisLabel = data.report.range_from
    ? `${data.report.range_from.slice(5)}–${data.report.range_to.slice(5)}`
    : "This period";
  const priorLabel =
    data.report.compare_from && data.report.compare_to
      ? `${data.report.compare_from.slice(5)}–${data.report.compare_to.slice(5)}`
      : "Prior period";

  return (
    <div className={`report-kpi-chart-grid tone-${tone}`}>
      {defs.map((def) => {
        const { value, cur, prev } = kpiValue(def, data);
        const chart = (chartTypes[def.key] ||
          def.defaultChart) as ChartType;
        const series = data.series?.[def.seriesBucket] || [];
        const compareSeries =
          data.compareSeries?.[def.seriesBucket] || [];
        const hasCompare =
          (Number(prev) || 0) > 0 || (Number(cur) || 0) > 0;
        return (
          <article className="report-kpi report-kpi-with-chart" key={def.key}>
            <span className="report-kpi-label">{def.label}</span>
            <strong className="report-kpi-value">{value}</strong>
            <div className="report-kpi-trend">
              {hasCompare && (prev > 0 || cur > 0) ? (
                <>
                  <TrendBadge cur={cur} prev={prev} />
                  <span>vs {priorLabel}</span>
                </>
              ) : (
                <span className="muted">Comparison unavailable</span>
              )}
            </div>
            <ReportKpiChart
              def={def}
              chart={chart}
              series={series}
              compareSeries={compareSeries}
              pie={data.pie?.[def.key]}
              color={color}
              thisLabel={thisLabel}
              priorLabel={priorLabel}
            />
          </article>
        );
      })}
    </div>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { selectedWebsite, selectWebsite, apply } = useSession();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) {
      router.replace("/reports");
      return;
    }
    setLoading(true);
    setError("");
    api<ReportDetail>(`/reports/${id}`)
      .then(async (d) => {
        setData(d);
        if (d.website?.id && selectedWebsite?.id !== d.website.id) {
          try {
            const session = await selectWebsite(d.website.id);
            apply(session);
          } catch {
            /* report still renders */
          }
        }
      })
      .catch((e) => {
        setError((e as Error).message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const on = useMemo(
    () => normalizeSections(data?.report?.sections),
    [data]
  );
  const sn = useMemo(() => dynamicSectionNumbers(on), [on]);
  const chartTypes = useMemo(
    () => ({
      ...defaultChartTypes(),
      ...(data?.report?.chart_types || {}),
    }),
    [data]
  );

  const brandPrimaryRaw =
    parseBranding(data?.report?.branding_json)?.brand_primary ||
    data?.client?.brand_primary ||
    "#0d7a6f";
  const brandPrimary = /^#[0-9a-fA-F]{6}$/.test(String(brandPrimaryRaw).trim())
    ? String(brandPrimaryRaw).trim()
    : "#0d7a6f";
  const brandSecondaryRaw = data?.client?.brand_secondary || "#1e2530";
  const brandSecondary = /^#[0-9a-fA-F]{6}$/.test(
    String(brandSecondaryRaw).trim()
  )
    ? String(brandSecondaryRaw).trim()
    : "#1e2530";

  const reportStyle = {
    ["--report-brand" as string]: brandPrimary,
    ["--report-ink" as string]: brandSecondary,
  } as CSSProperties;

  function exportPdf() {
    if (!data) return;
    const prev = document.title;
    const host = data.website.url
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    document.title = `${shortName(data.client.name)} — SEO report ${data.report.range_from} to ${data.report.range_to} (${host})`;
    window.print();
    window.setTimeout(() => {
      document.title = prev;
    }, 500);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNote("Link copied — share only with people who can sign in.");
      window.setTimeout(() => setShareNote(""), 4000);
    } catch {
      setShareNote("Could not copy link.");
    }
  }

  return (
    <AdminShell title="Report">
      <div className="page-content report-page">
        <div className="no-print">
          <PageHeader
            eyebrow="SEO PERFORMANCE REPORT"
            title={data?.report.title || (loading ? "Loading…" : "Report")}
            description={
              data
                ? `${shortName(data.client.name)} · ${data.website.url}`
                : "Open a saved report."
            }
            action={
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="secondary-button" href="/reports">
                  ← All reports
                </Link>
                <Link className="secondary-button" href="/reports/generate">
                  New report
                </Link>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!data}
                  onClick={exportPdf}
                >
                  Export PDF
                </button>
              </span>
            }
          />
        </div>

        {error && <div className="banner-error no-print">{error}</div>}
        {loading && !data && (
          <p className="muted no-print">Loading report…</p>
        )}

        {data && (
          <article className="report-doc" style={reportStyle}>
            <div className="report-brand-bar" aria-hidden />

            {on.cover && (
              <section className="report-cover">
                <div className="report-cover-top">
                  <div className="report-agency-mark">
                    <span className="report-agency-icon">W</span>
                    <div>
                      <strong>Webastral</strong>
                      <small>Marketing reports</small>
                    </div>
                  </div>
                  <p className="report-cover-eyebrow">Monthly SEO review</p>
                </div>
                <h1 className="report-cover-title">
                  {data.report.title || "SEO performance report"}
                </h1>
                <p className="report-cover-client">
                  {shortName(data.client.name)}
                </p>
                <p className="report-cover-url">{data.website.url}</p>
                <dl className="report-cover-meta">
                  <div>
                    <dt>Reporting period</dt>
                    <dd>
                      {data.report.range_from} → {data.report.range_to}
                    </dd>
                  </div>
                  {data.report.compare_from && data.report.compare_to ? (
                    <div>
                      <dt>Benchmark (prior period)</dt>
                      <dd>
                        {data.report.compare_from} → {data.report.compare_to}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Presented</dt>
                    <dd>{data.report.created_at}</dd>
                  </div>
                </dl>
              </section>
            )}

            {on.key_wins && (
              <Section n={sn.key_wins} title="Objectives & key wins">
                <p className="report-lead">
                  Headline KPIs vs the prior matching period. Charts overlay{" "}
                  <strong>this period</strong> and the <strong>benchmark</strong>{" "}
                  (same length immediately before) day-by-day.
                </p>
                <KpiChartGrid
                  section="key_wins"
                  tone="brand"
                  data={data}
                  chartTypes={chartTypes}
                />
              </Section>
            )}

            {on.keywords && (
              <Section n={sn.keywords} title="Keyword ranking update">
                <div className="report-placeholder">
                  Keyword ranking detail for this period will appear here once
                  tracking is connected for your site.
                </div>
              </Section>
            )}

            {on.backlinks && (
              <Section n={sn.backlinks} title="Backlink profile">
                <div className="report-placeholder">
                  Referring domain and backlink highlights will appear here once
                  link monitoring is connected for your site.
                </div>
              </Section>
            )}

            {on.gsc && (
              <Section n={sn.gsc} title="Google Search Console update">
                <KpiChartGrid
                  section="gsc"
                  tone="gsc"
                  data={data}
                  chartTypes={chartTypes}
                />
              </Section>
            )}

            {on.ga4 && (
              <Section n={sn.ga4} title="Google Analytics (GA4) update">
                <KpiChartGrid
                  section="ga4"
                  tone="ga4"
                  data={data}
                  chartTypes={chartTypes}
                />
              </Section>
            )}

            {on.technical && (
              <Section n={sn.technical} title="Technical website health">
                <div className="report-placeholder">
                  Core Web Vitals and crawl health checks will appear here once
                  the technical audit for your site is available.
                </div>
              </Section>
            )}

            {on.competitors && (
              <Section n={sn.competitors} title="Competitor analysis">
                <div className="report-placeholder">
                  Competitor visibility and content-gap findings will appear
                  here once competitive tracking is set up for your market.
                </div>
              </Section>
            )}

            {on.summary && (
              <Section title="Summary">
                <p className="report-summary">
                  {data.report.summary_text || data.report.ai_summary}
                </p>
              </Section>
            )}

            {on.recommendations && (
              <Section
                n={sn.recommendations}
                title="Recommendations & next steps"
              >
                <div className="report-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th>Recommendation</th>
                        <th>Owner</th>
                        <th>Timeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          p: "High",
                          r: "Protect and expand pages driving organic clicks this period — refresh titles, meta, and internal links on top landing URLs.",
                          o: "SEO",
                          t: "This week",
                        },
                        {
                          p: "Medium",
                          r: "Review session and engagement trends in Analytics; fix underperforming high-traffic pages and strengthen conversion paths.",
                          o: "SEO / CRO",
                          t: "This month",
                        },
                        {
                          p: "Low",
                          r: "Keep Search Console and Analytics connected and reviewed monthly so ranking and traffic changes are caught early.",
                          o: "Account team",
                          t: "Ongoing",
                        },
                      ].map((row) => (
                        <tr key={row.r}>
                          <td>
                            <span
                              className={`report-priority p-${row.p.toLowerCase()}`}
                            >
                              {row.p}
                            </span>
                          </td>
                          <td>{row.r}</td>
                          <td>{row.o}</td>
                          <td>{row.t}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {on.platforms && (
              <Section title="Platform connection status">
                <ul className="report-platform-list">
                  {data.platforms.map((p) => (
                    <li key={p.key}>
                      <span className="report-platform-icon">
                        {p.label.slice(0, 1)}
                      </span>
                      <span className="report-platform-copy">
                        <strong>{p.label}</strong>
                        <small>
                          {p.account_name || p.status.replace(/_/g, " ")}
                        </small>
                      </span>
                      <span
                        className={`status ${
                          p.status === "ACTIVE" ? "active" : "attention"
                        }`}
                      >
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <footer className="report-footer">
              <div className="report-footer-brand">
                <span className="report-agency-icon sm">W</span>
                <div>
                  <strong>Prepared with Webastral</strong>
                  <small>
                    Confidential · {shortName(data.client.name)} ·{" "}
                    {data.website.url.replace(/^https?:\/\//, "")}
                  </small>
                </div>
              </div>
              <p className="report-footer-note">
                Confidential performance summary for{" "}
                {shortName(data.client.name)}. Figures reflect linked analytics
                and advertising sources for the reporting period shown.
              </p>
            </footer>

            <section className="report-export-bar no-print">
              <div>
                <h2>Export</h2>
                <p className="muted">
                  Opens the system print dialog — choose{" "}
                  <strong>Save as PDF</strong>.
                </p>
                {shareNote ? <p className="muted">{shareNote}</p> : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={exportPdf}
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={copyShareLink}
                >
                  Copy page link
                </button>
              </div>
            </section>
          </article>
        )}
      </div>
    </AdminShell>
  );
}
