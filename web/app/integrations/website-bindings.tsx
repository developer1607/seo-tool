"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useSession } from "../providers";

type Resource = {
  id: string;
  name: string;
  account?: string;
  loginCustomerId?: string;
  currency?: string | null;
};

type Platform = {
  key: string;
  label: string;
  status: string;
  account_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  actions?: string[];
  platform_ready?: boolean;
  phase?: number;
  hint?: string;
};

function statusClass(status: string) {
  if (status === "ACTIVE") return "active";
  if (status === "ERROR" || status === "NEEDS_REAUTH") return "attention";
  if (status === "PENDING_SELECT" || status === "PENDING_AUTH") return "attention";
  return "";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function rowDetail(p: Platform) {
  if (p.last_error) return p.last_error;
  if (p.account_name) {
    return p.last_sync_at
      ? `${p.account_name} · synced ${p.last_sync_at}`
      : p.account_name;
  }
  if (p.hint) return p.hint;
  if (p.status === "PENDING_SELECT") return "Choose an account to finish setup";
  if (p.status === "NOT_STARTED") return "Not connected yet";
  if (p.last_sync_at) return `Last synced ${p.last_sync_at}`;
  return "—";
}

export default function WebsiteBindings() {
  const { selectedClient, selectedWebsite, platform, refresh, selectWebsite } =
    useSession();
  const search = useSearchParams();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [agencyLinked, setAgencyLinked] = useState(
    Boolean(platform?.agencyGoogle?.linked)
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resources, setResources] = useState<{
    ga4: Resource[];
    gsc: Resource[];
    ads: Resource[];
    adsConfigured?: boolean;
    adsError?: string | null;
  } | null>(null);
  const [pickGa4, setPickGa4] = useState("");
  const [pickGsc, setPickGsc] = useState("");
  const [pickAds, setPickAds] = useState("");
  const [pickMeta, setPickMeta] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<Resource[]>([]);
  const [metaPickOpen, setMetaPickOpen] = useState(false);

  const websiteId = selectedWebsite?.id ?? null;
  const queryWebsiteId = Number(search.get("website_id") || 0) || null;
  const googleFlag = search.get("google");
  const googleError = search.get("google_error");
  const localFlag = search.get("local");
  const adsFlag = search.get("ads");

  const load = useCallback(async () => {
    if (!websiteId) return;
    const d = await api<{
      platforms: Platform[];
      agencyGoogle?: { linked?: boolean };
    }>("/integrations");
    setPlatforms(d.platforms);
    // Prefer live integrations payload; session linked only means token row exists
    setAgencyLinked(Boolean(d.agencyGoogle?.linked));
  }, [websiteId]);

  const loadMetaResources = useCallback(async () => {
    if (!websiteId) return;
    setBusy("meta-resources");
    setError("");
    try {
      const d = await api<{
        accounts: (Resource & {
          linked?: { website_id: number } | null;
          currency?: string | null;
        })[];
        error?: string;
        needsReauth?: boolean;
      }>("/integrations/meta/accounts");
      const rows = (d.accounts || [])
        .filter(
          (a) => !a.linked || a.linked.website_id === websiteId
        )
        .map((a) => ({
          id: a.id,
          name: a.currency ? `${a.name} · ${a.currency}` : a.name,
        }));
      setMetaAccounts(rows);
      setMetaPickOpen(true);
      if (rows[0]) setPickMeta(rows[0].id);
      if (d.error || d.needsReauth) {
        setError(
          d.error ||
            "Meta login needs reconnect. Open Integrations → Manage Meta."
        );
      }
    } catch (e) {
      setMetaAccounts([]);
      setMetaPickOpen(true);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [websiteId]);

  const loadResources = useCallback(async () => {
    if (!websiteId) return;
    setBusy("resources");
    setError("");
    try {
      const d = await api<{
        ga4: Resource[];
        gsc: Resource[];
        ads?: Resource[];
        adsConfigured?: boolean;
        adsError?: string | null;
      }>(`/integrations/google/resources?website_id=${websiteId}`);
      setResources({
        ga4: d.ga4 || [],
        gsc: d.gsc || [],
        ads: d.ads || [],
        adsConfigured: d.adsConfigured,
        adsError: d.adsError,
      });
      if (d.ga4?.[0]) setPickGa4(d.ga4[0].id);
      if (d.gsc?.[0]) setPickGsc(d.gsc[0].id);
      if (d.ads?.[0]) setPickAds(d.ads[0].id);
      if (d.adsError) setError(d.adsError);
    } catch (e) {
      setResources({
        ga4: [],
        gsc: [],
        ads: [],
        adsConfigured: true,
        adsError: (e as Error).message,
      });
      throw e;
    } finally {
      setBusy(null);
    }
  }, [websiteId]);

  // Align session to ?website_id= before any status/resource load
  useEffect(() => {
    if (!queryWebsiteId || websiteId === queryWebsiteId) return;
    selectWebsite(queryWebsiteId).catch((e) =>
      setError((e as Error).message)
    );
  }, [queryWebsiteId, websiteId, selectWebsite]);

  // Reset website-scoped state when context changes
  useEffect(() => {
    setResources(null);
    setPlatforms([]);
    setPickGa4("");
    setPickGsc("");
    setPickAds("");
    setPickMeta("");
    setMetaAccounts([]);
    setMetaPickOpen(false);
  }, [websiteId]);

  const contextReady =
    Boolean(websiteId) &&
    (!queryWebsiteId || queryWebsiteId === websiteId);

  useEffect(() => {
    if (!contextReady) return;
    load().catch((e) => setError(e.message));
  }, [contextReady, websiteId, load]);

  const oauthHandled = useRef(false);
  useEffect(() => {
    if (oauthHandled.current) return;
    if (!googleError && googleFlag !== "1") return;
    oauthHandled.current = true;
    if (googleError) setError(googleError);
    if (googleFlag === "1") {
      setMessage(
        localFlag === "1"
          ? "This website’s Google authorized — pick accounts below (agency login unchanged)."
          : adsFlag === "1"
            ? "Google Ads authorized — pick an Ads account below."
            : "Google authorized — pick GA4 property and Search Console site below."
      );
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      url.searchParams.delete("google_error");
      url.searchParams.delete("local");
      url.searchParams.delete("ads");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [googleFlag, googleError, localFlag, adsFlag]);

  const needsSelect = useMemo(
    () =>
      platforms.some(
        (p) =>
          (p.key === "GOOGLE_ANALYTICS" ||
            p.key === "GOOGLE_SEARCH_CONSOLE" ||
            p.key === "GOOGLE_ADS") &&
          p.status === "PENDING_SELECT"
      ),
    [platforms]
  );

  const needsMetaSelect = useMemo(
    () =>
      platforms.some(
        (p) => p.key === "META_ADS" && p.status === "PENDING_SELECT"
      ),
    [platforms]
  );

  // Only load Google resource lists after session matches query website
  useEffect(() => {
    if (!contextReady || !websiteId || resources) return;
    const fromOAuth = googleFlag === "1" || oauthHandled.current;
    if (!fromOAuth && !needsSelect) return;
    loadResources().catch((e) => setError((e as Error).message));
  }, [
    contextReady,
    websiteId,
    needsSelect,
    resources,
    loadResources,
    googleFlag,
  ]);

  useEffect(() => {
    if (!contextReady || !websiteId || metaPickOpen) return;
    if (!needsMetaSelect) return;
    loadMetaResources().catch((e) => setError((e as Error).message));
  }, [
    contextReady,
    websiteId,
    needsMetaSelect,
    metaPickOpen,
    loadMetaResources,
  ]);

  const adsOnlyPending = useMemo(() => {
    const ads = platforms.find((p) => p.key === "GOOGLE_ADS");
    const ga4 = platforms.find((p) => p.key === "GOOGLE_ANALYTICS");
    const gsc = platforms.find((p) => p.key === "GOOGLE_SEARCH_CONSOLE");
    return (
      ads?.status === "PENDING_SELECT" &&
      ga4?.status === "ACTIVE" &&
      gsc?.status === "ACTIVE"
    );
  }, [platforms]);

  async function connectGoogle() {
    if (!selectedWebsite) return;
    setBusy("connect");
    setError("");
    try {
      const d = await api<{ url: string; reused?: boolean }>(
        `/integrations/google/start?website_id=${selectedWebsite.id}&format=json`
      );
      if (d.reused) {
        setMessage(
          "Using portal Google for this website — pick GA4 / Search Console / Ads below."
        );
        setBusy(null);
        await load();
        await loadResources().catch(() => undefined);
        return;
      }
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  /** Client's own Google for this website only — does not replace agency login. */
  async function connectWebsiteGoogle() {
    if (!selectedWebsite) return;
    setBusy("connect-local");
    setError("");
    try {
      const d = await api<{ url: string }>(
        `/integrations/google/start?website_id=${selectedWebsite.id}&force=1&local=1&format=json`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function connectGoogleAds() {
    if (!selectedWebsite) return;
    setBusy("connect-ads");
    setError("");
    try {
      const d = await api<{ url: string; reused?: boolean }>(
        `/integrations/google/start?website_id=${selectedWebsite.id}&providers=GOOGLE_ADS&format=json`
      );
      if (d.reused) {
        setMessage("Portal Google ready for Ads — choose an Ads account below.");
        setBusy(null);
        await load();
        await loadResources().catch(() => undefined);
        return;
      }
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function connectWebsiteGoogleAds() {
    if (!selectedWebsite) return;
    setBusy("connect-ads-local");
    setError("");
    try {
      const d = await api<{ url: string }>(
        `/integrations/google/start?website_id=${selectedWebsite.id}&providers=GOOGLE_ADS&force=1&local=1&format=json`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function selectProvider(
    provider: "GOOGLE_ANALYTICS" | "GOOGLE_SEARCH_CONSOLE" | "GOOGLE_ADS",
    id: string,
    name: string,
    loginCustomerId?: string
  ) {
    if (!selectedWebsite || !id) return;
    setBusy(provider);
    setError("");
    try {
      const d = await api<{
        platforms: Platform[];
        sync: { ok?: boolean; days?: number; error?: string } | null;
      }>("/integrations/google/select", {
        method: "POST",
        body: JSON.stringify({
          website_id: selectedWebsite.id,
          provider,
          external_account_id: id,
          external_account_name: name,
          login_customer_id: loginCustomerId || undefined,
          sync: true,
        }),
      });
      setPlatforms(d.platforms);
      const syncNote =
        d.sync?.ok === false
          ? ` Connected, sync failed: ${d.sync.error}`
          : d.sync?.days != null
            ? ` Synced ${d.sync.days} days.`
            : "";
      const label =
        provider === "GOOGLE_ANALYTICS"
          ? "GA4"
          : provider === "GOOGLE_SEARCH_CONSOLE"
            ? "GSC"
            : "Google Ads";
      setMessage(`${label} active.${syncNote}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function selectMeta(id: string, name: string) {
    if (!selectedWebsite || !id) return;
    setBusy("META_ADS");
    setError("");
    try {
      const d = await api<{
        platforms: Platform[];
        sync: { ok?: boolean; days?: number; error?: string } | null;
      }>("/integrations/meta/select", {
        method: "POST",
        body: JSON.stringify({
          website_id: selectedWebsite.id,
          external_account_id: id,
          external_account_name: name,
          sync: true,
        }),
      });
      setPlatforms(d.platforms);
      const syncNote =
        d.sync?.ok === false
          ? ` Connected, sync failed: ${d.sync.error}`
          : d.sync?.days != null
            ? ` Synced ${d.sync.days} days.`
            : "";
      setMessage(`Meta Ads active.${syncNote}`);
      setMetaPickOpen(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sync(provider: string) {
    if (!selectedWebsite) return;
    setBusy(`sync:${provider}`);
    setError("");
    try {
      const d = await api<{ days: number; platforms: Platform[] }>(
        `/integrations/${provider}/sync`,
        {
          method: "POST",
          body: JSON.stringify({ website_id: selectedWebsite.id }),
        }
      );
      setPlatforms(d.platforms);
      setMessage(`Synced ${d.days} days for ${provider}.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: string) {
    if (!selectedWebsite) return;
    setBusy(`disc:${provider}`);
    setError("");
    try {
      const d = await api<{ platforms: Platform[] }>(
        `/integrations/${provider}/disconnect`,
        {
          method: "POST",
          body: JSON.stringify({ website_id: selectedWebsite.id }),
        }
      );
      setPlatforms(d.platforms);
      setMessage("Disconnected.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function actionButton(p: Platform) {
    const actions = p.actions || [];
    if (p.key === "META_ADS") {
      if (actions.includes("connect") || actions.includes("reconnect")) {
        return (
          <Link
            className="primary-button"
            href="/integrations?tab=accounts&view=meta"
          >
            {actions.includes("reconnect") ? "Reconnect Meta" : "Connect Meta"}
          </Link>
        );
      }
      if (actions.includes("select")) {
        return (
          <button
            className="primary-button"
            type="button"
            disabled={busy === "meta-resources"}
            onClick={() => loadMetaResources().catch((e) => setError(e.message))}
          >
            {busy === "meta-resources" ? "Loading…" : "Choose Meta account"}
          </button>
        );
      }
    }
    if (p.status === "COMING_SOON") {
      return (
        <Link className="secondary-button" href="/settings">
          {p.hint || "Add developer token"}
        </Link>
      );
    }
    if (!platform?.google && !p.platform_ready) {
      return (
        <Link className="secondary-button" href="/settings">
          Configure env
        </Link>
      );
    }
    if (p.key === "GOOGLE_ADS") {
      if (actions.includes("connect") || actions.includes("reconnect")) {
        return (
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(agencyLinked) && (
              <button
                className="primary-button"
                type="button"
                disabled={busy === "connect-ads"}
                onClick={connectGoogleAds}
              >
                {busy === "connect-ads"
                  ? "Working…"
                  : "Use portal Google for Ads"}
              </button>
            )}
            <button
              className="secondary-button"
              type="button"
              disabled={busy === "connect-ads-local"}
              onClick={connectWebsiteGoogleAds}
              title="Sign in with the Google that owns this client's Ads (does not replace agency login)"
            >
              {busy === "connect-ads-local"
                ? "Redirecting…"
                : "Connect this site's Google"}
            </button>
          </span>
        );
      }
      if (actions.includes("select")) {
        return (
          <button
            className="primary-button"
            type="button"
            disabled={busy === "resources"}
            onClick={() => loadResources().catch((e) => setError(e.message))}
          >
            Choose Ads account
          </button>
        );
      }
    }
    if (actions.includes("connect") || actions.includes("reconnect")) {
      return (
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(agencyLinked) && (
            <button
              className="primary-button"
              type="button"
              disabled={busy === "connect" || busy === "resources"}
              onClick={() => {
                connectGoogle().catch(() => undefined);
              }}
            >
              {busy === "connect" ? "Working…" : "Use portal Google"}
            </button>
          )}
          <button
            className="secondary-button"
            type="button"
            disabled={busy === "connect-local"}
            onClick={connectWebsiteGoogle}
            title="OAuth with the client's Google for this website only"
          >
            {busy === "connect-local"
              ? "Redirecting…"
              : agencyLinked
                ? "Connect this site's Google"
                : "Connect Google for this website"}
          </button>
        </span>
      );
    }
    if (actions.includes("select")) {
      return (
        <button
          className="primary-button"
          type="button"
          disabled={busy === "resources"}
          onClick={() => loadResources().catch((e) => setError(e.message))}
        >
          Choose account
        </button>
      );
    }
    return (
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.includes("sync") && (
          <button
            className="primary-button"
            type="button"
            disabled={!!busy}
            onClick={() => sync(p.key)}
          >
            {busy === `sync:${p.key}` ? "Syncing…" : "Sync"}
          </button>
        )}
        {actions.includes("disconnect") && (
          <button
            className="secondary-button"
            type="button"
            disabled={!!busy}
            onClick={() => disconnect(p.key)}
          >
            Disconnect
          </button>
        )}
      </span>
    );
  }

  return (
    <div>
        <div className="integrations-callout">
          <p>
            {agencyLinked ? (
              <>
                Prefer <strong>Use portal Google</strong> when the client invited
                your agency email. Use{" "}
                <strong>Connect this site&apos;s Google</strong> when they sign
                in themselves — that token stays on this website only.
              </>
            ) : (
              <>
                Connect Google under the <strong>Google</strong> tab first, or
                use <strong>Connect this site&apos;s Google</strong> for a
                one-off client login.
              </>
            )}
          </p>
        </div>
        {!selectedClient || !selectedWebsite ? (
          <section className="panel empty-section">
            <h2>Select a website</h2>
            <p>
              Link GA4 / Search Console / Ads to a specific site. Pick a client
              and website in the top bar.
            </p>
            <Link className="primary-button" href="/clients">
              Open clients
            </Link>
          </section>
        ) : (
          <>
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
            <section className="panel integrations-panel">
              <div className="integrations-panel-hd">
                <strong>{selectedWebsite.name}</strong>
                <span>
                  {selectedClient.name} · {selectedWebsite.url}
                </span>
              </div>
              <div className="integration-list">
                {platforms.map((p) => (
                  <div key={p.key} className="integration-row">
                    <span className="site-favicon">{p.label.slice(0, 1)}</span>
                    <div className="integration-meta">
                      <strong>{p.label}</strong>
                      <small title={rowDetail(p)}>{rowDetail(p)}</small>
                    </div>
                    <b
                      className={`status integration-status ${statusClass(p.status)}`}
                    >
                      {statusLabel(p.status)}
                    </b>
                    <div className="integration-actions">{actionButton(p)}</div>
                  </div>
                ))}
              </div>
            </section>

            {(needsSelect || resources) && (
              <section className="panel" style={{ marginTop: 16 }}>
                <div className="panel-header">
                  <div>
                    <h2>
                      {adsOnlyPending
                        ? "Select Google Ads account"
                        : "Select Google resources"}
                    </h2>
                    <p className="muted">
                      {busy === "resources"
                        ? "Loading accounts from Google…"
                        : "Probe runs before Connected, then backfills ~30 days."}
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy === "resources"}
                    onClick={() =>
                      loadResources().catch((e) => setError(e.message))
                    }
                  >
                    {busy === "resources" ? "Loading…" : "Reload accounts"}
                  </button>
                </div>
                {resources && (
                  <div className="form-grid" style={{ padding: "0 4px 12px" }}>
                    {resources.adsConfigured !== false && (
                      <>
                        <label>
                          Google Ads account
                          <select
                            value={pickAds}
                            onChange={(e) => setPickAds(e.target.value)}
                          >
                            {resources.ads.length === 0 && (
                              <option value="">
                                {resources.adsError
                                  ? "Re-authorize Ads scope"
                                  : "No Ads accounts found"}
                              </option>
                            )}
                            {resources.ads.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                                {r.account ? ` · ${r.account}` : ""}
                                {r.currency ? ` · ${r.currency}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!pickAds || busy === "GOOGLE_ADS"}
                          onClick={() => {
                            const r = resources.ads.find(
                              (x) => x.id === pickAds
                            );
                            if (r) {
                              selectProvider(
                                "GOOGLE_ADS",
                                r.id,
                                r.name,
                                r.loginCustomerId
                              );
                            }
                          }}
                        >
                          {busy === "GOOGLE_ADS"
                            ? "Saving…"
                            : "Save & sync Ads"}
                        </button>
                      </>
                    )}
                    {!adsOnlyPending && (
                      <>
                        <label>
                          GA4 property
                          <select
                            value={pickGa4}
                            onChange={(e) => setPickGa4(e.target.value)}
                          >
                            {resources.ga4.length === 0 && (
                              <option value="">No properties found</option>
                            )}
                            {resources.ga4.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                                {r.account ? ` (${r.account})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!pickGa4 || busy === "GOOGLE_ANALYTICS"}
                          onClick={() => {
                            const r = resources.ga4.find(
                              (x) => x.id === pickGa4
                            );
                            if (r) {
                              selectProvider("GOOGLE_ANALYTICS", r.id, r.name);
                            }
                          }}
                        >
                          {busy === "GOOGLE_ANALYTICS"
                            ? "Saving…"
                            : "Save & sync GA4"}
                        </button>
                        <label>
                          Search Console site
                          <select
                            value={pickGsc}
                            onChange={(e) => setPickGsc(e.target.value)}
                          >
                            {resources.gsc.length === 0 && (
                              <option value="">No sites found</option>
                            )}
                            {resources.gsc.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={
                            !pickGsc || busy === "GOOGLE_SEARCH_CONSOLE"
                          }
                          onClick={() => {
                            const r = resources.gsc.find(
                              (x) => x.id === pickGsc
                            );
                            if (r) {
                              selectProvider(
                                "GOOGLE_SEARCH_CONSOLE",
                                r.id,
                                r.name
                              );
                            }
                          }}
                        >
                          {busy === "GOOGLE_SEARCH_CONSOLE"
                            ? "Saving…"
                            : "Save & sync GSC"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {metaPickOpen && (
              <section className="panel" style={{ marginTop: 16 }}>
                <div className="panel-header">
                  <div>
                    <h2>Select Meta ad account</h2>
                    <p className="muted">
                      Probe runs before Connected, then backfills ~30 days.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy === "meta-resources"}
                    onClick={() =>
                      loadMetaResources().catch((e) => setError(e.message))
                    }
                  >
                    {busy === "meta-resources" ? "Loading…" : "Reload accounts"}
                  </button>
                </div>
                <div className="form-grid" style={{ padding: "0 4px 12px" }}>
                  <label>
                    Meta Ads account
                    <select
                      value={pickMeta}
                      onChange={(e) => setPickMeta(e.target.value)}
                    >
                      {metaAccounts.length === 0 && (
                        <option value="">No ad accounts found</option>
                      )}
                      {metaAccounts.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!pickMeta || busy === "META_ADS"}
                    onClick={() => {
                      const r = metaAccounts.find((x) => x.id === pickMeta);
                      if (r) selectMeta(r.id, r.name);
                    }}
                  >
                    {busy === "META_ADS" ? "Saving…" : "Save & sync Meta"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
    </div>
  );
}
