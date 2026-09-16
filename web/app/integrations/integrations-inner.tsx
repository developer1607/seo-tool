"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api } from "../../lib/api";
import { useSession } from "../providers";
import GoogleInventory from "./google-inventory";
import WebsiteBindings from "./website-bindings";

type HubTab = "services" | "google" | "website";

function normalizeTab(
  raw: string | null,
  hasWebsiteId: boolean,
  googleFlag?: boolean
): HubTab {
  if (raw === "google" || raw === "import") return "google";
  if (raw === "website" || raw === "bind") return "website";
  if (raw === "services" || raw === "home") return "services";
  if (googleFlag) return "google";
  if (hasWebsiteId) return "website";
  return "services";
}

export default function IntegrationsInner() {
  const { platform, refresh, clients, selectedClient, selectedWebsite } =
    useSession();
  const search = useSearchParams();
  const router = useRouter();
  const websiteIdQ = Number(search.get("website_id") || 0) || null;
  const [tab, setTab] = useState<HubTab>(() =>
    normalizeTab(
      search.get("tab"),
      Boolean(websiteIdQ),
      search.get("google") === "1"
    )
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<
    {
      id: string;
      name: string;
      currency?: string | null;
      linked?: { website_id: number; client_id: number } | null;
    }[]
  >([]);
  const [metaTargetClientId, setMetaTargetClientId] = useState<number | "">(
    ""
  );
  const [metaTargetWebsiteId, setMetaTargetWebsiteId] = useState<number | "">(
    ""
  );
  const [metaSites, setMetaSites] = useState<{ id: number; name: string }[]>(
    []
  );

  const agency = platform?.agencyGoogle;
  const agencyLinked = Boolean(
    agency?.linked && !agency?.cleared && !agency?.needsReauth
  );
  const agencyNeedsReauth = Boolean(agency?.needsReauth);
  const meta = platform?.agencyMeta;
  const metaLinked = Boolean(meta?.linked && !meta?.cleared);
  const googleConfigured = Boolean(platform?.google);
  const metaConfigured = Boolean(platform?.meta);

  useEffect(() => {
    setTab(
      normalizeTab(
        search.get("tab"),
        Boolean(websiteIdQ),
        search.get("google") === "1"
      )
    );
  }, [search, websiteIdQ]);

  useEffect(() => {
    const err = search.get("google_error") || search.get("meta_error");
    if (err) setError(err);
    if (search.get("google") === "1") {
      setMessage("Google connected. Browse accounts to import or link.");
      setTab("google");
    }
    if (search.get("meta") === "1") {
      setMessage("Meta connected. Link an ad account to a website below.");
      setTab("services");
      loadMetaAccounts().catch(() => undefined);
    }
    if (
      typeof window !== "undefined" &&
      (err || search.get("google") === "1" || search.get("meta") === "1") &&
      !websiteIdQ
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      url.searchParams.delete("google_error");
      url.searchParams.delete("meta");
      url.searchParams.delete("meta_error");
      if (!url.searchParams.get("tab")) {
        url.searchParams.set(
          "tab",
          search.get("meta") === "1" ? "services" : "google"
        );
      }
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search, websiteIdQ]);

  const loadMetaAccounts = useCallback(async () => {
    if (!metaLinked) {
      setMetaAccounts([]);
      return;
    }
    try {
      const d = await api<{
        accounts: typeof metaAccounts;
        error?: string;
      }>("/integrations/meta/accounts");
      setMetaAccounts(d.accounts || []);
      if (d.error) setError(d.error);
    } catch (e) {
      setMetaAccounts([]);
      setError((e as Error).message);
    }
  }, [metaLinked]);

  useEffect(() => {
    if (tab === "services" && metaLinked) {
      loadMetaAccounts().catch(() => undefined);
    }
  }, [tab, metaLinked, loadMetaAccounts]);

  useEffect(() => {
    if (metaTargetClientId || !selectedClient?.id) return;
    setMetaTargetClientId(selectedClient.id);
    api<{ websites: { id: number; name: string }[] }>(
      `/clients/${selectedClient.id}/research`
    )
      .then((d) => {
        const sites = (d.websites || []).map((w) => ({
          id: w.id,
          name: w.name,
        }));
        setMetaSites(sites);
        if (selectedWebsite?.id && sites.some((s) => s.id === selectedWebsite.id)) {
          setMetaTargetWebsiteId(selectedWebsite.id);
        } else if (sites.length === 1) {
          setMetaTargetWebsiteId(sites[0].id);
        }
      })
      .catch(() => undefined);
  }, [selectedClient?.id, selectedWebsite?.id, metaTargetClientId]);

  const goTab = useCallback(
    (next: HubTab) => {
      setTab(next);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      if (next !== "website") url.searchParams.delete("website_id");
      router.replace(url.pathname + "?" + url.searchParams.toString());
    },
    [router]
  );

  async function connectGoogleData(opts?: { mode?: "replace" | "add" }) {
    const mode = opts?.mode || "replace";
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        mode: "discover",
        format: "json",
        connect: mode,
      });
      const d = await api<{ url: string }>(
        `/integrations/google/start?${params.toString()}`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function disconnectGoogleData() {
    if (
      !window.confirm(
        "Disconnect agency Google data access? Website links stay; you will need to Connect again to browse inventory."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/integrations/google/agency/disconnect", {
        method: "POST",
        body: "{}",
      });
      setMessage("Agency Google data access cleared.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connectMeta() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ url: string }>(
        "/integrations/meta/start?format=json"
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function disconnectMeta() {
    if (!window.confirm("Disconnect Meta data access?")) return;
    setBusy(true);
    try {
      await api("/integrations/meta/agency/disconnect", {
        method: "POST",
        body: "{}",
      });
      setMessage("Meta disconnected.");
      setMetaAccounts([]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function linkMetaAccount(accountId: string, name: string) {
    const websiteId = Number(metaTargetWebsiteId || 0);
    if (!websiteId) {
      setError("Choose a website, then link this Meta ad account.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/integrations/meta/select", {
        method: "POST",
        body: JSON.stringify({
          website_id: websiteId,
          external_account_id: accountId,
          external_account_name: name,
          sync: true,
        }),
      });
      await refresh();
      await loadMetaAccounts();
      setMessage(`Linked ${name} to website ${websiteId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Integrations">
      <div className="page-content">
        <PageHeader
          eyebrow="SETUP"
          title="Integrations"
          description="Connect services to your Webastral account (like Cursor connects GitHub). Sign-in with Google is separate under Settings."
        />

        {(message || error) && (
          <section className="panel" style={{ marginBottom: 16 }}>
            {message && <p style={{ margin: 0 }}>{message}</p>}
            {error && (
              <p
                style={{
                  margin: message ? "8px 0 0" : 0,
                  color: "#b42318",
                }}
              >
                {error}
              </p>
            )}
          </section>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            className={
              tab === "services" ? "primary-button" : "secondary-button"
            }
            onClick={() => goTab("services")}
          >
            Connected services
          </button>
          <button
            type="button"
            className={tab === "google" ? "primary-button" : "secondary-button"}
            onClick={() => goTab("google")}
          >
            Google · Import
          </button>
          <button
            type="button"
            className={
              tab === "website" ? "primary-button" : "secondary-button"
            }
            onClick={() => goTab("website")}
          >
            Link to website
          </button>
        </div>

        {tab === "services" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Google</h2>
                  <p className="muted">
                    GA4 · Search Console · Ads inventory for Import / Link
                  </p>
                </div>
                <b
                  className={`status ${agencyLinked ? "active" : "attention"}`}
                >
                  {agencyNeedsReauth
                    ? "Needs reconnect"
                    : agencyLinked
                      ? agency?.email || "Connected"
                      : "Not connected"}
                </b>
              </div>
              <p className="muted" style={{ padding: "0 4px" }}>
                This is <strong>data</strong> access — not the same as Continue
                with Google on the login page.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "12px 4px 4px",
                }}
              >
                {!googleConfigured ? (
                  <Link className="secondary-button" href="/settings">
                    Configure env
                  </Link>
                ) : agencyLinked ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => goTab("google")}
                    >
                      Browse &amp; import
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        connectGoogleData({ mode: "add" }).catch(() => undefined);
                      }}
                    >
                      Add Google account
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        connectGoogleData({ mode: "replace" }).catch(
                          () => undefined
                        );
                      }}
                    >
                      Reconnect
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        disconnectGoogleData().catch(() => undefined);
                      }}
                    >
                      Disconnect all
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => {
                      connectGoogleData({ mode: "replace" }).catch(
                        () => undefined
                      );
                    }}
                  >
                    {busy ? "Redirecting…" : "Connect Google"}
                  </button>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Meta Ads</h2>
                  <p className="muted">
                    Facebook Login for Business · Ads insights
                  </p>
                </div>
                <b className={`status ${metaLinked ? "active" : "attention"}`}>
                  {metaLinked ? meta?.name || meta?.email || "Connected" : "Not connected"}
                </b>
              </div>
              <p className="muted" style={{ padding: "0 4px" }}>
                Connect Meta, then link an ad account to a website (same idea as
                Google Ads).
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "12px 4px 4px",
                }}
              >
                {!metaConfigured ? (
                  <Link className="secondary-button" href="/settings">
                    Add META_APP_ID in Settings / .env
                  </Link>
                ) : metaLinked ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        loadMetaAccounts().catch(() => undefined);
                      }}
                    >
                      Refresh accounts
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        connectMeta().catch(() => undefined);
                      }}
                    >
                      Reconnect
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        disconnectMeta().catch(() => undefined);
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => {
                      connectMeta().catch(() => undefined);
                    }}
                  >
                    {busy ? "Redirecting…" : "Connect Meta"}
                  </button>
                )}
              </div>

              {metaLinked && (
                <div style={{ padding: "8px 4px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 12,
                      alignItems: "center",
                    }}
                  >
                    <label className="muted" htmlFor="meta-client">
                      Client
                    </label>
                    <select
                      id="meta-client"
                      value={metaTargetClientId}
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        setMetaTargetClientId(cid || "");
                        setMetaTargetWebsiteId("");
                        setMetaSites([]);
                        if (!cid) return;
                        api<{ websites: { id: number; name: string }[] }>(
                          `/clients/${cid}/research`
                        )
                          .then((d) => {
                            const sites = (d.websites || []).map((w) => ({
                              id: w.id,
                              name: w.name,
                            }));
                            setMetaSites(sites);
                            if (sites.length === 1) {
                              setMetaTargetWebsiteId(sites[0].id);
                            }
                          })
                          .catch((err) => setError(err.message));
                      }}
                      style={{ minHeight: 40, minWidth: 160 }}
                    >
                      <option value="">Select client…</option>
                      {(clients || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <label className="muted" htmlFor="meta-site">
                      Website
                    </label>
                    <select
                      id="meta-site"
                      value={metaTargetWebsiteId}
                      onChange={(e) =>
                        setMetaTargetWebsiteId(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      style={{ minHeight: 40, minWidth: 200 }}
                    >
                      <option value="">Select website…</option>
                      {metaSites.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="website-list">
                    {metaAccounts.map((row) => (
                      <div key={row.id}>
                        <span className="site-favicon">M</span>
                        <span>
                          <strong>{row.name}</strong>
                          <small>
                            {row.id}
                            {row.currency ? ` · ${row.currency}` : ""}
                          </small>
                        </span>
                        {row.linked ? (
                          <Link
                            className="secondary-button"
                            href={`/clients/${row.linked.client_id}`}
                          >
                            Open client
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="primary-button"
                            disabled={busy || !Number(metaTargetWebsiteId || 0)}
                            onClick={() => {
                              linkMetaAccount(row.id, row.name).catch(
                                () => undefined
                              );
                            }}
                          >
                            Link to website
                          </button>
                        )}
                      </div>
                    ))}
                    {!metaAccounts.length && (
                      <div className="empty-section">
                        <p className="muted">
                          No ad accounts returned — check Meta app permissions
                          (ads_read) and Business access.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "google" && <GoogleInventory hideChrome />}

        {tab === "website" && <WebsiteBindings />}
      </div>
    </AdminShell>
  );
}
