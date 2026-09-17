'use client';

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api } from "../../lib/api";
import { useSession } from "../providers";
import GoogleInventory from "./google-inventory";
import WebsiteBindings from "./website-bindings";

type HubTab = "accounts" | "website";

type MetaAccount = {
  id: string;
  name: string;
  currency?: string | null;
  linked?: { website_id: number; client_id: number } | null;
};

function normalizeTab(
  raw: string | null,
  hasWebsiteId: boolean
): HubTab {
  if (raw === "website" || raw === "bind") return "website";
  if (raw === "google" || raw === "import") return "accounts";
  if (raw === "services" || raw === "home" || raw === "accounts") {
    return "accounts";
  }
  if (hasWebsiteId) return "website";
  return "accounts";
}

function wantsGoogleManage(search: URLSearchParams): boolean {
  const tab = search.get("tab");
  const view = search.get("view");
  return (
    view === "google" ||
    tab === "google" ||
    tab === "import" ||
    search.get("google") === "1"
  );
}

export default function IntegrationsInner() {
  const { platform, refresh, clients, selectedClient, selectedWebsite } =
    useSession();
  const search = useSearchParams();
  const router = useRouter();
  const websiteIdQ = Number(search.get("website_id") || 0) || null;
  const [tab, setTab] = useState<HubTab>(() =>
    normalizeTab(search.get("tab"), Boolean(websiteIdQ))
  );
  const [manageGoogle, setManageGoogle] = useState(() =>
    wantsGoogleManage(search)
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [metaAccountId, setMetaAccountId] = useState<string>("");
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

  const unlinkedMeta = useMemo(
    () => metaAccounts.filter((a) => !a.linked),
    [metaAccounts]
  );
  const linkedMeta = useMemo(
    () => metaAccounts.filter((a) => a.linked),
    [metaAccounts]
  );
  const selectedMeta = useMemo(
    () => unlinkedMeta.find((a) => a.id === metaAccountId) || null,
    [unlinkedMeta, metaAccountId]
  );

  useEffect(() => {
    setTab(normalizeTab(search.get("tab"), Boolean(websiteIdQ)));
    setManageGoogle(wantsGoogleManage(search));
  }, [search, websiteIdQ]);

  useEffect(() => {
    const err = search.get("google_error") || search.get("meta_error");
    if (err) setError(err);
    if (search.get("google") === "1") {
      setMessage("Google connected. Sync accounts, then import or link.");
      setTab("accounts");
      setManageGoogle(true);
    }
    if (search.get("meta") === "1") {
      setMessage("Meta connected. Choose an ad account and link it below.");
      setTab("accounts");
      setManageGoogle(false);
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
      if (search.get("meta") === "1") {
        url.searchParams.set("tab", "accounts");
        url.searchParams.delete("view");
      } else if (search.get("google") === "1") {
        url.searchParams.set("tab", "accounts");
        url.searchParams.set("view", "google");
      }
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search, websiteIdQ]);

  const loadMetaAccounts = useCallback(async () => {
    if (!metaLinked) {
      setMetaAccounts([]);
      setMetaAccountId("");
      return;
    }
    try {
      const d = await api<{
        accounts: MetaAccount[];
        error?: string;
      }>("/integrations/meta/accounts");
      const rows = d.accounts || [];
      setMetaAccounts(rows);
      if (d.error) setError(d.error);
      setMetaAccountId((prev) => {
        const still = rows.find((a) => a.id === prev && !a.linked);
        if (still) return still.id;
        const first = rows.find((a) => !a.linked);
        return first?.id || "";
      });
    } catch (e) {
      setMetaAccounts([]);
      setMetaAccountId("");
      setError((e as Error).message);
    }
  }, [metaLinked]);

  useEffect(() => {
    if (tab === "accounts" && metaLinked) {
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
        if (
          selectedWebsite?.id &&
          sites.some((s) => s.id === selectedWebsite.id)
        ) {
          setMetaTargetWebsiteId(selectedWebsite.id);
        } else if (sites.length === 1) {
          setMetaTargetWebsiteId(sites[0].id);
        }
      })
      .catch(() => undefined);
  }, [selectedClient?.id, selectedWebsite?.id, metaTargetClientId]);

  const goTab = useCallback(
    (next: HubTab, opts?: { manageGoogle?: boolean }) => {
      setTab(next);
      const showManage = Boolean(opts?.manageGoogle);
      setManageGoogle(showManage);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      if (next !== "website") url.searchParams.delete("website_id");
      if (next === "accounts" && showManage) {
        url.searchParams.set("view", "google");
      } else {
        url.searchParams.delete("view");
      }
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
      setManageGoogle(false);
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
      setMetaAccountId("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function linkSelectedMeta() {
    if (!selectedMeta) {
      setError("Choose a Meta ad account to link.");
      return;
    }
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
          external_account_id: selectedMeta.id,
          external_account_name: selectedMeta.name,
          sync: true,
        }),
      });
      await refresh();
      await loadMetaAccounts();
      setMessage(`Linked ${selectedMeta.name} to website ${websiteId}`);
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
          description="Connect Google and Meta for reporting data. Portal sign-in is under Settings."
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
              tab === "accounts" ? "primary-button" : "secondary-button"
            }
            onClick={() => goTab("accounts")}
          >
            Accounts
          </button>
          <button
            type="button"
            className={
              tab === "website" ? "primary-button" : "secondary-button"
            }
            onClick={() => goTab("website")}
          >
            Website links
          </button>
        </div>

        {tab === "accounts" && (
          <>
            <div className="content-grid">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Google</h2>
                    <p className="muted">GA4 · Search Console · Ads</p>
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
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    padding: "12px 4px 4px",
                  }}
                >
                  {!googleConfigured ? (
                    <Link className="secondary-button" href="/settings">
                      Configure env
                    </Link>
                  ) : agencyNeedsReauth ? (
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
                      {busy ? "Redirecting…" : "Reconnect"}
                    </button>
                  ) : agencyLinked ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          goTab("accounts", { manageGoogle: true })
                        }
                      >
                        Manage Google
                      </button>
                      <span
                        className="muted"
                        style={{
                          display: "inline-flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            connectGoogleData({ mode: "add" }).catch(
                              () => undefined
                            );
                          }}
                        >
                          Add account
                        </button>
                        <button
                          type="button"
                          className="text-button"
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
                          Disconnect
                        </button>
                      </span>
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
                    <p className="muted">Ads insights</p>
                  </div>
                  <b
                    className={`status ${metaLinked ? "active" : "attention"}`}
                  >
                    {metaLinked
                      ? meta?.name || meta?.email || "Connected"
                      : "Not connected"}
                  </b>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    padding: "12px 4px 4px",
                  }}
                >
                  {!metaConfigured ? (
                    <Link className="secondary-button" href="/settings">
                      Configure Meta in Settings
                    </Link>
                  ) : metaLinked ? (
                    <span
                      className="muted"
                      style={{
                        display: "inline-flex",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <button
                        type="button"
                        className="text-button"
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
                    </span>
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
                      <label className="muted" htmlFor="meta-account">
                        Ad account
                      </label>
                      <select
                        id="meta-account"
                        value={metaAccountId}
                        onChange={(e) => setMetaAccountId(e.target.value)}
                        style={{ minHeight: 40, minWidth: 220 }}
                      >
                        <option value="">
                          {unlinkedMeta.length
                            ? "Select ad account…"
                            : "No unlinked accounts"}
                        </option>
                        {unlinkedMeta.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                            {row.currency ? ` · ${row.currency}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        title="Refresh account list"
                        onClick={() => {
                          loadMetaAccounts().catch(() => undefined);
                        }}
                      >
                        Refresh
                      </button>
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
                      <button
                        type="button"
                        className="primary-button"
                        disabled={
                          busy ||
                          !selectedMeta ||
                          !Number(metaTargetWebsiteId || 0)
                        }
                        onClick={() => {
                          linkSelectedMeta().catch(() => undefined);
                        }}
                      >
                        {busy ? "Linking…" : "Link to website"}
                      </button>
                    </div>
                    {linkedMeta.length > 0 && (
                      <p className="muted" style={{ margin: "0 0 8px" }}>
                        Already linked:{" "}
                        {linkedMeta
                          .slice(0, 5)
                          .map((a) => a.name)
                          .join(", ")}
                        {linkedMeta.length > 5
                          ? ` +${linkedMeta.length - 5} more`
                          : ""}
                      </p>
                    )}
                    {!metaAccounts.length && (
                      <p className="muted" style={{ margin: 0 }}>
                        No ad accounts returned — check Meta app permissions
                        (ads_read) and Business access.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>

            {manageGoogle && agencyLinked && (
              <section style={{ marginTop: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
                    Google accounts
                  </h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => goTab("accounts")}
                  >
                    Hide inventory
                  </button>
                </div>
                <GoogleInventory hideChrome />
              </section>
            )}
          </>
        )}

        {tab === "website" && <WebsiteBindings />}
      </div>
    </AdminShell>
  );
}
