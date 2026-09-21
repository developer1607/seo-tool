'use client';

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api } from "../../lib/api";
import { useSession } from "../providers";
import GoogleInventory from "./google-inventory";
import MetaInventory from "./meta-inventory";
import WebsiteBindings from "./website-bindings";

type HubTab = "accounts" | "website";

function normalizeTab(
  raw: string | null,
  hasWebsiteId: boolean
): HubTab {
  if (raw === "website" || raw === "bind") return "website";
  if (raw === "google" || raw === "import" || raw === "meta") return "accounts";
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

function wantsMetaManage(search: URLSearchParams): boolean {
  const tab = search.get("tab");
  const view = search.get("view");
  return view === "meta" || tab === "meta" || search.get("meta") === "1";
}

export default function IntegrationsInner() {
  const { platform, refresh } = useSession();
  const search = useSearchParams();
  const router = useRouter();
  const websiteIdQ = Number(search.get("website_id") || 0) || null;
  const [tab, setTab] = useState<HubTab>(() =>
    normalizeTab(search.get("tab"), Boolean(websiteIdQ))
  );
  const [manageGoogle, setManageGoogle] = useState(() =>
    wantsGoogleManage(search)
  );
  const [manageMeta, setManageMeta] = useState(() => wantsMetaManage(search));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const agency = platform?.agencyGoogle;
  const agencyLinked = Boolean(
    agency?.linked && !agency?.cleared && !agency?.needsReauth
  );
  const agencyNeedsReauth = Boolean(agency?.needsReauth);
  const meta = platform?.agencyMeta;
  const metaLinked = Boolean(meta?.linked && !meta?.cleared);
  const metaNeedsReauth = Boolean(meta?.needsReauth);
  const googleConfigured = Boolean(platform?.google);
  const metaConfigured = Boolean(platform?.meta);

  useEffect(() => {
    setTab(normalizeTab(search.get("tab"), Boolean(websiteIdQ)));
    setManageGoogle(wantsGoogleManage(search));
    setManageMeta(wantsMetaManage(search));
  }, [search, websiteIdQ]);

  useEffect(() => {
    const err = search.get("google_error") || search.get("meta_error");
    if (err) setError(err);
    if (search.get("google") === "1") {
      setMessage("Google connected. Sync accounts, then import or link.");
      setTab("accounts");
      setManageGoogle(true);
      setManageMeta(false);
    }
    if (search.get("meta") === "1") {
      setMessage("Meta connected. Sync ad accounts, then link to a website.");
      setTab("accounts");
      setManageGoogle(false);
      setManageMeta(true);
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
        url.searchParams.set("view", "meta");
      } else if (search.get("google") === "1") {
        url.searchParams.set("tab", "accounts");
        url.searchParams.set("view", "google");
      }
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search, websiteIdQ]);

  const goTab = useCallback(
    (
      next: HubTab,
      opts?: { manageGoogle?: boolean; manageMeta?: boolean }
    ) => {
      setTab(next);
      const showGoogle = Boolean(opts?.manageGoogle);
      const showMeta = Boolean(opts?.manageMeta);
      setManageGoogle(showGoogle);
      setManageMeta(showMeta);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      if (next !== "website") url.searchParams.delete("website_id");
      if (next === "accounts" && showMeta) {
        url.searchParams.set("view", "meta");
      } else if (next === "accounts" && showGoogle) {
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

  async function connectMeta(opts?: { mode?: "replace" | "add" }) {
    const mode = opts?.mode || "replace";
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        format: "json",
        connect: mode,
      });
      const d = await api<{ url: string }>(
        `/integrations/meta/start?${params.toString()}`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function disconnectMeta() {
    if (
      !window.confirm(
        "Disconnect Meta data access? Website links stay; Connect again to browse ad accounts."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api("/integrations/meta/agency/disconnect", {
        method: "POST",
        body: "{}",
      });
      setMessage("Meta disconnected.");
      setManageMeta(false);
      await refresh();
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
                    className={`status ${
                      metaNeedsReauth
                        ? "attention"
                        : metaLinked
                          ? "active"
                          : "attention"
                    }`}
                  >
                    {metaNeedsReauth
                      ? "Needs reconnect"
                      : metaLinked
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
                  ) : metaNeedsReauth ? (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => {
                        connectMeta({ mode: "replace" }).catch(() => undefined);
                      }}
                    >
                      {busy ? "Redirecting…" : "Reconnect"}
                    </button>
                  ) : metaLinked ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => goTab("accounts", { manageMeta: true })}
                      >
                        Manage Meta
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
                            connectMeta({ mode: "add" }).catch(() => undefined);
                          }}
                        >
                          Add account
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            connectMeta({ mode: "replace" }).catch(
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
                            disconnectMeta().catch(() => undefined);
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
                        connectMeta({ mode: "replace" }).catch(() => undefined);
                      }}
                    >
                      {busy ? "Redirecting…" : "Connect Meta"}
                    </button>
                  )}
                </div>
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

            {manageMeta && metaLinked && (
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
                    Meta accounts
                  </h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => goTab("accounts")}
                  >
                    Hide inventory
                  </button>
                </div>
                <MetaInventory hideChrome />
              </section>
            )}
          </>
        )}

        {tab === "website" && <WebsiteBindings />}
      </div>
    </AdminShell>
  );
}
