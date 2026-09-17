"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api } from "../../lib/api";
import { useSession } from "../providers";

type Attention = {
  provider: string;
  status: string;
  last_error: string | null;
  website_id: number;
  website_name: string;
  client_id: number;
  client_name: string;
  href: string;
};

type AgencyOverview = {
  grain: string;
  range_label: string;
  totals: {
    clients: number;
    websites: number;
    connections_active: number;
    connections_error: number;
    connections_needs_reauth: number;
    connections_pending_select: number;
    connections_pending_auth: number;
  };
  kpis: {
    organic_clicks: number;
    sessions: number;
    spend: number;
    primary_conversions: number;
  };
  attention: Attention[];
  agencyGoogle?: { linked?: boolean; hasAdsScope?: boolean } | null;
  unreadCount?: number;
};

function fmt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function providerLabel(p: string) {
  return p.replace(/_/g, " ");
}

function statusLabel(s: string) {
  return s.replace(/_/g, " ");
}

export default function AgencyDashboardPage() {
  const { platform } = useSession();
  const [data, setData] = useState<AgencyOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<AgencyOverview>("/agency/overview")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = data?.totals;
  const needsWork =
    (totals?.connections_error || 0) +
    (totals?.connections_needs_reauth || 0) +
    (totals?.connections_pending_select || 0) +
    (totals?.connections_pending_auth || 0);

  return (
    <AdminShell title="Agency">
      <div className="page-content">
        <PageHeader
          eyebrow="AGENCY"
          title="Agency dashboard"
          description="Portfolio health across clients — what’s broken, pending, or ready. Website metrics stay on Overview."
          action={
            <>
              <Link className="secondary-button" href="/integrations">
                {data?.agencyGoogle?.linked || platform?.agencyGoogle?.linked
                  ? "Integrations"
                  : "Connect Google"}
              </Link>
              <Link className="primary-button" href="/clients">
                All clients
              </Link>
            </>
          }
        />

        {error && <div className="banner-error">{error}</div>}
        {loading && !data && <p className="muted">Loading portfolio…</p>}

        {data && (
          <>
            <div className="metric-grid metric-grid-dense agency-ops-grid">
              <div className="metric-card">
                <div className="metric-top">
                  <span>Clients</span>
                </div>
                <strong>{fmt(data.totals.clients)}</strong>
                <div className="metric-bottom">
                  <span>{fmt(data.totals.websites)} websites</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Connections OK</span>
                </div>
                <strong>{fmt(data.totals.connections_active)}</strong>
                <div className="metric-bottom">
                  <span>Active links</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Needs attention</span>
                </div>
                <strong>{fmt(needsWork)}</strong>
                <div className="metric-bottom">
                  <span>
                    {data.totals.connections_error} errors ·{" "}
                    {data.totals.connections_needs_reauth} reauth ·{" "}
                    {data.totals.connections_pending_select} pick account
                  </span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Agency Google</span>
                </div>
                <strong style={{ fontSize: 18 }}>
                  {data.agencyGoogle?.linked ? "Linked" : "Not linked"}
                </strong>
                <div className="metric-bottom">
                  <Link className="text-button" href="/integrations?tab=accounts&view=google">
                    Manage →
                  </Link>
                </div>
              </div>
            </div>

            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <div>
                  <h2>Book rollup</h2>
                  <p className="muted">
                    {data.range_label} across all websites — open a site Overview
                    for trends and channels
                  </p>
                </div>
                <Link className="secondary-button" href="/clients">
                  Open a client
                </Link>
              </div>
              <div className="metric-grid metric-grid-dense" style={{ marginTop: 12 }}>
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Organic clicks</span>
                  </div>
                  <strong>{fmt(data.kpis.organic_clicks)}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Sessions</span>
                  </div>
                  <strong>{fmt(data.kpis.sessions)}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Ad spend</span>
                  </div>
                  <strong>{fmtMoney(data.kpis.spend)}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Conversions</span>
                  </div>
                  <strong>{fmt(data.kpis.primary_conversions)}</strong>
                </div>
              </div>
            </section>

            <section className="panel integrations-panel">
              <div className="integrations-panel-hd">
                <strong>Needs attention</strong>
                <span>
                  {data.attention.length
                    ? `${data.attention.length} item${data.attention.length === 1 ? "" : "s"}`
                    : "All clear"}
                </span>
              </div>
              {!data.attention.length ? (
                <div className="empty-section" style={{ minHeight: 120 }}>
                  <p>No broken or pending connections.</p>
                  <Link className="secondary-button" href="/clients">
                    Browse clients
                  </Link>
                </div>
              ) : (
                <div className="integration-list">
                  {data.attention.map((row) => (
                    <div
                      key={`${row.website_id}-${row.provider}-${row.status}`}
                      className="integration-row"
                    >
                      <span className="site-favicon">
                        {providerLabel(row.provider).slice(0, 1)}
                      </span>
                      <div className="integration-meta">
                        <strong>
                          {row.client_name} · {row.website_name}
                        </strong>
                        <small>
                          {providerLabel(row.provider)}
                          {row.last_error ? ` · ${row.last_error}` : ""}
                        </small>
                      </div>
                      <b
                        className={`status integration-status ${
                          row.status === "ACTIVE" ? "active" : "attention"
                        }`}
                      >
                        {statusLabel(row.status)}
                      </b>
                      <div className="integration-actions">
                        <Link
                          className="secondary-button"
                          href={`/clients/${row.client_id}`}
                        >
                          Client
                        </Link>
                        <Link className="primary-button" href={row.href}>
                          Fix
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
