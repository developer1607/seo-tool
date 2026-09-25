"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useSession } from "../providers";

type LinkInfo = {
  website_id: number;
  client_id: number;
  status: string;
} | null;

type Ga4Row = {
  id: string;
  name: string;
  account?: string;
  accountId?: string;
  accountName?: string;
  propertyId?: string;
  url?: string | null;
  streamUrls?: string[];
  linked: LinkInfo;
};

type Ga4Account = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  properties: Ga4Row[];
  linkedCount: number;
  availableCount: number;
  fullyLinked: boolean;
};

type GscRow = {
  id: string;
  name: string;
  url?: string | null;
  linked: LinkInfo;
};

type AdsRow = {
  id: string;
  name: string;
  account?: string;
  currency?: string | null;
  loginCustomerId?: string;
  linked: LinkInfo;
};

type DataIdentity = {
  id: number;
  provider: string;
  email?: string | null;
  displayName?: string | null;
  sub?: string | null;
  isDefault?: boolean;
  status?: string;
  updatedAt?: string;
  hasToken?: boolean;
};

type Discover = {
  connected: boolean;
  agencyLinked: boolean;
  source: string | null;
  updatedAt: string | null;
  email?: string | null;
  sub?: string | null;
  identityId?: number | null;
  identities?: DataIdentity[];
  imported: number;
  available: number;
  ga4: Ga4Row[];
  ga4Accounts?: Ga4Account[];
  gsc: GscRow[];
  ads?: AdsRow[];
  adsError?: string | null;
  needsReauth?: boolean;
  error?: string;
  code?: string;
};

function GoogleInventory({
  hideChrome = false,
}: {
  hideChrome?: boolean;
}) {
  const { platform, refresh, selectedWebsite, selectedClient, clients } =
    useSession();
  const search = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Discover | null>(null);
  const [tab, setTab] = useState<"available" | "imported">("available");
  const [kind, setKind] = useState<"all" | "ga4" | "gsc" | "ads">("all");
  const [error, setError] = useState("");
  const [adsError, setAdsError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkProgress, setBulkProgress] = useState("");
  const [adsTargetClientId, setAdsTargetClientId] = useState<number | "">(
    ""
  );
  const [adsTargetWebsiteId, setAdsTargetWebsiteId] = useState<number | "">(
    ""
  );
  const [adsSitesLocal, setAdsSitesLocal] = useState<
    { id: number; name: string }[]
  >([]);
  const [identityId, setIdentityId] = useState<number | null>(() => {
    const q = Number(search.get("identity_id") || 0);
    return q || null;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const qs = identityId ? `?identity_id=${identityId}` : "";
    const attempt = async () =>
      api<Discover>(`/integrations/google/discover${qs}`);
    try {
      let d: Discover;
      try {
        d = await attempt();
      } catch (e) {
        const code = (e as Error & { code?: string }).code;
        if (code === "NETWORK") {
          await new Promise((r) => setTimeout(r, 1200));
          d = await attempt();
        } else {
          throw e;
        }
      }
      setData(d);
      if (!identityId && d.identityId) {
        setIdentityId(d.identityId);
      }
      if (d.needsReauth || d.error) {
        setError(
          d.error ||
            "Google login needs reconnect. Use Reconnect / Connect agency Google."
        );
      }
      if (d.connected && d.available === 0 && d.imported > 0) {
        setTab("imported");
      }
      setAdsError(d.connected && d.adsError ? d.adsError : "");
    } catch (e) {
      setError((e as Error).message);
      setData(null);
      setAdsError("");
    } finally {
      setLoading(false);
    }
  }, [identityId]);

  useEffect(() => {
    const err = search.get("google_error");
    if (err) setError(err);
    if (search.get("google") === "1") {
      setMessage(
        "Google linked. Sync the account list, then use Bulk import to create clients from available GA4 / Search Console."
      );
    }
    if (typeof window !== "undefined" && (err || search.get("google") === "1")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      url.searchParams.delete("google_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadAdsSitesForClient = useCallback(
    async (clientId: number, preferWebsiteId?: number) => {
      setAdsTargetClientId(clientId);
      setAdsTargetWebsiteId("");
      setAdsSitesLocal([]);
      try {
        const d = await api<{
          websites: { id: number; name: string }[];
        }>(`/clients/${clientId}/research`);
        const sites = (d.websites || []).map((w) => ({
          id: w.id,
          name: w.name,
        }));
        setAdsSitesLocal(sites);
        if (preferWebsiteId && sites.some((s) => s.id === preferWebsiteId)) {
          setAdsTargetWebsiteId(preferWebsiteId);
        } else if (sites.length === 1) {
          setAdsTargetWebsiteId(sites[0].id);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    []
  );

  // Seed Ads target from top-bar context once (local only — never selectClient)
  useEffect(() => {
    if (adsTargetClientId || !selectedClient?.id) return;
    loadAdsSitesForClient(
      selectedClient.id,
      selectedWebsite?.id
    ).catch(() => undefined);
  }, [
    selectedClient?.id,
    selectedWebsite?.id,
    adsTargetClientId,
    loadAdsSitesForClient,
  ]);

  // After discover loads, connected is truth — session.linked alone never unlocks inventory
  const connected = Boolean(data?.connected && !data?.needsReauth);
  const agencyLinked =
    data != null ? connected : Boolean(platform?.agencyGoogle?.linked);

  const websiteOptions = useMemo(() => {
    return adsSitesLocal.map((w) => {
      const clientName =
        clients?.find((c) => c.id === adsTargetClientId)?.name || "Client";
      return { id: w.id, label: `${clientName} · ${w.name}` };
    });
  }, [adsSitesLocal, adsTargetClientId, clients]);

  const ga4AccountsFiltered = useMemo(() => {
    const accounts = data?.ga4Accounts || [];
    if (!accounts.length && (data?.ga4 || []).length) {
      // Fallback group from flat list if older API shape.
      const map = new Map<string, Ga4Account>();
      for (const row of data?.ga4 || []) {
        const accountId = row.accountId || row.account || "unknown";
        if (!map.has(accountId)) {
          map.set(accountId, {
            id: accountId,
            name: row.accountName || row.account || accountId,
            accountId,
            accountName: row.accountName || row.account || accountId,
            properties: [],
            linkedCount: 0,
            availableCount: 0,
            fullyLinked: false,
          });
        }
        map.get(accountId)!.properties.push(row);
      }
      for (const account of map.values()) {
        account.linkedCount = account.properties.filter((p) => p.linked).length;
        account.availableCount =
          account.properties.length - account.linkedCount;
        account.fullyLinked =
          account.properties.length > 0 &&
          account.linkedCount === account.properties.length;
      }
      return [...map.values()].filter((account) =>
        tab === "imported"
          ? account.linkedCount > 0
          : account.availableCount > 0
      );
    }
    return accounts.filter((account) =>
      tab === "imported"
        ? account.linkedCount > 0
        : account.availableCount > 0
    );
  }, [data, tab]);

  const gscFiltered = useMemo(() => {
    const rows = data?.gsc || [];
    return rows.filter((r) =>
      tab === "imported" ? Boolean(r.linked) : !r.linked
    );
  }, [data, tab]);

  const adsFiltered = useMemo(() => {
    const rows = data?.ads || [];
    return rows.filter((r) =>
      tab === "imported" ? Boolean(r.linked) : !r.linked
    );
  }, [data, tab]);

  const availableBulkItems = useMemo(() => {
    const items: {
      key: string;
      kind: "GA4" | "GSC";
      id: string;
      name: string;
      client_name?: string;
      url?: string | null;
      ga4_account_id?: string;
    }[] = [];
    for (const r of data?.ga4 || []) {
      if (r.linked) continue;
      items.push({
        key: `GA4:${r.id}`,
        kind: "GA4",
        id: r.id,
        name: r.name,
        client_name: r.accountName || r.account || r.name,
        url: r.url,
        ga4_account_id: r.accountId,
      });
    }
    for (const r of data?.gsc || []) {
      if (r.linked) continue;
      items.push({
        key: `GSC:${r.id}`,
        kind: "GSC",
        id: r.id,
        name: r.name,
        client_name: r.name,
        url: r.url,
      });
    }
    return items;
  }, [data]);

  const selectedKeys = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

  function toggleSelect(key: string) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function selectAllAvailable() {
    const next: Record<string, boolean> = {};
    for (const item of availableBulkItems) next[item.key] = true;
    setSelected(next);
  }

  function clearSelection() {
    setSelected({});
  }

  async function runBulkImport(scope: "selected" | "all") {
    const pool =
      scope === "all"
        ? availableBulkItems
        : availableBulkItems.filter((i) => selected[i.key]);
    if (!pool.length) {
      setError(
        scope === "all"
          ? "Nothing available to import."
          : "Select at least one GA4 or Search Console property."
      );
      return;
    }
    setBusy("bulk");
    setError("");
    setBulkProgress(`Importing 0 / ${pool.length}…`);
    try {
      const d = await api<{
        summary: {
          imported: number;
          repaired: number;
          attached: number;
          skipped: number;
          failed: number;
        };
        results: { ok: boolean; name?: string; error?: string; code?: string }[];
      }>("/integrations/google/import-bulk", {
        method: "POST",
        body: JSON.stringify({
          identity_id: identityId || undefined,
          sync: false,
          items: pool.map((i) => ({
            kind: i.kind,
            external_account_id: i.id,
            name: i.name,
            client_name: i.client_name,
            url: i.url || undefined,
            ga4_account_id: i.ga4_account_id,
          })),
        }),
      });
      const s = d.summary;
      setBulkProgress("");
      setMessage(
        `Bulk import done — ${s.imported} new, ${s.attached} attached to existing sites, ${s.repaired} repaired, ${s.skipped} skipped, ${s.failed} failed. Sync websites from the header when ready. Ads stay manual (pick a website).`
      );
      clearSelection();
      await refresh();
      await load();
    } catch (e) {
      setBulkProgress("");
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function connectAgency(opts?: {
    mode?: "replace" | "reconnect";
  }) {
    const mode = opts?.mode || "replace";
    const currentEmail =
      data?.email || platform?.agencyGoogle?.email || null;
    if (mode === "replace" && (agencyLinked || currentEmail)) {
      const ok = window.confirm(
        currentEmail
          ? `Reconnect agency Google (${currentEmail})? Continue?`
          : "Reconnect agency Google? Continue?"
      );
      if (!ok) return;
    }
    setBusy("connect");
    setError("");
    try {
      const params = new URLSearchParams({
        mode: "discover",
        format: "json",
        connect: mode,
      });
      if (mode === "reconnect" && identityId) {
        params.set("identity_id", String(identityId));
      }
      const d = await api<{ url: string }>(
        `/integrations/google/start?${params.toString()}`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function syncAccounts() {
    setBusy("sync");
    setMessage("");
    try {
      await load();
      setMessage("Account list refreshed from Google.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnectAgency() {
    const label = data?.email || "this Google account";
    const ok = window.confirm(
      `Disconnect agency Google (${label})? Website links stay; Connect again to browse inventory.`
    );
    if (!ok) return;
    setBusy("disc");
    try {
      await api("/integrations/google/agency/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        "Agency Google revoked at Google and cleared here. Website links kept; Connect again to use inventory."
      );
      setIdentityId(null);
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importGa4(row: Ga4Row) {
    setBusy(row.id);
    setError("");
    try {
      const d = await api<{
        client: { id: number };
        repaired?: boolean;
        attached?: boolean;
        created?: boolean;
        code?: string;
        sync?: { ok?: boolean; error?: string; days?: number } | null;
      }>("/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({
          kind: "GA4",
          external_account_id: row.id,
          name: row.name,
          client_name: row.accountName || row.account || row.name,
          ga4_account_id: row.accountId,
          url: row.url || undefined,
          sync: true,
          identity_id: identityId || undefined,
        }),
      });
      await refresh();
      if (d.sync && d.sync.ok === false) {
        setMessage(
          `Imported ${row.name}, but sync failed: ${d.sync.error || "unknown"}. Open the client and sync.`
        );
        setBusy(null);
        router.push(`/clients/${d.client.id}`);
        return;
      }
      setMessage(
        d.repaired
          ? `Reconnected Google for ${row.name}`
          : d.attached && !d.created
            ? `Added ${row.name} as a website under the existing client`
            : `Imported ${row.name}`
      );
      router.push(`/clients/${d.client.id}`);
    } catch (e) {
      const err = e as Error & { code?: string; client_id?: number };
      if (err.code === "ALREADY_LINKED" && err.client_id) {
        setMessage("Already imported — opening client.");
        router.push(`/clients/${err.client_id}`);
        return;
      }
      setError(err.message);
      setBusy(null);
    }
  }

  async function importGa4Account(
    account: Ga4Account,
    scope: "all" | "selected"
  ) {
    const availableProps = account.properties.filter((p) => !p.linked);
    const propertyIds =
      scope === "selected"
        ? availableProps
            .filter((p) => selected[`GA4:${p.id}`])
            .map((p) => p.id)
        : availableProps.map((p) => p.id);
    if (!propertyIds.length) {
      setError(
        scope === "selected"
          ? "Select at least one property under this account."
          : "No available properties left on this account."
      );
      return;
    }
    setBusy(`account:${account.accountId}`);
    setError("");
    setBulkProgress(
      `Importing ${propertyIds.length} website(s) from ${account.accountName}…`
    );
    try {
      const d = await api<{
        client: { id: number };
        created?: boolean;
        summary?: {
          websites?: number;
          linked?: number;
          failed?: number;
          skipped?: number;
        };
      }>("/integrations/google/import-account", {
        method: "POST",
        body: JSON.stringify({
          ga4_account_id: account.accountId,
          property_ids: propertyIds,
          sync: true,
          identity_id: identityId || undefined,
        }),
      });
      setBulkProgress("");
      const s = d.summary;
      setMessage(
        `${d.created ? "Created" : "Updated"} client ${account.accountName} — ${
          s?.websites ?? propertyIds.length
        } website(s), ${s?.linked ?? 0} links, ${s?.skipped ?? 0} skipped, ${
          s?.failed ?? 0
        } failed.`
      );
      clearSelection();
      await refresh();
      await load();
      router.push(`/clients/${d.client.id}`);
    } catch (e) {
      setBulkProgress("");
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importGsc(row: GscRow) {
    setBusy(row.id);
    setError("");
    try {
      const d = await api<{
        client: { id: number };
        repaired?: boolean;
        sync?: { ok?: boolean; error?: string } | null;
      }>("/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({
          kind: "GSC",
          external_account_id: row.id,
          name: row.name,
          client_name: row.name,
          url: row.url || undefined,
          sync: true,
          identity_id: identityId || undefined,
        }),
      });
      await refresh();
      if (d.sync && d.sync.ok === false) {
        setMessage(
          `Imported ${row.name}, but sync failed: ${d.sync.error || "unknown"}. Open Integrations → Sync.`
        );
        setBusy(null);
        router.push(`/clients/${d.client.id}`);
        return;
      }
      setMessage(
        d.repaired
          ? `Reconnected Google for ${row.name}`
          : `Imported ${row.name}`
      );
      router.push(`/clients/${d.client.id}`);
    } catch (e) {
      const err = e as Error & { code?: string; client_id?: number };
      if (err.code === "ALREADY_LINKED" && err.client_id) {
        setMessage("Already imported — opening client.");
        router.push(`/clients/${err.client_id}`);
        return;
      }
      setError(err.message);
      setBusy(null);
    }
  }

  async function linkAds(row: AdsRow) {
    const websiteId = Number(adsTargetWebsiteId || selectedWebsite?.id || 0);
    if (!websiteId) {
      setError(
        "Choose a website below (or in the top bar), then link this Ads account."
      );
      return;
    }
    setBusy(row.id);
    setError("");
    try {
      await api("/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({
          kind: "ADS",
          external_account_id: row.id,
          name: row.name,
          login_customer_id: row.loginCustomerId,
          website_id: websiteId,
          sync: true,
          identity_id: identityId || undefined,
        }),
      });
      await refresh();
      await load();
      const siteLabel =
        websiteOptions.find((o) => o.id === websiteId)?.label ||
        selectedWebsite?.name ||
        String(websiteId);
      setMessage(`Linked ${row.name} → ${siteLabel}`);
    } catch (e) {
      const err = e as Error & { code?: string; client_id?: number };
      if (err.code === "ALREADY_LINKED" && err.client_id) {
        setMessage("Already linked — opening client.");
        router.push(`/clients/${err.client_id}`);
        return;
      }
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={hideChrome ? undefined : "page-content"}>
      {!hideChrome && (
        <div className="page-heading" style={{ marginBottom: 16 }}>
          <div>
            <p className="eyebrow">DATA SOURCES</p>
            <h1>Google accounts</h1>
            <p className="muted">
              Connect agency Google once. For multi-property Analytics accounts,
              use <strong>Import client with all websites</strong> (one client,
              many websites).
            </p>
          </div>
          <div className="heading-actions">
            {!platform?.google ? (
              <Link className="secondary-button" href="/settings">
                Configure env
              </Link>
            ) : agencyLinked && !data?.needsReauth ? (
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy === "sync" || loading}
                  onClick={syncAccounts}
                >
                  {busy === "sync" || loading ? "Syncing…" : "Sync accounts"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    connectAgency({
                      mode: identityId ? "reconnect" : "replace",
                    })
                  }
                >
                  Reconnect
                </button>
              </span>
            ) : (
              <button
                className="primary-button"
                type="button"
                disabled={busy === "connect"}
                onClick={() => connectAgency({ mode: "replace" })}
              >
                {busy === "connect" ? "Redirecting…" : "Connect agency Google"}
              </button>
            )}
          </div>
        </div>
      )}

      {hideChrome && agencyLinked && !data?.needsReauth && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <button
            className="primary-button"
            type="button"
            disabled={busy === "sync" || loading}
            onClick={syncAccounts}
          >
            {busy === "sync" || loading ? "Syncing…" : "Sync accounts"}
          </button>
        </div>
      )}

      {hideChrome && platform?.google && (!agencyLinked || data?.needsReauth) && !loading && (
        <div style={{ marginBottom: 16 }}>
          <button
            className="primary-button"
            type="button"
            disabled={busy === "connect"}
            onClick={() =>
              connectAgency({
                mode: identityId && data?.needsReauth ? "reconnect" : "replace",
              })
            }
          >
            {busy === "connect"
              ? "Redirecting…"
              : data?.needsReauth
                ? "Reconnect Google"
                : "Connect Google"}
          </button>
        </div>
      )}

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

        {!hideChrome && !platform?.google && (
          <section className="panel empty-section">
            <h2>Google app not configured</h2>
            <p>Add GOOGLE_CLIENT_ID / SECRET in .env first.</p>
            <Link className="primary-button" href="/settings">
              Settings
            </Link>
          </section>
        )}

        {!hideChrome && platform?.google && !agencyLinked && !loading && (
          <section className="panel empty-section">
            <h2>
              {data?.needsReauth
                ? "Reconnect agency Google"
                : "Connect your agency Gmail"}
            </h2>
            <p>
              {data?.needsReauth
                ? "Stored tokens cannot be read (often after APP_ENCRYPTION_KEY changed). Connect again, then Sync accounts and Integrations → Sync."
                : "Use the Google account clients invited to GA4 / Search Console. After Allow, Sync lists every property you can access."}
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={busy === "connect"}
              onClick={() => connectAgency({ mode: "replace" })}
            >
              {busy === "connect"
                ? "Redirecting…"
                : data?.needsReauth
                  ? "Reconnect agency Google"
                  : "Connect agency Google"}
            </button>
          </section>
        )}

        {!hideChrome && platform?.google && agencyLinked && data?.needsReauth && !loading && (
          <section className="panel empty-section">
            <h2>Reconnect agency Google</h2>
            <p>
              Google rejected the saved login. Connect again to refresh the
              agency token.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={busy === "connect"}
              onClick={() =>
                connectAgency({
                  mode: identityId ? "reconnect" : "replace",
                })
              }
            >
              {busy === "connect" ? "Redirecting…" : "Reconnect agency Google"}
            </button>
          </section>
        )}

        {platform?.google && connected && (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="list-summary">
                <strong>
                  <span className="status active">Connected</span>
                  {" · "}
                  {data?.email ||
                    platform?.agencyGoogle?.email ||
                    "Agency login"}
                </strong>
                <span>
                  {data?.available ?? 0} available · {data?.imported ?? 0}{" "}
                  imported
                  {data?.updatedAt ? ` · token ${data.updatedAt}` : ""}
                </span>
              </div>
              <p className="muted" style={{ margin: "0 4px 12px" }}>
                Import and Sync use the agency Google account. Reconnect
                refreshes agency access when Google permissions change.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "0 4px 12px",
                }}
              >
                <button
                  type="button"
                  className={tab === "available" ? "primary-button" : "secondary-button"}
                  onClick={() => setTab("available")}
                >
                  Available ({data?.available ?? 0})
                </button>
                <button
                  type="button"
                  className={tab === "imported" ? "primary-button" : "secondary-button"}
                  onClick={() => setTab("imported")}
                >
                  Imported ({data?.imported ?? 0})
                </button>
                <button
                  type="button"
                  className={kind === "all" ? "text-button" : "text-button"}
                  onClick={() => setKind("all")}
                  style={{ fontWeight: kind === "all" ? 700 : 400 }}
                >
                  All types
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setKind("ga4")}
                  style={{ fontWeight: kind === "ga4" ? 700 : 400 }}
                >
                  GA4
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setKind("gsc")}
                  style={{ fontWeight: kind === "gsc" ? 700 : 400 }}
                >
                  Search Console
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setKind("ads")}
                  style={{ fontWeight: kind === "ads" ? 700 : 400 }}
                >
                  Google Ads
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy === "disc"}
                  onClick={disconnectAgency}
                  style={{ marginLeft: "auto" }}
                >
                  Clear agency login
                </button>
              </div>
            </section>

            {loading && <p className="muted">Loading accounts from Google…</p>}

            {!loading && (kind === "all" || kind === "ga4") && (
              <section className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-header">
                  <div>
                    <h2>GA4 accounts</h2>
                    <p className="muted">
                      {tab === "available"
                        ? "Preferred: one Analytics account → one client; each property becomes a website. Matching Search Console / Ads link by ID/domain."
                        : "Accounts with at least one linked property"}
                    </p>
                  </div>
                </div>
                <div className="website-list">
                  {ga4AccountsFiltered.map((account) => {
                    const availableProps = account.properties.filter(
                      (p) => !p.linked
                    );
                    const selectedCount = availableProps.filter(
                      (p) => selected[`GA4:${p.id}`]
                    ).length;
                    const accountBusy =
                      busy === `account:${account.accountId}`;
                    const visibleProps =
                      tab === "imported"
                        ? account.properties.filter((p) => p.linked)
                        : account.properties;
                    const multiProperty = account.properties.length > 1;
                    const showRowImport =
                      tab === "available" &&
                      (!multiProperty || account.linkedCount > 0);
                    return (
                      <div
                        key={account.accountId}
                        style={{
                          display: "block",
                          padding: "12px 8px",
                          borderBottom: "1px solid var(--border, #e5e7eb)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            marginBottom: 8,
                          }}
                        >
                          <span className="site-favicon">G</span>
                          <span style={{ flex: 1, minWidth: 200 }}>
                            <strong>
                              {account.accountName} ({account.accountId})
                            </strong>
                            <small>
                              {account.properties.length} propert
                              {account.properties.length === 1 ? "y" : "ies"}
                              {tab === "available"
                                ? ` · ${account.availableCount} available`
                                : ` · ${account.linkedCount} linked`}
                              {multiProperty && tab === "available"
                                ? " · use Import client with all websites"
                                : ""}
                            </small>
                          </span>
                          {tab === "available" && availableProps.length > 0 ? (
                            <span
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                className="primary-button"
                                type="button"
                                disabled={!!busy}
                                onClick={() =>
                                  importGa4Account(account, "all").catch(
                                    () => undefined
                                  )
                                }
                              >
                                {accountBusy
                                  ? "Importing…"
                                  : multiProperty
                                    ? account.linkedCount > 0
                                      ? `Import remaining websites (${availableProps.length})`
                                      : `Import client with all websites (${availableProps.length})`
                                    : `Import client (${availableProps.length})`}
                              </button>
                              {multiProperty ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={!!busy || selectedCount === 0}
                                  onClick={() =>
                                    importGa4Account(account, "selected").catch(
                                      () => undefined
                                    )
                                  }
                                >
                                  Import selected ({selectedCount})
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                          {tab === "imported" &&
                          account.properties.find((p) => p.linked)?.linked ? (
                            <Link
                              className="secondary-button"
                              href={`/clients/${
                                account.properties.find((p) => p.linked)!
                                  .linked!.client_id
                              }`}
                            >
                              Open client
                            </Link>
                          ) : null}
                        </div>
                        <div style={{ paddingLeft: 40 }}>
                          {visibleProps.map((row) => (
                            <div
                              key={row.id}
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                                padding: "6px 0",
                              }}
                            >
                              {!row.linked &&
                              tab === "available" &&
                              multiProperty ? (
                                <label
                                  style={{
                                    display: "grid",
                                    placeItems: "center",
                                    width: 28,
                                  }}
                                  title="Select for Import selected"
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selected[`GA4:${row.id}`])}
                                    disabled={!!busy}
                                    onChange={() =>
                                      toggleSelect(`GA4:${row.id}`)
                                    }
                                  />
                                </label>
                              ) : (
                                <span className="site-favicon">P</span>
                              )}
                              <span style={{ flex: 1, minWidth: 180 }}>
                                <strong>
                                  {row.name} ({row.id})
                                </strong>
                                <small>
                                  {row.url ||
                                    "No web stream URL — import still works (URL from Search Console or pending)"}
                                </small>
                              </span>
                              {row.linked ? (
                                <Link
                                  className="secondary-button"
                                  href={`/clients/${row.linked.client_id}`}
                                >
                                  Open
                                </Link>
                              ) : showRowImport ? (
                                <button
                                  className="text-button"
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() => importGa4(row)}
                                >
                                  {busy === row.id
                                    ? "Importing…"
                                    : account.linkedCount > 0
                                      ? "Add as website"
                                      : "Import"}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!ga4AccountsFiltered.length && (
                    <div className="empty-section">
                      <p>
                        {tab === "available"
                          ? "No unused GA4 accounts/properties (or Sync to refresh)."
                          : "No imported GA4 properties yet."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {!loading &&
              connected &&
              !data?.needsReauth &&
              tab === "available" &&
              availableBulkItems.length > 0 && (
                <section className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-header">
                    <div>
                      <h2>Leftover single imports</h2>
                      <p className="muted">
                        Prefer <strong>GA4 accounts</strong> above —{" "}
                        <strong>Import client with all websites</strong> keeps
                        one client per Analytics account. This path is only for
                        leftover single GA4/GSC rows (can create one client per
                        row).
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      padding: "0 4px 8px",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!!busy}
                      onClick={() => {
                        runBulkImport("all").catch(() => undefined);
                      }}
                    >
                      {busy === "bulk"
                        ? bulkProgress || "Importing…"
                        : `Import leftover (${availableBulkItems.length})`}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={!!busy || selectedKeys.length === 0}
                      onClick={() => {
                        runBulkImport("selected").catch(() => undefined);
                      }}
                    >
                      Import selected leftover ({selectedKeys.length})
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={!!busy}
                      onClick={selectAllAvailable}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={!!busy || selectedKeys.length === 0}
                      onClick={clearSelection}
                    >
                      Clear
                    </button>
                  </div>
                  {bulkProgress ? (
                    <p className="muted" style={{ margin: "0 4px 8px" }}>
                      {bulkProgress}
                    </p>
                  ) : null}
                </section>
              )}

            {!loading && (kind === "all" || kind === "gsc") && (
              <section className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-header">
                  <div>
                    <h2>Search Console sites</h2>
                    <p className="muted">
                      {tab === "available"
                        ? "Best source for real website URLs"
                        : "Already linked"}
                    </p>
                  </div>
                </div>
                <div className="website-list">
                  {gscFiltered.map((row) => (
                    <div key={row.id}>
                      {!row.linked && tab === "available" ? (
                        <label
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: 28,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(selected[`GSC:${row.id}`])}
                            disabled={!!busy}
                            onChange={() => toggleSelect(`GSC:${row.id}`)}
                          />
                        </label>
                      ) : (
                        <span className="site-favicon">S</span>
                      )}
                      <span>
                        <strong>
                          {row.name} ({row.id})
                        </strong>
                        <small>{row.url || row.name}</small>
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
                          className="primary-button"
                          type="button"
                          disabled={!!busy}
                          onClick={() => importGsc(row)}
                        >
                          {busy === row.id ? "Importing…" : "Import"}
                        </button>
                      )}
                    </div>
                  ))}
                  {!gscFiltered.length && (
                    <div className="empty-section">
                      <p>
                        {tab === "available"
                          ? "No unused Search Console sites."
                          : "No imported Search Console sites yet."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {!loading && (kind === "all" || kind === "ads") && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Google Ads accounts</h2>
                    <p className="muted">
                      {tab === "available"
                        ? "Link an Ads customer to a website (explicit — never auto-matched)"
                        : "Already linked to a website"}
                    </p>
                  </div>
                </div>
                {adsError && (
                  <div className="banner-error" style={{ marginBottom: 12 }}>
                    Ads list failed (GA4/GSC above still OK): {adsError}
                    {!platform?.agencyGoogle?.hasAdsScope
                      ? " · Reconnect agency Google to grant Ads access."
                      : " · Check Cloud Console Ads API access / MCC login-customer-id."}
                  </div>
                )}
                {tab === "available" && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                      marginBottom: 12,
                      padding: "0 4px",
                    }}
                  >
                    <label className="muted" htmlFor="ads-target-client">
                      Client
                    </label>
                    <select
                      id="ads-target-client"
                      value={adsTargetClientId}
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        if (!cid) {
                          setAdsTargetClientId("");
                          setAdsTargetWebsiteId("");
                          setAdsSitesLocal([]);
                          return;
                        }
                        loadAdsSitesForClient(cid).catch(() => undefined);
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
                    <label className="muted" htmlFor="ads-target-site">
                      Website
                    </label>
                    <select
                      id="ads-target-site"
                      value={adsTargetWebsiteId}
                      onChange={(e) =>
                        setAdsTargetWebsiteId(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      style={{ minHeight: 40, minWidth: 200 }}
                    >
                      <option value="">Select website…</option>
                      {adsSitesLocal.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="website-list">
                  {adsFiltered.map((row) => (
                    <div key={row.id}>
                      <span className="site-favicon">A</span>
                      <span>
                        <strong>
                          {row.name} ({row.id})
                        </strong>
                        <small>
                          {row.account ? `${row.account}` : "Ads"}
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
                          className="primary-button"
                          type="button"
                          disabled={
                            !!busy || !Number(adsTargetWebsiteId || 0)
                          }
                          onClick={() => linkAds(row)}
                        >
                          {busy === row.id ? "Linking…" : "Link to website"}
                        </button>
                      )}
                    </div>
                  ))}
                  {!adsFiltered.length && (
                    <div className="empty-section">
                      <p>
                        {adsError
                          ? "Could not list Ads accounts."
                          : tab === "available"
                            ? "No unused Ads accounts (Reconnect agency Google if Ads scope was missing)."
                            : "No linked Ads accounts yet."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
    </div>
  );
}

export default GoogleInventory;
