"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell, { PageHeader } from "../../components/admin-shell";
import AccessRevokedBanner from "../../components/access-revoked-banner";
import { api, type Client, type Website } from "../../../lib/api";
import { useGoogleAccessVerify } from "../../../lib/use-google-access-verify";
import { useSession } from "../../providers";

type PlatformRow = {
  key: string;
  label: string;
  status: string;
  account_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

type ResearchWebsite = {
  id: number;
  name: string;
  url: string;
  platforms: PlatformRow[];
};

type Research = {
  client: Client;
  agencyGoogle: {
    linked: boolean;
    hasAdsScope?: boolean;
    source?: string | null;
    cleared?: boolean;
  } | null;
  websites: ResearchWebsite[];
};

type ClientOverview = {
  grain: string;
  range_label: string;
  totals: {
    websites: number;
    connections_active: number;
    connections_error: number;
    connections_needs_reauth: number;
    connections_pending_select: number;
  };
  kpis: {
    organic_clicks: number;
    sessions: number;
    spend: number;
    primary_conversions: number;
  };
};

function statusClass(status: string) {
  if (status === "ACTIVE") return "active";
  if (status === "ERROR" || status === "NEEDS_REAUTH") return "attention";
  return "attention";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export default function ClientDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.clientId);
  const { selectClient, selectWebsite, selectedClient, selectedWebsite, apply } =
    useSession();
  const [client, setClient] = useState<Client | null>(null);
  const [sites, setSites] = useState<Website[]>([]);
  const [research, setResearch] = useState<Research | null>(null);
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [error, setError] = useState("");
  const [disconnectGoogle, setDisconnectGoogle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadingResearch, setLoadingResearch] = useState(true);
  // Session matched this URL client (ref resets sync on id change — prevents 5↔9 loops)
  const readyForUrlRef = useRef(false);

  const loadResearch = useCallback(async () => {
    if (!id) return;
    setLoadingResearch(true);
    setOverview(null);
    try {
      const [data, rollup] = await Promise.all([
        api<Research>(`/clients/${id}/research`),
        api<ClientOverview>(`/clients/${id}/overview`).catch(() => null),
      ]);
      setResearch(data);
      setOverview(rollup);
      setClient(data.client);
      setSites(
        data.websites.map((w) => ({
          id: w.id,
          client_id: id,
          name: w.name,
          url: w.url,
          timezone: data.client.timezone || "Asia/Kolkata",
          currency: data.client.currency || "INR",
        }))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingResearch(false);
    }
  }, [id]);

  const {
    accessRevoked,
    message: revokeMessage,
    verifying: verifyingGoogle,
  } = useGoogleAccessVerify({
    clientId: id || null,
    enabled: Boolean(id) && !loadingResearch,
  });

  useEffect(() => {
    if (!id) return;
    readyForUrlRef.current = false;
    setError("");
    selectClient(id).catch((e) => setError(e.message));
    loadResearch().catch(() => undefined);
  }, [id, selectClient, loadResearch]);

  useEffect(() => {
    if (selectedClient?.id === id) {
      readyForUrlRef.current = true;
    }
  }, [selectedClient?.id, id]);

  // Top-bar moved off this URL client after we were ready → open that client page
  useEffect(() => {
    if (!readyForUrlRef.current) return;
    if (!selectedClient?.id || selectedClient.id === id) return;
    readyForUrlRef.current = false;
    router.replace(`/clients/${selectedClient.id}`);
  }, [selectedClient?.id, id, router]);

  const primaryWebsiteId =
    selectedWebsite?.client_id === id
      ? selectedWebsite.id
      : sites[0]?.id || null;

  async function openWebsiteOverview(websiteId?: number | null) {
    const wid = websiteId || primaryWebsiteId;
    if (!wid) {
      router.push("/clients");
      return;
    }
    try {
      await selectWebsite(wid);
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteClient() {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const q = disconnectGoogle ? "?disconnectGoogle=1" : "";
      const session = await api(
        `/clients/${client.id}${q}`,
        {
          method: "DELETE",
          body: JSON.stringify({ disconnectGoogle }),
        }
      );
      apply(session as Parameters<typeof apply>[0]);
      router.push("/clients");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const agency = research?.agencyGoogle;

  return (
    <AdminShell title="Client Details">
      <div className="page-content">
        <PageHeader
          eyebrow={`CLIENTS / ${(client?.name || "…").toUpperCase()}`}
          title={client?.name || "Client"}
          description={
            client
              ? `${sites.length} website${sites.length === 1 ? "" : "s"} · account health & rollup`
              : "Loading…"
          }
          action={
            <>
              <Link className="secondary-button" href="/agency">
                Agency dashboard
              </Link>
              <Link className="secondary-button" href="/clients">
                ← All clients
              </Link>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  openWebsiteOverview().catch(() => undefined);
                }}
              >
                Open Overview
              </button>
              <Link
                className="primary-button"
                href={`/clients/${id}/add-website`}
              >
                ＋ Add website
              </Link>
            </>
          }
        />
        {error && <div className="banner-error">{error}</div>}

        {(verifyingGoogle || accessRevoked) && client ? (
          <AccessRevokedBanner
            clientId={client.id}
            clientName={client.name}
            message={revokeMessage}
            verifying={verifyingGoogle}
          />
        ) : null}

        {overview && (
          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2>Client rollup</h2>
                <p className="muted">
                  {overview.range_label} across {overview.totals.websites}{" "}
                  website{overview.totals.websites === 1 ? "" : "s"} — not a
                  substitute for Website Overview
                </p>
              </div>
              {primaryWebsiteId ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    openWebsiteOverview(primaryWebsiteId).catch(() => undefined);
                  }}
                >
                  Open website Overview
                </button>
              ) : null}
            </div>
            <div
              className="metric-grid metric-grid-dense"
              style={{ marginTop: 12 }}
            >
              <div className="metric-card">
                <div className="metric-top">
                  <span>Websites</span>
                </div>
                <strong>{fmt(overview.totals.websites)}</strong>
                <div className="metric-bottom">
                  <span>
                    {fmt(overview.totals.connections_active)} active ·{" "}
                    {fmt(
                      overview.totals.connections_error +
                        overview.totals.connections_needs_reauth +
                        overview.totals.connections_pending_select
                    )}{" "}
                    need work
                  </span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Organic clicks</span>
                </div>
                <strong>{fmt(overview.kpis.organic_clicks)}</strong>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Sessions</span>
                </div>
                <strong>{fmt(overview.kpis.sessions)}</strong>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Ad spend</span>
                </div>
                <strong>{fmt(overview.kpis.spend)}</strong>
              </div>
            </div>
          </section>
        )}

        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <div>
              <h2>Agency Google</h2>
              <p className="muted">
                Portal login for invite-based access — inventory on Google
                accounts
              </p>
            </div>
            <Link className="text-button" href="/integrations?tab=accounts&view=google">
              Google accounts →
            </Link>
          </div>
          <div className="website-list">
            <div>
              <span className="site-favicon">G</span>
              <span>
                <strong>
                  {agency?.linked
                    ? "Agency Google linked"
                    : agency?.cleared
                      ? "Agency login cleared"
                      : "Agency Google not linked"}
                </strong>
                <small>
                  {agency?.linked
                    ? agency.hasAdsScope
                      ? "GA4 · Search Console · Ads scopes"
                      : "Linked — Ads scope may be missing (Reconnect on Google accounts)"
                    : "Optional — or connect each website with the client's Google"}
                </small>
              </span>
              <b
                className={`status ${agency?.linked ? "active" : "attention"}`}
              >
                {agency?.linked ? "Linked" : "Not linked"}
              </b>
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <div>
              <h2>How to get access (manual clients)</h2>
              <p className="muted">
                Prefer invite when possible; use per-website OAuth when they
                won&apos;t share access
              </p>
            </div>
          </div>
          <div className="website-list">
            <div>
              <span className="site-favicon">1</span>
              <span>
                <strong>Invite agency email (easiest)</strong>
                <small>
                  Ask the client to add your agency Gmail as Viewer on GA4, Full
                  user on Search Console, and read access on Google Ads — then
                  Integrations → Use portal Google
                </small>
              </span>
              <Link
                className="secondary-button"
                href={
                  primaryWebsiteId
                    ? `/integrations?website_id=${primaryWebsiteId}`
                    : "/integrations"
                }
              >
                Integrations
              </Link>
            </div>
            <div>
              <span className="site-favicon">2</span>
              <span>
                <strong>Per-website Google OAuth</strong>
                <small>
                  On a call / screen share, Integrations → Connect this
                  site&apos;s Google. Uses their Google login for this website
                  only — does not replace agency portal login
                </small>
              </span>
              <Link
                className="secondary-button"
                href={
                  primaryWebsiteId
                    ? `/integrations?website_id=${primaryWebsiteId}`
                    : "/integrations"
                }
              >
                Connect site Google
              </Link>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 12, padding: "0 4px" }}>
            Never ask clients for Client ID / Client Secret or refresh tokens.
            Those stay in your .env. They either invite your email or click Allow
            once on their Google account.
          </p>
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <div>
              <h2>Websites & connections</h2>
              <p className="muted">
                Attachment truth for this client — status, account, last sync,
                errors
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={loadingResearch}
              onClick={() => loadResearch()}
            >
              {loadingResearch ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadingResearch && !research && (
            <p className="muted">Loading connection health…</p>
          )}

          {!loadingResearch && !sites.length && (
            <div className="empty-section">
              <p>No websites yet.</p>
              <Link
                className="primary-button"
                href={`/clients/${id}/add-website`}
              >
                Add first website
              </Link>
              <Link
                className="secondary-button"
                href="/integrations?tab=accounts&view=google"
                style={{ marginLeft: 8 }}
              >
                Discover from Google
              </Link>
            </div>
          )}

          {(research?.websites || []).map((site) => (
            <div
              key={site.id}
              className="panel"
              style={{
                marginBottom: 12,
                boxShadow: "none",
                border: "1px solid #e8e6ef",
              }}
            >
              <div className="panel-header">
                <div>
                  <h2 style={{ fontSize: 15 }}>{site.name}</h2>
                  <p className="muted">{site.url}</p>
                </div>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedWebsite?.id === site.id ? (
                    <b className="status active">Selected</b>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        api(`/websites/${site.id}/select`, {
                          method: "POST",
                          body: "{}",
                        }).then((s) => apply(s as Parameters<typeof apply>[0]))
                      }
                    >
                      Select
                    </button>
                  )}
                  <Link
                    className="secondary-button"
                    href={`/integrations?website_id=${site.id}`}
                  >
                    Choose accounts
                  </Link>
                </span>
              </div>
              <div className="website-list">
                {site.platforms
                  .filter((p) => p.key !== "META_ADS" || p.status !== "NOT_STARTED")
                  .map((p) => (
                    <div key={p.key}>
                      <span className="site-favicon">
                        {p.label.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{p.label}</strong>
                        <small>
                          {p.account_name || statusLabel(p.status)}
                          {p.last_sync_at
                            ? ` · synced ${p.last_sync_at}`
                            : ""}
                          {p.last_error ? ` · ${p.last_error}` : ""}
                        </small>
                      </span>
                      <b className={`status ${statusClass(p.status)}`}>
                        {statusLabel(p.status)}
                      </b>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          {!research?.websites?.length && sites.length > 0 && !loadingResearch && (
            <p className="muted">Could not load platform rows — try Refresh.</p>
          )}
        </section>

        <section className="panel danger-panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div>
              <h2>Delete client</h2>
              <p className="muted">
                Removes this client from Webastral. Does not delete the
                client&apos;s GA4 property or Search Console site inside Google.
              </p>
            </div>
          </div>
          {!confirmOpen ? (
            <button
              type="button"
              className="danger-button"
              disabled={!client || busy}
              onClick={() => setConfirmOpen(true)}
            >
              Delete client…
            </button>
          ) : (
            <div className="delete-confirm">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={disconnectGoogle}
                  onChange={(e) => setDisconnectGoogle(e.target.checked)}
                />
                <span>
                  Also disconnect Google links for this client (revoke unique
                  tokens when possible). Agency Gmail login stays connected for
                  other clients.
                </span>
              </label>
              <p className="muted" style={{ margin: "10px 0" }}>
                This permanently deletes websites, connections, snapshots, and
                reports for <strong>{client?.name}</strong>.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={deleteClient}
                >
                  {busy
                    ? "Deleting…"
                    : disconnectGoogle
                      ? "Delete from dashboard + disconnect Google"
                      : "Delete from dashboard only"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
