"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdminShell from "./components/admin-shell";
import AccessRevokedBanner from "./components/access-revoked-banner";
import DateRangeBar from "./components/date-range-bar";
import TrendBadge from "./components/trend-badge";
import { api } from "../lib/api";
import { rangeQuery } from "../lib/date-range";
import { useGoogleAccessVerify } from "../lib/use-google-access-verify";
import { useSession } from "./providers";

type SourceBlock = {
  kpis: Record<string, number | null>;
  compare: Record<string, number | null>;
};

type Overview = {
  range: {
    label: string;
    from: string;
    to: string;
    compareFrom: string;
    compareTo: string;
    preset: string;
  };
  presets: { id: string; label: string }[];
  kpis: {
    organic_clicks: number;
    sessions: number;
    users?: number;
    spend: number;
    clicks: number;
    primary_conversions: number;
    impressions?: number;
    avg_position?: number | null;
  };
  compare: {
    organic_clicks: number;
    sessions: number;
    users?: number;
    spend: number;
    clicks: number;
    primary_conversions: number;
    avg_position?: number | null;
  };
  gsc?: SourceBlock;
  ga4?: SourceBlock;
  ads?: SourceBlock;
  meta?: SourceBlock;
  summary?: string;
  platforms: {
    key: string;
    label: string;
    status: string;
    account_name: string | null;
    last_error?: string | null;
    last_sync_at?: string | null;
  }[];
};

function displayClientName(name?: string | null) {
  if (!name) return "Client";
  const cut = name.split(/\s+[—–-]\s+/)[0]?.trim();
  return cut || name;
}

function fmt(n: number | null | undefined, digits = 0) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function Section({
  n,
  title,
  subtitle,
  children,
}: {
  n?: string | number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <div>
          <h2>
            {n != null ? `${n}. ` : ""}
            {title}
          </h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </div>
      <div style={{ padding: "4px 4px 8px" }}>{children}</div>
    </section>
  );
}

function MetricStrip({
  items,
  tone = "blue",
}: {
  items: {
    label: string;
    value: string;
    cur: number;
    prev: number;
    note?: string;
  }[];
  tone?: string;
}) {
  return (
    <div className="metric-grid metric-grid-dense">
      {items.map((m) => (
        <article className={`metric-card ${tone}`} key={m.label}>
          <div className="metric-top">
            <span>{m.label}</span>
          </div>
          <strong>{m.value}</strong>
          <div className="metric-bottom">
            <TrendBadge cur={m.cur} prev={m.prev} />
            <span>{m.note || "vs prior period"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SpecTable({
  columns,
  rows,
  emptyNote,
}: {
  columns: string[];
  rows: (string | number)[][];
  emptyNote: string;
}) {
  return (
    <div className="project-table" style={{ marginTop: 12 }}>
      <div className="table-heading platform-table-head">
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="project-row platform-table-row">
          <span style={{ gridColumn: "1 / -1" }} className="muted">
            {emptyNote}
          </span>
        </div>
      ) : (
        rows.map((row, i) => (
          <div className="project-row platform-table-row" key={i}>
            {row.map((cell, j) => (
              <span key={j}>{cell}</span>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

const PLATFORM_HREF: Record<string, string> = {
  GOOGLE_ADS: "/platforms/google-ads",
  META_ADS: "/platforms/meta",
  GOOGLE_ANALYTICS: "/platforms/ga4",
  GOOGLE_SEARCH_CONSOLE: "/platforms/gsc",
};

const OBJECTIVES = [
  "Improve organic visibility for core category terms (Search Console).",
  "Grow organic sessions and assisted conversions (GA4 tracked goals).",
  "Keep paid efficiency visible (Google Ads / Meta spend and conversions).",
  "Improve technical health — Core Web Vitals, crawlability, mobile (Phase 3 audit).",
  "Close content and backlink gaps vs competitors (Phase 3 modules).",
];

export default function Home() {
  const { selectedClient, selectedWebsite, user, dateRange } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedWebsite) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    function load() {
      setError("");
      setLoading(true);
      api<Overview>(`/overview?${rangeQuery(dateRange)}`)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((e) => {
          if (!cancelled) {
            setData(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    function onSynced() {
      load();
    }
    window.addEventListener("webastral:synced", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("webastral:synced", onSynced);
    };
  }, [selectedWebsite?.id, dateRange]);

  const softFails = useMemo(
    () =>
      (data?.platforms || []).filter((p) =>
        ["ERROR", "NEEDS_REAUTH"].includes(p.status)
      ),
    [data]
  );
  const dataStale = softFails.length > 0;
  const needsReauthHint = softFails.some((p) => p.status === "NEEDS_REAUTH");

  const {
    accessRevoked,
    message: revokeMessage,
    verifying: verifyingGoogle,
  } = useGoogleAccessVerify({
    clientId: selectedClient?.id,
    enabled: Boolean(selectedClient?.id && needsReauthHint),
  });

  const needsSync = useMemo(() => {
    if (!data || !selectedWebsite) return false;
    const anyActive = data.platforms.some((p) => p.status === "ACTIVE");
    const zeros =
      !data.kpis.organic_clicks &&
      !data.kpis.sessions &&
      !data.kpis.spend &&
      !data.kpis.primary_conversions;
    return anyActive && zeros;
  }, [data, selectedWebsite]);

  const clientLabel = displayClientName(selectedClient?.name);
  const integHref = selectedWebsite
    ? `/integrations?website_id=${selectedWebsite.id}`
    : "/integrations";

  const gscStatus = data?.platforms.find(
    (p) => p.key === "GOOGLE_SEARCH_CONSOLE"
  );
  const ga4Status = data?.platforms.find((p) => p.key === "GOOGLE_ANALYTICS");
  const adsStatus = data?.platforms.find((p) => p.key === "GOOGLE_ADS");
  const metaStatus = data?.platforms.find((p) => p.key === "META_ADS");

  return (
    <AdminShell title="Overview">
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SEO PERFORMANCE REPORT</p>
            <h1>
              {selectedWebsite?.url?.replace(/^https?:\/\//, "") ||
                "Website overview"}
            </h1>
            <p className="muted">
              {selectedWebsite
                ? `Monthly review · ${clientLabel} · ${user?.name?.split(" ")[0] || "Admin"}`
                : "Select a client and website in the top bar to load this report-style overview."}
            </p>
            {data?.range ? (
              <p className="muted" style={{ marginTop: 4 }}>
                Reporting period: <strong>{data.range.from}</strong> →{" "}
                <strong>{data.range.to}</strong>
                {" · "}vs prior {data.range.compareFrom} →{" "}
                {data.range.compareTo}
              </p>
            ) : null}
          </div>
          <div className="heading-actions">
            <Link className="secondary-button" href="/agency">
              Agency dashboard
            </Link>
            <Link className="secondary-button" href={integHref}>
              Integrations
            </Link>
            <Link className="primary-button" href="/reports/generate">
              Generate report
            </Link>
          </div>
        </div>

        <DateRangeBar
          presets={data?.presets}
          rangeFrom={data?.range.from}
          rangeTo={data?.range.to}
          compareFrom={data?.range.compareFrom}
          compareTo={data?.range.compareTo}
        />

        {error && (
          <div className="banner-error" style={{ marginBottom: 12 }}>
            {error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (!selectedWebsite) return;
                setError("");
                setLoading(true);
                api<Overview>(`/overview?${rangeQuery(dateRange)}`)
                  .then(setData)
                  .catch((e) => setError(e.message))
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </button>
          </div>
        )}

        {(verifyingGoogle || accessRevoked) && selectedClient ? (
          <AccessRevokedBanner
            clientId={selectedClient.id}
            clientName={selectedClient.name}
            message={revokeMessage}
            verifying={verifyingGoogle}
          />
        ) : null}

        {softFails.map((p) => (
          <div
            key={p.key}
            className="banner-error"
            style={{ marginBottom: 10 }}
          >
            {p.label} unavailable
            {p.last_error
              ? `: ${p.last_error}`
              : ` (${p.status.replace(/_/g, " ")})`}
            .{" "}
            <Link className="text-button" href={integHref}>
              Fix in Integrations →
            </Link>
          </div>
        ))}

        {needsSync && (
          <div className="banner-error" style={{ marginBottom: 12 }}>
            Connected sources show no rows for this range yet.{" "}
            <Link className="text-button" href={`${integHref}&tab=website`}>
              Sync on Integrations →
            </Link>
          </div>
        )}

        {!selectedWebsite && (
          <section className="panel empty-section" style={{ marginBottom: 16 }}>
            <h2>Select a website</h2>
            <p>
              Overview is the E-Moto-style SEO report for one website. Pick
              client + website in the top bar (shown on this page).
            </p>
            <Link className="primary-button" href="/clients">
              Open clients
            </Link>
          </section>
        )}

        {selectedWebsite && loading && !data && (
          <p className="muted">Loading report overview…</p>
        )}

        {selectedWebsite && data && (
          <>
            {/* 1 — E-Moto sample order */}
            <Section
              n={1}
              title="Objectives & key wins"
              subtitle="Campaign goals for this site + headline KPIs vs prior period"
            >
              <p style={{ fontWeight: 600, margin: "0 0 8px", fontSize: 13 }}>
                Campaign objectives
              </p>
              <ul className="report-wins" style={{ marginBottom: 16 }}>
                {OBJECTIVES.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <p style={{ fontWeight: 600, margin: "0 0 8px", fontSize: 13 }}>
                Key wins this period
                {dataStale ? (
                  <span className="muted">
                    {" "}
                    · stale — reconnect Google, then Sync
                  </span>
                ) : null}
              </p>
              <div style={{ opacity: dataStale ? 0.55 : 1 }}>
              <MetricStrip
                tone="blue"
                items={[
                  {
                    label: "Organic clicks",
                    value: fmt(data.kpis.organic_clicks),
                    cur: data.kpis.organic_clicks,
                    prev: data.compare.organic_clicks,
                    note: "Search Console",
                  },
                  {
                    label: "Organic traffic (sessions)",
                    value: fmt(data.kpis.sessions),
                    cur: data.kpis.sessions,
                    prev: data.compare.sessions,
                    note: "GA4",
                  },
                  {
                    label: "Avg. position",
                    value:
                      data.kpis.avg_position != null
                        ? fmt(data.kpis.avg_position, 1)
                        : "—",
                    cur: Number(data.kpis.avg_position) || 0,
                    prev: Number(data.compare.avg_position) || 0,
                    note: "Search Console",
                  },
                  {
                    label: "Conversions",
                    value: fmt(data.kpis.primary_conversions),
                    cur: data.kpis.primary_conversions,
                    prev: data.compare.primary_conversions,
                    note: "GA4 + paid",
                  },
                  {
                    label: "Ad spend",
                    value: fmt(data.kpis.spend),
                    cur: data.kpis.spend,
                    prev: data.compare.spend,
                    note: "Ads + Meta",
                  },
                ]}
              />
              </div>
            </Section>

            <Section
              n={2}
              title="Keyword ranking update"
              subtitle="Keyword · Search vol. · Prev. position · Current position · Change"
            >
              <SpecTable
                columns={[
                  "Keyword",
                  "Search vol.",
                  "Prev. position",
                  "Current",
                  "Change",
                ]}
                rows={[]}
                emptyNote="No keyword rows yet — Phase 3 rank tracking. Table columns match the E-Moto sample §2."
              />
            </Section>

            <Section
              n={3}
              title="Backlink profile"
              subtitle="Total backlinks · Referring domains · Domain Rating · Lost links · Top new domains"
            >
              <MetricStrip
                tone="violet"
                items={[
                  {
                    label: "Total backlinks",
                    value: "—",
                    cur: 0,
                    prev: 0,
                    note: "Phase 3",
                  },
                  {
                    label: "Referring domains",
                    value: "—",
                    cur: 0,
                    prev: 0,
                    note: "Phase 3",
                  },
                  {
                    label: "Domain Rating",
                    value: "—",
                    cur: 0,
                    prev: 0,
                    note: "Phase 3",
                  },
                  {
                    label: "Lost links",
                    value: "—",
                    cur: 0,
                    prev: 0,
                    note: "Phase 3",
                  },
                ]}
              />
              <SpecTable
                columns={["Domain", "DR", "Link type", "Anchor"]}
                rows={[]}
                emptyNote="Top new referring domains — Phase 3 Backlinks connector (E-Moto sample §3)."
              />
            </Section>

            <Section
              n={4}
              title="Google Search Console update"
              subtitle={`Status: ${(gscStatus?.status || "NOT_STARTED").replace(/_/g, " ")}${
                gscStatus?.account_name ? ` · ${gscStatus.account_name}` : ""
              }${gscStatus?.last_sync_at ? ` · synced ${gscStatus.last_sync_at}` : ""}`}
            >
              <MetricStrip
                tone="orange"
                items={[
                  {
                    label: "Total clicks",
                    value: fmt(data.gsc?.kpis?.clicks),
                    cur: Number(data.gsc?.kpis?.clicks) || 0,
                    prev: Number(data.gsc?.compare?.clicks) || 0,
                  },
                  {
                    label: "Total impressions",
                    value: fmt(data.gsc?.kpis?.impressions),
                    cur: Number(data.gsc?.kpis?.impressions) || 0,
                    prev: Number(data.gsc?.compare?.impressions) || 0,
                  },
                  {
                    label: "Avg. CTR",
                    value: `${fmt(data.gsc?.kpis?.ctr, 1)}%`,
                    cur: Number(data.gsc?.kpis?.ctr) || 0,
                    prev: Number(data.gsc?.compare?.ctr) || 0,
                  },
                  {
                    label: "Avg. position",
                    value:
                      data.gsc?.kpis?.avg_position != null
                        ? fmt(data.gsc.kpis.avg_position, 1)
                        : "—",
                    cur: Number(data.gsc?.kpis?.avg_position) || 0,
                    prev: Number(data.gsc?.compare?.avg_position) || 0,
                  },
                ]}
              />
              <p style={{ fontWeight: 600, margin: "16px 0 8px", fontSize: 13 }}>
                Top performing queries
              </p>
              <SpecTable
                columns={["Query", "Clicks", "Impressions", "CTR", "Position"]}
                rows={[]}
                emptyNote="Query/page breakdown needs GSC Search Analytics dimension sync (payload). Totals above are live from daily snapshots."
              />
              <p className="muted" style={{ marginTop: 10 }}>
                <Link href="/platforms/gsc">Open Search Console channel →</Link>
              </p>
            </Section>

            <Section
              n={5}
              title="Google Analytics (GA4) update"
              subtitle={`Status: ${(ga4Status?.status || "NOT_STARTED").replace(/_/g, " ")}${
                ga4Status?.account_name ? ` · ${ga4Status.account_name}` : ""
              }${ga4Status?.last_sync_at ? ` · synced ${ga4Status.last_sync_at}` : ""}`}
            >
              <MetricStrip
                tone="green"
                items={[
                  {
                    label: "Sessions",
                    value: fmt(data.ga4?.kpis?.sessions),
                    cur: Number(data.ga4?.kpis?.sessions) || 0,
                    prev: Number(data.ga4?.compare?.sessions) || 0,
                  },
                  {
                    label: "Users",
                    value: fmt(data.ga4?.kpis?.users),
                    cur: Number(data.ga4?.kpis?.users) || 0,
                    prev: Number(data.ga4?.compare?.users) || 0,
                  },
                  {
                    label: "Engagement rate",
                    value: `${fmt(data.ga4?.kpis?.engagement_rate, 1)}%`,
                    cur: Number(data.ga4?.kpis?.engagement_rate) || 0,
                    prev: Number(data.ga4?.compare?.engagement_rate) || 0,
                  },
                  {
                    label: "Conversions",
                    value: fmt(data.ga4?.kpis?.primary_conversions),
                    cur: Number(data.ga4?.kpis?.primary_conversions) || 0,
                    prev: Number(data.ga4?.compare?.primary_conversions) || 0,
                  },
                ]}
              />
              <p style={{ fontWeight: 600, margin: "16px 0 8px", fontSize: 13 }}>
                Traffic by channel
              </p>
              <SpecTable
                columns={["Channel", "Sessions", "% of total", "Conversions"]}
                rows={[]}
                emptyNote="Channel grouping (Organic / Direct / Paid / Social / Referral) needs GA4 channel payload in sync — totals above are live."
              />
              <p className="muted" style={{ marginTop: 10 }}>
                <Link href="/platforms/ga4">Open GA4 channel →</Link>
              </p>
            </Section>

            <Section
              n="5b"
              title="Paid media (Google Ads + Meta)"
              subtitle={`Google Ads: ${(adsStatus?.status || "NOT_STARTED").replace(/_/g, " ")} · Meta: ${(metaStatus?.status || "NOT_STARTED").replace(/_/g, " ")}`}
            >
              <MetricStrip
                tone="violet"
                items={[
                  {
                    label: "Google Ads spend",
                    value: fmt(data.ads?.kpis?.spend),
                    cur: Number(data.ads?.kpis?.spend) || 0,
                    prev: Number(data.ads?.compare?.spend) || 0,
                  },
                  {
                    label: "Google Ads clicks",
                    value: fmt(data.ads?.kpis?.clicks),
                    cur: Number(data.ads?.kpis?.clicks) || 0,
                    prev: Number(data.ads?.compare?.clicks) || 0,
                  },
                  {
                    label: "Meta spend",
                    value: fmt(data.meta?.kpis?.spend),
                    cur: Number(data.meta?.kpis?.spend) || 0,
                    prev: Number(data.meta?.compare?.spend) || 0,
                  },
                  {
                    label: "Paid conversions",
                    value: fmt(
                      (Number(data.ads?.kpis?.primary_conversions) || 0) +
                        (Number(data.meta?.kpis?.primary_conversions) || 0)
                    ),
                    cur:
                      (Number(data.ads?.kpis?.primary_conversions) || 0) +
                      (Number(data.meta?.kpis?.primary_conversions) || 0),
                    prev:
                      (Number(data.ads?.compare?.primary_conversions) || 0) +
                      (Number(data.meta?.compare?.primary_conversions) || 0),
                  },
                ]}
              />
              <p className="muted" style={{ marginTop: 10 }}>
                <Link href="/platforms/google-ads">Google Ads →</Link>
                {" · "}
                <Link href="/platforms/meta">Meta Ads →</Link>
              </p>
            </Section>

            <Section
              n={6}
              title="Technical website health"
              subtitle="Core Web Vitals (mobile) · Crawl & indexation — E-Moto sample §6"
            >
              <p style={{ fontWeight: 600, margin: "0 0 8px", fontSize: 13 }}>
                Core Web Vitals (Mobile)
              </p>
              <SpecTable
                columns={["Metric", "Previous", "Current", "Target", "Status"]}
                rows={[
                  ["LCP", "—", "—", "< 2.5s", "Phase 3"],
                  ["INP", "—", "—", "< 200ms", "Phase 3"],
                  ["CLS", "—", "—", "< 0.1", "Phase 3"],
                  ["Site speed (avg)", "—", "—", "< 3.0s", "Phase 3"],
                ]}
                emptyNote=""
              />
              <p style={{ fontWeight: 600, margin: "16px 0 8px", fontSize: 13 }}>
                Crawl & indexation health
              </p>
              <SpecTable
                columns={["Check", "Result", "Notes"]}
                rows={[
                  ["Pages indexed", "—", "Site Audit Phase 3"],
                  ["Crawl errors (4xx/5xx)", "—", "Site Audit Phase 3"],
                  ["Redirect chains", "—", "Site Audit Phase 3"],
                  ["Mobile usability", "—", "Site Audit Phase 3"],
                  ["XML sitemap", "—", "Site Audit Phase 3"],
                  ["HTTPS / security", "—", "Site Audit Phase 3"],
                ]}
                emptyNote=""
              />
            </Section>

            <Section
              n={7}
              title="Competitor analysis"
              subtitle="Site · Domain Rating · Organic keywords · Est. traffic · Referring domains"
            >
              <SpecTable
                columns={[
                  "Site",
                  "Domain Rating",
                  "Organic keywords",
                  "Est. traffic/mo",
                  "Referring domains",
                ]}
                rows={[
                  [
                    selectedWebsite.url.replace(/^https?:\/\//, "") || "—",
                    "—",
                    "—",
                    fmt(data.kpis.sessions),
                    "—",
                  ],
                ]}
                emptyNote=""
              />
              <p style={{ fontWeight: 600, margin: "16px 0 8px", fontSize: 13 }}>
                Gaps found
              </p>
              <ul className="report-wins">
                <li>
                  Content gap — comparison / buying-guide pages (Phase 3
                  competitor pack).
                </li>
                <li>
                  Backlink gap — referring-domain delta vs peers (Phase 3).
                </li>
                <li>
                  Technical gap — thin/duplicate / CWV issues (Phase 3 audit).
                </li>
                <li>
                  On-page gap — FAQ / product schema (Phase 3).
                </li>
              </ul>
            </Section>

            <Section
              n={8}
              title="Recommendations & next steps"
              subtitle="Priority · Recommendation · Owner · Timeline"
            >
              <SpecTable
                columns={["Priority", "Recommendation", "Owner", "Timeline"]}
                rows={[
                  [
                    "High",
                    "Keep GA4 + Search Console ACTIVE; reconnect any NEEDS_REAUTH channel then Sync.",
                    "Admin",
                    "Ongoing",
                  ],
                  [
                    "High",
                    "Review organic click and session deltas vs prior; investigate drops over 10%.",
                    "SEO",
                    "This week",
                  ],
                  [
                    "Medium",
                    "Confirm Google Ads / Meta accounts linked for this website when paid is in scope.",
                    "Admin",
                    "This month",
                  ],
                  [
                    "Low",
                    "Enable keyword, backlink, and technical modules when Phase 3 connectors ship.",
                    "Product",
                    "Later",
                  ],
                ]}
                emptyNote=""
              />
            </Section>

            <Section
              title="Summary"
              subtitle="Plain-language period narrative (same engine as saved reports)"
            >
              <p className="report-summary" style={{ margin: 0 }}>
                {data.summary ||
                  "Summary appears after snapshots exist for this range."}
              </p>
            </Section>

            <Section
              title="Platform connection status"
              subtitle="Which sources are linked for this website"
            >
              <div className="website-list">
                {data.platforms.map((p) => {
                  const href =
                    p.status === "PENDING_SELECT"
                      ? `${integHref}&tab=website`
                      : PLATFORM_HREF[p.key] || integHref;
                  return (
                    <Link
                      key={p.key}
                      href={href}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <span className="site-favicon">
                        {p.label.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{p.label}</strong>
                        <small>
                          {p.account_name ||
                            p.last_error ||
                            p.status.replace(/_/g, " ")}
                          {p.last_sync_at ? ` · ${p.last_sync_at}` : ""}
                        </small>
                      </span>
                      <span
                        className={`status ${
                          p.status === "ACTIVE" ? "active" : "attention"
                        }`}
                      >
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
