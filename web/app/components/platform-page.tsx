"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import AdminShell, { PageHeader } from "./admin-shell";
import AccessRevokedBanner from "./access-revoked-banner";
import DateRangeBar from "./date-range-bar";
import PlatformCharts from "./platform-charts";
import TrendBadge from "./trend-badge";
import { api } from "../../lib/api";
import { rangeQuery } from "../../lib/date-range";
import { useGoogleAccessVerify } from "../../lib/use-google-access-verify";
import { useSession } from "../providers";

type PlatformPayload = {
  key: string;
  title: string;
  providerKey: string;
  range: {
    label: string;
    from: string;
    to: string;
    compareFrom: string;
    compareTo: string;
    compareLabel: string;
    preset: string;
  };
  presets: { id: string; label: string }[];
  kpis: Record<string, number | null>;
  compare: Record<string, number | null>;
  status: {
    key: string;
    label: string;
    status: string;
    account_name: string | null;
    last_sync_at: string | null;
    last_error: string | null;
    hint?: string;
  } | null;
  rows: Array<Record<string, unknown>>;
  compareRows?: Array<Record<string, unknown>>;
  keywordRows?: Array<Record<string, unknown>>;
  trackedKeywords?: string[];
};

type Col = {
  key: string;
  label: string;
  format?: "int" | "pct" | "money" | "pos" | "rate";
};

const META: Record<
  string,
  { title: string; description: string; metrics: string[]; columns: Col[] }
> = {
  "google-ads": {
    title: "Google Ads",
    description: "Paid search and performance for the selected website.",
    metrics: [
      "spend",
      "clicks",
      "impressions",
      "ctr",
      "cpc",
      "primary_conversions",
      "primary_value",
      "roas",
      "cpa",
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "spend", label: "Spend", format: "money" },
      { key: "clicks", label: "Clicks", format: "int" },
      { key: "impressions", label: "Impr.", format: "int" },
      { key: "ctr", label: "CTR", format: "pct" },
      { key: "cpc", label: "CPC", format: "money" },
      { key: "primary_conversions", label: "Conv.", format: "int" },
      { key: "primary_value", label: "Value", format: "money" },
      { key: "roas", label: "ROAS", format: "rate" },
    ],
  },
  meta: {
    title: "Meta Ads",
    description: "Paid social performance for the selected website.",
    metrics: [
      "spend",
      "clicks",
      "impressions",
      "reach",
      "ctr",
      "cpc",
      "cpm",
      "primary_conversions",
      "cpa",
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "spend", label: "Spend", format: "money" },
      { key: "clicks", label: "Clicks", format: "int" },
      { key: "impressions", label: "Impr.", format: "int" },
      { key: "reach", label: "Reach", format: "int" },
      { key: "ctr", label: "CTR", format: "pct" },
      { key: "cpc", label: "CPC", format: "money" },
      { key: "cpm", label: "CPM", format: "money" },
      { key: "primary_conversions", label: "Conv.", format: "int" },
    ],
  },
  ga4: {
    title: "GA4",
    description: "Sessions, users, engagement, and key events from Analytics.",
    metrics: [
      "sessions",
      "users",
      "engaged_sessions",
      "engagement_rate",
      "primary_conversions",
      "days",
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "sessions", label: "Sessions", format: "int" },
      { key: "users", label: "Users", format: "int" },
      { key: "engaged_sessions", label: "Engaged", format: "int" },
      { key: "engagement_rate", label: "Eng. rate", format: "pct" },
      { key: "primary_conversions", label: "Key events", format: "int" },
    ],
  },
  gsc: {
    title: "Search Console",
    description: "Organic search clicks, impressions, CTR, and position.",
    metrics: ["clicks", "impressions", "ctr", "avg_position", "days"],
    columns: [
      { key: "date", label: "Date" },
      { key: "clicks", label: "Clicks", format: "int" },
      { key: "impressions", label: "Impr.", format: "int" },
      { key: "ctr", label: "CTR", format: "pct" },
      { key: "avg_position", label: "Position", format: "pos" },
    ],
  },
};

const METRIC_LABELS: Record<string, string> = {
  spend: "Spend",
  clicks: "Clicks",
  impressions: "Impressions",
  reach: "Reach",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cpa: "CPA",
  roas: "ROAS",
  sessions: "Sessions",
  users: "Users",
  engaged_sessions: "Engaged sessions",
  engagement_rate: "Engagement rate",
  primary_conversions: "Conversions",
  primary_value: "Conv. value",
  avg_position: "Avg position",
  days: "Days with data",
};

const GSC_KEYWORD_COLUMNS: Col[] = [
  { key: "query", label: "Keyword" },
  { key: "clicks", label: "Clicks", format: "int" },
  { key: "impressions", label: "Impr.", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "avg_position", label: "Position", format: "pos" },
];

function formatMetric(key: string, value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (key === "days") return String(Math.round(n));
  if (key === "spend" || key === "primary_value" || key === "cpc" || key === "cpm" || key === "cpa") {
    return n ? n.toFixed(key === "spend" || key === "primary_value" ? 0 : 2) : "—";
  }
  if (key === "ctr" || key === "engagement_rate") return `${n.toFixed(1)}%`;
  if (key === "avg_position") return n ? n.toFixed(1) : "—";
  if (key === "roas") return n ? `${n.toFixed(2)}x` : "—";
  return String(Math.round(n));
}

function cellValue(row: Record<string, unknown>, col: Col) {
  if (col.key === "date") return String(row.date);
  const clicks = Number(row.clicks) || 0;
  const impressions = Number(row.impressions) || 0;
  const spend = Number(row.spend) || 0;
  const sessions = Number(row.sessions) || 0;
  const engaged = Number(row.engaged_sessions) || 0;
  const value = Number(row.primary_value) || 0;

  let n: number | null = null;
  if (col.key === "cpc") n = clicks > 0 ? spend / clicks : null;
  else if (col.key === "cpm") n = impressions > 0 ? (spend / impressions) * 1000 : null;
  else if (col.key === "roas") n = spend > 0 && value > 0 ? value / spend : null;
  else if (col.key === "ctr") {
    n = impressions > 0 ? (clicks / impressions) * 100 : Number(row.ctr) || 0;
  } else if (col.key === "engagement_rate") {
    n =
      sessions > 0
        ? (engaged / sessions) * 100
        : Number(row.engagement_rate) || 0;
  } else {
    n = Number(row[col.key]);
    if (!Number.isFinite(n)) n = null;
  }

  if (n == null) return "—";
  if (col.format === "money") return n.toFixed(col.key === "spend" || col.key === "primary_value" ? 0 : 2);
  if (col.format === "pct") return `${n.toFixed(2)}%`;
  if (col.format === "pos") return n.toFixed(1);
  if (col.format === "rate") return `${n.toFixed(2)}x`;
  return String(Math.round(n));
}

function keywordCellValue(row: Record<string, unknown>, col: Col) {
  if (col.key === "query") return String(row.query || "");
  return cellValue(row, col);
}

function statusLabel(status: string) {
  if (status === "ACCESS_NOT_GIVEN") return "ACCESS NOT GIVEN";
  return status.replace(/_/g, " ");
}

export default function PlatformPage({
  platformKey,
}: {
  platformKey: string;
}) {
  const meta = META[platformKey];
  const { selectedClient, selectedWebsite, dateRange } = useSession();
  const selectedWebsiteId = selectedWebsite?.id;
  const [data, setData] = useState<PlatformPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordBusy, setKeywordBusy] = useState(false);
  const [keywordError, setKeywordError] = useState("");

  useEffect(() => {
    if (!meta || !selectedWebsiteId) {
      return;
    }
    let cancelled = false;
    function load() {
      setLoading(true);
      setError("");
      api<PlatformPayload>(
        `/platforms/${platformKey}?${rangeQuery(dateRange)}`
      )
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message);
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
  }, [meta, platformKey, selectedWebsiteId, dateRange]);

  const softFail =
    data?.status?.status === "ERROR" ||
    data?.status?.status === "NEEDS_REAUTH";

  const {
    accessRevoked,
    message: revokeMessage,
    verifying: verifyingGoogle,
  } = useGoogleAccessVerify({
    clientId: selectedClient?.id,
    enabled: Boolean(
      selectedClient?.id && data?.status?.status === "NEEDS_REAUTH"
    ),
  });

  const metrics = useMemo(() => {
    if (!meta) return [];
    return meta.metrics.map((key) => {
      let label = METRIC_LABELS[key] || key.replace(/_/g, " ");
      if (platformKey === "ga4" && key === "primary_conversions") {
        label = "Key events";
      }
      return {
        key,
        label,
        value: formatMetric(key, data?.kpis?.[key] as number),
        cur: Number(data?.kpis?.[key]) || 0,
        prev: Number(data?.compare?.[key]) || 0,
      };
    });
  }, [meta, data, platformKey]);

  async function addKeyword(e: FormEvent) {
    e.preventDefault();
    const query = keywordInput.trim();
    if (!query || keywordBusy) return;
    setKeywordBusy(true);
    setKeywordError("");
    try {
      const res = await api<{
        keywordRows: Array<Record<string, unknown>>;
        trackedKeywords: string[];
      }>(`/platforms/gsc/keywords?${rangeQuery(dateRange)}`, {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              keywordRows: res.keywordRows,
              trackedKeywords: res.trackedKeywords,
            }
          : prev
      );
      setKeywordInput("");
    } catch (err) {
      setKeywordError((err as Error).message || "Could not add keyword");
    } finally {
      setKeywordBusy(false);
    }
  }

  async function removeKeyword(query: string) {
    if (!query || keywordBusy) return;
    setKeywordBusy(true);
    setKeywordError("");
    try {
      const res = await api<{
        keywordRows: Array<Record<string, unknown>>;
        trackedKeywords: string[];
      }>(
        `/platforms/gsc/keywords?${rangeQuery(dateRange)}&query=${encodeURIComponent(query)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ query }),
        }
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              keywordRows: res.keywordRows,
              trackedKeywords: res.trackedKeywords,
            }
          : prev
      );
    } catch (err) {
      setKeywordError((err as Error).message || "Could not remove keyword");
    } finally {
      setKeywordBusy(false);
    }
  }

  if (!meta) {
    return (
      <AdminShell title="Platform">
        <div className="page-content">
          <p className="muted">Unknown platform.</p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={meta.title}>
      <div className="page-content aa-page">
        <PageHeader
          eyebrow="CHANNEL"
          title={meta.title}
          description={
            selectedWebsite
              ? `${selectedClient?.name || "Client"} · ${selectedWebsite.name} — ${meta.description}`
              : "Select a client and website to load this channel."
          }
          action={
            <Link
              className="secondary-button"
              href={
                selectedWebsite
                  ? `/integrations?website_id=${selectedWebsite.id}`
                  : "/integrations"
              }
            >
              Integrations
            </Link>
          }
        />

        <DateRangeBar
          presets={data?.presets}
          rangeFrom={data?.range.from}
          rangeTo={data?.range.to}
          compareFrom={data?.range.compareFrom}
          compareTo={data?.range.compareTo}
        />

        {error && <div className="banner-error">{error}</div>}

        {!selectedWebsite ? (
          <section className="panel empty-section">
            <h2>Select a website</h2>
            <p>Channel KPIs load for the website chosen in the top bar.</p>
            <Link className="primary-button" href="/clients">
              Clients
            </Link>
          </section>
        ) : (
          <>
            <article className="aa-card" style={{ marginBottom: 14 }}>
              <div className="list-summary" style={{ padding: 0 }}>
                <strong>
                  <span
                    className={`status ${
                      data?.status?.status === "ACTIVE"
                        ? "active"
                        : "attention"
                    }`}
                  >
                    {statusLabel(data?.status?.status || "NOT_STARTED")}
                  </span>
                  {" · "}
                  {data?.status?.account_name || meta.title}
                </strong>
                <span>
                  {data?.status?.last_sync_at
                    ? `Last sync ${data.status.last_sync_at}`
                    : "Not synced yet"}
                </span>
              </div>
              {(!data?.status ||
                data.status.status === "NOT_STARTED" ||
                data.status.status === "DISCONNECTED" ||
                data.status.status === "COMING_SOON") && (
                <div style={{ paddingTop: 12 }}>
                  {data?.status?.status === "COMING_SOON" ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {data?.status?.hint ||
                        (platformKey === "meta"
                          ? "Configure META_APP_ID / META_APP_SECRET in .env, then Connect Meta on Integrations."
                          : "Enable Google Ads API on your Cloud project, then Connect Google Ads on Integrations.")}
                    </p>
                  ) : (
                    <Link
                      className="primary-button"
                      href={
                        selectedWebsite
                          ? `/integrations?website_id=${selectedWebsite.id}`
                          : "/integrations"
                      }
                    >
                      Connect {meta.title}
                    </Link>
                  )}
                </div>
              )}
            </article>

            {softFail && (
              <div className="banner-error" style={{ marginBottom: 16 }}>
                {meta.title} unavailable
                {data?.status?.last_error
                  ? `: ${data.status.last_error}`
                  : ""}
                . Other platforms still load.
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

            <div
              className="aa-kpi-strip"
              style={{
                gridTemplateColumns: `repeat(${Math.min(metrics.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {metrics.map((m) => (
                <article className="aa-card aa-card-mini" key={m.key}>
                  <span className="aa-card-title">{m.label}</span>
                  <strong>{loading && !data ? "…" : m.value}</strong>
                  <div className="aa-mini-trend">
                    {m.key === "days" ? (
                      <span className="muted">in range</span>
                    ) : (
                      <>
                        <TrendBadge cur={m.cur} prev={m.prev} />
                        <span className="muted"> vs prior</span>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              {!data?.rows?.length ? (
                <article className="aa-card">
                  <header className="aa-card-head">
                    <span className="aa-card-icon">▮</span>
                    <span className="aa-card-title">Charts</span>
                  </header>
                  <p className="aa-empty" style={{ padding: "28px 8px" }}>
                    {data?.status?.status === "ACTIVE"
                      ? "ACTIVE but no snapshot rows for this date range — Sync under Integrations or widen the range."
                      : "No rows yet. Connect and sync under Integrations."}
                  </p>
                </article>
              ) : (
                <PlatformCharts
                  platformKey={platformKey}
                  rows={data.rows}
                  compareRows={data.compareRows || []}
                  thisLabel={
                    data.range.preset === "last_7" ? "This week" : "This period"
                  }
                  priorLabel={
                    data.range.preset === "last_7" ? "Last week" : "Prior period"
                  }
                />
              )}
            </div>

            <article className="aa-card aa-card-table">
              <header className="aa-card-head">
                <span className="aa-card-icon">▮</span>
                <span className="aa-card-title">Daily breakdown</span>
                <span className="aa-card-meta">
                  {meta.title} · this range
                </span>
              </header>
              {!data?.rows?.length ? (
                <p className="aa-empty" style={{ padding: "20px 8px" }}>
                  No snapshot rows for this range.
                </p>
              ) : (
                <div className="aa-table-scroll">
                  <table className="aa-table">
                    <thead>
                      <tr>
                        {meta.columns.map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={String(row.date)}>
                          {meta.columns.map((c) => (
                            <td key={c.key}>{cellValue(row, c)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            {platformKey === "gsc" && (
              <article className="aa-card aa-card-table" style={{ marginTop: 14 }}>
                <header className="aa-card-head">
                  <span className="aa-card-icon">▮</span>
                  <span className="aa-card-title">Top keywords</span>
                  <span className="aa-card-meta">
                    Top queries + tracked custom
                  </span>
                </header>

                <form className="gsc-keyword-form" onSubmit={addKeyword}>
                  <label className="gsc-keyword-field">
                    <span>Track custom keyword</span>
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="e.g. best seo agency delhi"
                      maxLength={200}
                      disabled={keywordBusy}
                    />
                  </label>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={keywordBusy || !keywordInput.trim()}
                  >
                    {keywordBusy ? "Saving…" : "Add keyword"}
                  </button>
                </form>
                {keywordError ? (
                  <p className="error-text gsc-keyword-error">{keywordError}</p>
                ) : null}
                <p className="muted gsc-keyword-hint">
                  Custom keywords stay tracked when they leave the top list. Sync
                  to refresh metrics.
                </p>

                {!data?.keywordRows?.length ? (
                  <p className="aa-empty" style={{ padding: "16px 8px" }}>
                    No keyword rows yet. Sync Search Console or add a custom
                    keyword above.
                  </p>
                ) : (
                  <div className="aa-table-scroll">
                    <table className="aa-table">
                      <thead>
                        <tr>
                          {GSC_KEYWORD_COLUMNS.map((c) => (
                            <th key={c.key}>{c.label}</th>
                          ))}
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.keywordRows.map((row) => {
                          const query = String(row.query || "");
                          const origin = String(row.origin || "auto");
                          return (
                            <tr key={`${origin}:${query}`}>
                              {GSC_KEYWORD_COLUMNS.map((c) => (
                                <td key={c.key}>
                                  {c.key === "query" ? (
                                    <>
                                      {keywordCellValue(row, c)}
                                      {origin === "custom" ? (
                                        <em className="aa-tag">Tracked</em>
                                      ) : null}
                                    </>
                                  ) : (
                                    keywordCellValue(row, c)
                                  )}
                                </td>
                              ))}
                              <td>
                                <button
                                  type="button"
                                  className="secondary-button gsc-keyword-remove"
                                  disabled={keywordBusy}
                                  onClick={() => removeKeyword(query)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="aa-chart-meta">
                  <div className="aa-rank-legend">
                    <span>
                      <i style={{ background: "#1f9d55" }} />
                      1-3
                    </span>
                    <span>
                      <i style={{ background: "#7dcc6a" }} />
                      4-10
                    </span>
                    <span>
                      <i style={{ background: "#f0c419" }} />
                      11-20
                    </span>
                    <span>
                      <i style={{ background: "#f08a24" }} />
                      21-50
                    </span>
                    <span>
                      <i style={{ background: "#e24c3b" }} />
                      51+
                    </span>
                  </div>
                  <ul className="aa-chart-explain">
                    <li>
                      <strong>Position</strong> — average Google ranking for
                      that query (bands above match the Overview rankings chart)
                    </li>
                    <li>
                      <strong>Tracked</strong> — custom keywords you pinned;
                      others are top auto queries
                    </li>
                  </ul>
                </div>
              </article>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
