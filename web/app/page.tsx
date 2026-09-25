"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "./components/admin-shell";
import AccessRevokedBanner from "./components/access-revoked-banner";
import DateRangeBar from "./components/date-range-bar";
import SeoAaDashboard, {
  type HeroPayload,
  type RankingPoint,
} from "./components/seo-aa-dashboard";
import {
  AaChartMeta,
  KEYWORD_TABLE_EXPLAIN,
  RANK_BUCKET_LEGEND,
} from "./components/aa-chart-meta";
import TrendBadge from "./components/trend-badge";
import { api } from "../lib/api";
import { rangeQuery } from "../lib/date-range";
import { useGoogleAccessVerify } from "../lib/use-google-access-verify";
import { useSession } from "./providers";

type SourceBlock = {
  kpis: Record<string, number | null>;
  compare: Record<string, number | null>;
};

type KeywordRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  prev_position?: number | null;
  position_change?: number | null;
  origin?: string;
};

type TopQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
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
  keywords?: KeywordRow[];
  topQueries?: TopQueryRow[];
  rankingSeries?: RankingPoint[];
  hero?: HeroPayload;
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

function fmtPos(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return fmt(n, 1);
}

function fmtChange(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmt(v, 1)}`;
}

function deltaClass(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "flat";
  if (Number(n) > 0.05) return "up";
  if (Number(n) < -0.05) return "down";
  return "flat";
}

const PLATFORM_HREF: Record<string, string> = {
  GOOGLE_ADS: "/platforms/google-ads",
  META_ADS: "/platforms/meta",
  GOOGLE_ANALYTICS: "/platforms/ga4",
  GOOGLE_SEARCH_CONSOLE: "/platforms/gsc",
};

function statusLabel(status: string) {
  if (status === "ACCESS_NOT_GIVEN") return "ACCESS NOT GIVEN";
  return status.replace(/_/g, " ");
}

const EMPTY_HERO: HeroPayload = {
  googleChange: 0,
  googleDecline: 0,
  googleRankings: 0,
  keywordsTracked: 0,
  visibility: 0,
  scores: [
    { id: "ctr", label: "CTR score", value: 0, note: "—" },
    { id: "engagement", label: "Engagement score", value: 0, note: "—" },
    { id: "top10", label: "Top-10 share", value: 0, note: "—" },
    { id: "momentum", label: "Click momentum", value: 0, note: "—" },
  ],
};

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

  return (
    <AdminShell title="Overview">
      <div className="page-content aa-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SEO REPORT</p>
            <h1>
              {selectedWebsite?.url?.replace(/^https?:\/\//, "") ||
                "Website overview"}
            </h1>
            <p className="muted">
              {selectedWebsite
                ? `${clientLabel} · ${user?.name?.split(" ")[0] || "Admin"}`
                : "Select a client and website in the top bar."}
            </p>
            {data?.range ? (
              <p className="muted" style={{ marginTop: 4 }}>
                {data.range.from} → {data.range.to}
                {" · "}vs {data.range.compareFrom} → {data.range.compareTo}
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
              : ` (${statusLabel(p.status)})`}
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
              Overview is the client SEO dashboard for one website. Pick client
              + website in the top bar.
            </p>
            <Link className="primary-button" href="/clients">
              Open clients
            </Link>
          </section>
        )}

        {selectedWebsite && loading && !data && (
          <p className="muted">Loading SEO dashboard…</p>
        )}

        {selectedWebsite && data && (
          <>
            <SeoAaDashboard
              rankingSeries={data.rankingSeries || []}
              hero={data.hero || EMPTY_HERO}
            />

            <div className="aa-kpi-strip">
              {[
                {
                  label: "Organic clicks",
                  value: fmt(data.kpis.organic_clicks),
                  cur: data.kpis.organic_clicks,
                  prev: data.compare.organic_clicks,
                  note: "Search Console clicks into the site",
                },
                {
                  label: "Impressions",
                  value: fmt(data.gsc?.kpis?.impressions),
                  cur: Number(data.gsc?.kpis?.impressions) || 0,
                  prev: Number(data.gsc?.compare?.impressions) || 0,
                  note: "Times your links appeared in Google",
                },
                {
                  label: "Avg. position",
                  value: fmtPos(data.kpis.avg_position),
                  cur: Number(data.kpis.avg_position) || 0,
                  prev: Number(data.compare.avg_position) || 0,
                  note: "Lower is better (site-wide average)",
                },
                {
                  label: "Sessions",
                  value: fmt(data.kpis.sessions),
                  cur: data.kpis.sessions,
                  prev: data.compare.sessions,
                  note: "GA4 sessions (all channels)",
                },
                {
                  label: "Conversions",
                  value: fmt(data.kpis.primary_conversions),
                  cur: data.kpis.primary_conversions,
                  prev: data.compare.primary_conversions,
                  note: "GA4 key events + paid conversions",
                },
              ].map((m) => (
                <article className="aa-card aa-card-mini" key={m.label}>
                  <span className="aa-card-title">{m.label}</span>
                  <strong>{m.value}</strong>
                  <div className="aa-mini-trend">
                    <TrendBadge cur={m.cur} prev={m.prev} />
                  </div>
                  <p className="aa-stat-explain">{m.note}</p>
                </article>
              ))}
            </div>

            <div className="aa-lower-grid">
              <article className="aa-card aa-card-table">
                <header className="aa-card-head">
                  <span className="aa-card-icon" aria-hidden>
                    ▮
                  </span>
                  <span className="aa-card-title">Keyword rankings</span>
                  <span className="aa-card-meta">
                    Showing {data.keywords?.length || 0} rows
                  </span>
                </header>
                <div className="aa-table-scroll">
                  <table className="aa-table">
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th>Clicks</th>
                        <th>Impr.</th>
                        <th>Prev</th>
                        <th>Current</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.keywords || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Sync Search Console or track keywords on the GSC
                            channel.
                          </td>
                        </tr>
                      ) : (
                        (data.keywords || []).map((k) => {
                          const kind = deltaClass(k.position_change);
                          return (
                            <tr key={k.query}>
                              <td>
                                {k.query}
                                {k.origin === "custom" ? (
                                  <em className="aa-tag">Tracked</em>
                                ) : null}
                              </td>
                              <td>{fmt(k.clicks)}</td>
                              <td>{fmt(k.impressions)}</td>
                              <td>{fmtPos(k.prev_position)}</td>
                              <td>{fmtPos(k.avg_position)}</td>
                              <td className={`seo-delta ${kind}`}>
                                {kind === "up"
                                  ? "▲ "
                                  : kind === "down"
                                    ? "▼ "
                                    : ""}
                                {fmtChange(k.position_change)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <AaChartMeta
                  items={RANK_BUCKET_LEGEND}
                  explain={KEYWORD_TABLE_EXPLAIN}
                />
                <p className="aa-card-foot">
                  <Link href="/platforms/gsc">Manage keywords →</Link>
                </p>
              </article>

              <article className="aa-card aa-card-table">
                <header className="aa-card-head">
                  <span className="aa-card-icon" aria-hidden>
                    ▮
                  </span>
                  <span className="aa-card-title">Top queries</span>
                </header>
                <div className="aa-table-scroll">
                  <table className="aa-table">
                    <thead>
                      <tr>
                        <th>Query</th>
                        <th>Clicks</th>
                        <th>Impr.</th>
                        <th>CTR</th>
                        <th>Pos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.topQueries || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            Top queries appear after GSC sync.
                          </td>
                        </tr>
                      ) : (
                        (data.topQueries || []).map((q) => (
                          <tr key={q.query}>
                            <td>{q.query}</td>
                            <td>{fmt(q.clicks)}</td>
                            <td>{fmt(q.impressions)}</td>
                            <td>{fmt(q.ctr, 1)}%</td>
                            <td>{fmtPos(q.avg_position)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <AaChartMeta
                  explain={[
                    "Query — search term from Google Search Console",
                    "CTR — clicks ÷ impressions for that query in this period",
                    "Pos — average ranking position (lower is better)",
                  ]}
                />
              </article>
            </div>

            <div className="aa-lower-grid aa-lower-grid-3">
              <article className="aa-card">
                <header className="aa-card-head">
                  <span className="aa-card-title">Paid media</span>
                </header>
                <div className="aa-stat-list">
                  <div>
                    <span>Google Ads spend</span>
                    <strong>{fmt(data.ads?.kpis?.spend)}</strong>
                  </div>
                  <div>
                    <span>Meta spend</span>
                    <strong>{fmt(data.meta?.kpis?.spend)}</strong>
                  </div>
                  <div>
                    <span>Paid conversions</span>
                    <strong>
                      {fmt(
                        (Number(data.ads?.kpis?.primary_conversions) || 0) +
                          (Number(data.meta?.kpis?.primary_conversions) || 0)
                      )}
                    </strong>
                  </div>
                </div>
                <p className="aa-card-foot">
                  <Link href="/platforms/google-ads">Ads →</Link>
                  {" · "}
                  <Link href="/platforms/meta">Meta →</Link>
                </p>
              </article>

              <article className="aa-card">
                <header className="aa-card-head">
                  <span className="aa-card-title">Summary</span>
                </header>
                <p className="aa-summary">
                  {data.summary ||
                    "Summary appears after snapshots exist for this range."}
                </p>
              </article>

              <article className="aa-card">
                <header className="aa-card-head">
                  <span className="aa-card-title">Connections</span>
                </header>
                <ul className="aa-conn-list">
                  {data.platforms.map((p) => (
                    <li key={p.key}>
                      <span>{p.label}</span>
                      <Link
                        href={
                          p.status === "PENDING_SELECT" ||
                          p.status === "ACCESS_NOT_GIVEN"
                            ? `${integHref}&tab=website`
                            : PLATFORM_HREF[p.key] || integHref
                        }
                        className={`status ${
                          p.status === "ACTIVE" ? "active" : "attention"
                        }`}
                      >
                        {statusLabel(p.status)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
