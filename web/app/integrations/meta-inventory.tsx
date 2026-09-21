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

type MetaRow = {
  id: string;
  name: string;
  currency?: string | null;
  accountStatus?: number | null;
  linked: LinkInfo;
};

type DataIdentity = {
  id: number;
  provider: string;
  email?: string | null;
  displayName?: string | null;
  isDefault?: boolean;
  status?: string;
  hasToken?: boolean;
};

type Discover = {
  connected: boolean;
  needsReauth?: boolean;
  error?: string;
  identityId?: number | null;
  identities?: DataIdentity[];
  name?: string | null;
  email?: string | null;
  updatedAt?: string | null;
  accounts: MetaRow[];
  available?: number;
  imported?: number;
};

function MetaInventory({ hideChrome = false }: { hideChrome?: boolean }) {
  const { platform, refresh, selectedWebsite, selectedClient, clients } =
    useSession();
  const search = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Discover | null>(null);
  const [tab, setTab] = useState<"available" | "imported">("available");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetClientId, setTargetClientId] = useState<number | "">("");
  const [targetWebsiteId, setTargetWebsiteId] = useState<number | "">("");
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [identityId, setIdentityId] = useState<number | null>(() => {
    const q = Number(search.get("identity_id") || 0);
    return q || null;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const qs = identityId ? `?identity_id=${identityId}` : "";
    try {
      const d = await api<Discover>(`/integrations/meta/accounts${qs}`);
      setData(d);
      if (!identityId && d.identityId) setIdentityId(d.identityId);
      if (d.needsReauth || d.error) {
        setError(
          d.error ||
            "Meta login needs reconnect. Use Reconnect / Connect Meta."
        );
      }
      if (d.connected && (d.available || 0) === 0 && (d.imported || 0) > 0) {
        setTab("imported");
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [identityId]);

  useEffect(() => {
    const err = search.get("meta_error");
    if (err) setError(err);
    if (search.get("meta") === "1") {
      setMessage(
        "Meta linked. Sync the ad-account list, then link an account to a website."
      );
    }
    if (
      typeof window !== "undefined" &&
      (err || search.get("meta") === "1")
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete("meta");
      url.searchParams.delete("meta_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadSitesForClient = useCallback(
    async (clientId: number, preferWebsiteId?: number) => {
      setTargetClientId(clientId);
      setTargetWebsiteId("");
      setSites([]);
      try {
        const d = await api<{ websites: { id: number; name: string }[] }>(
          `/clients/${clientId}/research`
        );
        const next = (d.websites || []).map((w) => ({
          id: w.id,
          name: w.name,
        }));
        setSites(next);
        if (preferWebsiteId && next.some((s) => s.id === preferWebsiteId)) {
          setTargetWebsiteId(preferWebsiteId);
        } else if (next.length === 1) {
          setTargetWebsiteId(next[0].id);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    []
  );

  useEffect(() => {
    if (targetClientId || !selectedClient?.id) return;
    loadSitesForClient(selectedClient.id, selectedWebsite?.id).catch(
      () => undefined
    );
  }, [
    selectedClient?.id,
    selectedWebsite?.id,
    targetClientId,
    loadSitesForClient,
  ]);

  const connected = Boolean(data?.connected && !data?.needsReauth);
  const agencyLinked =
    data != null ? connected : Boolean(platform?.agencyMeta?.linked);
  const rows = useMemo(() => {
    const list = data?.accounts || [];
    return list.filter((r) =>
      tab === "imported" ? Boolean(r.linked) : !r.linked
    );
  }, [data, tab]);

  const websiteOptions = useMemo(() => {
    return sites.map((w) => {
      const clientName =
        clients?.find((c) => c.id === targetClientId)?.name || "Client";
      return { id: w.id, label: `${clientName} · ${w.name}` };
    });
  }, [sites, targetClientId, clients]);

  async function connectMeta(opts?: {
    mode?: "replace" | "add" | "reconnect";
  }) {
    const mode = opts?.mode || "replace";
    const label = data?.name || platform?.agencyMeta?.name || null;
    if (mode === "replace" && (agencyLinked || label)) {
      const ok = window.confirm(
        label
          ? `Reconnect replaces the default Meta identity (${label}). Other linked accounts stay. Continue?`
          : "Reconnect replaces the default Meta identity. Continue?"
      );
      if (!ok) return;
    }
    setBusy(mode === "add" ? "add" : "connect");
    setError("");
    try {
      const params = new URLSearchParams({
        format: "json",
        connect: mode,
      });
      if (mode === "reconnect" && identityId) {
        params.set("identity_id", String(identityId));
      }
      const d = await api<{ url: string }>(
        `/integrations/meta/start?${params.toString()}`
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function selectIdentity(nextId: number) {
    setIdentityId(nextId);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "accounts");
    url.searchParams.set("view", "meta");
    url.searchParams.set("identity_id", String(nextId));
    router.replace(url.pathname + "?" + url.searchParams.toString());
    try {
      await api("/integrations/meta/identities/default", {
        method: "POST",
        body: JSON.stringify({ identity_id: nextId }),
      });
      await refresh();
    } catch (e) {
      setError(
        (e as Error).message ||
          "Could not set default Meta account — Link to website may still use the previous login."
      );
    }
  }

  async function syncAccounts() {
    setBusy("sync");
    setMessage("");
    try {
      await load();
      setMessage("Ad account list refreshed from Meta.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnectMeta() {
    const label = data?.name || data?.email || "this Meta account";
    const multi = (data?.identities?.length || 0) > 1;
    const ok = window.confirm(
      multi && identityId
        ? `Disconnect ${label} only? Other Meta accounts and their website links stay.`
        : `Disconnect Meta (${label})? Website links stay; Connect again to browse ad accounts.`
    );
    if (!ok) return;
    setBusy("disc");
    try {
      await api("/integrations/meta/agency/disconnect", {
        method: "POST",
        body: JSON.stringify(
          identityId && multi ? { identity_id: identityId } : {}
        ),
      });
      setMessage(
        multi && identityId
          ? "That Meta account was cleared. Other accounts remain."
          : "Meta login cleared. Website links kept; Connect again to use inventory."
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

  async function linkAccount(row: MetaRow) {
    const websiteId = Number(targetWebsiteId || selectedWebsite?.id || 0);
    if (!websiteId) {
      setError(
        "Choose a website below (or in the top bar), then link this Meta ad account."
      );
      return;
    }
    setBusy(row.id);
    setError("");
    try {
      await api("/integrations/meta/select", {
        method: "POST",
        body: JSON.stringify({
          website_id: websiteId,
          external_account_id: row.id,
          external_account_name: row.name,
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

  async function createClientAndLink(row: MetaRow) {
    const defaultName = row.name || row.id;
    const websiteUrl = window.prompt(
      `Website URL for “${defaultName}” (required — Meta does not return one):`,
      "https://"
    );
    if (websiteUrl == null) return;
    const trimmedUrl = websiteUrl.trim();
    if (!trimmedUrl || trimmedUrl === "https://") {
      setError("Website URL is required to create a Meta-only client.");
      return;
    }
    const clientNameRaw = window.prompt(
      "Client name (optional — defaults to ad account name):",
      defaultName
    );
    if (clientNameRaw == null) return;
    const clientName = clientNameRaw.trim() || defaultName;

    setBusy(`create-${row.id}`);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        client: { id: number; name: string };
        website: { id: number };
      }>("/integrations/meta/import", {
        method: "POST",
        body: JSON.stringify({
          external_account_id: row.id,
          external_account_name: row.name,
          website_url: trimmedUrl,
          client_name: clientName,
          sync: true,
          identity_id: identityId || undefined,
        }),
      });
      await refresh();
      await load();
      setMessage(
        `Created ${result.client.name} and linked ${row.name}. Opening client…`
      );
      router.push(`/clients/${result.client.id}`);
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

      {!hideChrome && !platform?.meta && (
        <section className="panel empty-section">
          <h2>Meta app not configured</h2>
          <p>Add META_APP_ID / SECRET in .env first.</p>
          <Link className="primary-button" href="/settings">
            Settings
          </Link>
        </section>
      )}

      {!hideChrome && platform?.meta && !agencyLinked && !loading && (
        <section className="panel empty-section">
          <h2>
            {data?.needsReauth ? "Reconnect Meta" : "Connect Meta"}
          </h2>
          <p>
            {data?.needsReauth
              ? "Stored token cannot be used. Connect again, then Sync accounts and link an ad account to a website."
              : "Use the Facebook login that has access to client ad accounts. After Allow, Sync lists every ad account you can read."}
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={busy === "connect"}
            onClick={() => connectMeta({ mode: "replace" })}
          >
            {busy === "connect"
              ? "Redirecting…"
              : data?.needsReauth
                ? "Reconnect Meta"
                : "Connect Meta"}
          </button>
        </section>
      )}

      {hideChrome && platform?.meta && data?.needsReauth && !loading && (
        <section className="panel empty-section">
          <h2>Reconnect this Meta login</h2>
          <p>
            Meta rejected the saved token. Reconnect this identity, or add
            another Meta account.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={busy === "connect"}
            onClick={() =>
              connectMeta({ mode: identityId ? "reconnect" : "replace" })
            }
          >
            {busy === "connect" ? "Redirecting…" : "Reconnect Meta"}
          </button>
        </section>
      )}

      {platform?.meta && connected && (
        <>
          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="list-summary">
              <strong>
                <span className="status active">Connected</span>
                {" · "}
                {data?.name ||
                  data?.email ||
                  platform?.agencyMeta?.name ||
                  "Meta login"}
              </strong>
              <span>
                {data?.available ?? 0} available · {data?.imported ?? 0}{" "}
                linked
                {data?.updatedAt ? ` · token ${data.updatedAt}` : ""}
              </span>
            </div>
            {(data?.identities?.length || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "0 4px 8px",
                  alignItems: "center",
                }}
              >
                <span className="muted" style={{ fontSize: 13 }}>
                  Meta account:
                </span>
                {(data?.identities || []).map((idRow) => (
                  <button
                    key={idRow.id}
                    type="button"
                    className={
                      (identityId || data?.identityId) === idRow.id
                        ? "primary-button"
                        : "secondary-button"
                    }
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    onClick={() => selectIdentity(idRow.id)}
                  >
                    {idRow.displayName ||
                      idRow.email ||
                      `Account ${idRow.id}`}
                    {idRow.isDefault ? " · default" : ""}
                    {idRow.status === "needs_reauth" ? " · reconnect" : ""}
                  </button>
                ))}
              </div>
            )}
            <p className="muted" style={{ margin: "0 4px 12px" }}>
              Link and Sync use the selected Meta login.{" "}
              <strong>Add Meta account</strong> connects another Facebook user
              without overwriting this one. Reconnect refreshes only the
              selected identity.
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
                className={
                  tab === "available" ? "primary-button" : "secondary-button"
                }
                onClick={() => setTab("available")}
              >
                Available ({data?.available ?? 0})
              </button>
              <button
                type="button"
                className={
                  tab === "imported" ? "primary-button" : "secondary-button"
                }
                onClick={() => setTab("imported")}
              >
                Linked ({data?.imported ?? 0})
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy === "sync" || loading}
                onClick={() => {
                  syncAccounts().catch(() => undefined);
                }}
              >
                {busy === "sync" || loading ? "Syncing…" : "Sync accounts"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!!busy}
                onClick={() => connectMeta({ mode: "add" })}
              >
                {busy === "add" ? "Redirecting…" : "Add Meta account"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy === "disc"}
                onClick={() => {
                  disconnectMeta().catch(() => undefined);
                }}
                style={{ marginLeft: "auto" }}
              >
                Clear Meta login
              </button>
            </div>
          </section>

          {loading && <p className="muted">Loading ad accounts from Meta…</p>}

          {!loading && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Meta Ads accounts</h2>
                  <p className="muted">
                    {tab === "available"
                      ? "Link to an existing client website, or Create client & link (Meta-only — you supply the site URL)"
                      : "Already linked to a website"}
                  </p>
                </div>
              </div>
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
                  <label className="muted" htmlFor="meta-target-client">
                    Client
                  </label>
                  <select
                    id="meta-target-client"
                    value={targetClientId}
                    onChange={(e) => {
                      const cid = Number(e.target.value);
                      if (!cid) {
                        setTargetClientId("");
                        setTargetWebsiteId("");
                        setSites([]);
                        return;
                      }
                      loadSitesForClient(cid).catch(() => undefined);
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
                  <label className="muted" htmlFor="meta-target-site">
                    Website
                  </label>
                  <select
                    id="meta-target-site"
                    value={targetWebsiteId}
                    onChange={(e) =>
                      setTargetWebsiteId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    style={{ minHeight: 40, minWidth: 200 }}
                  >
                    <option value="">Select website…</option>
                    {sites.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="website-list">
                {rows.map((row) => (
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
                      <span
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!!busy}
                          onClick={() => {
                            createClientAndLink(row).catch(() => undefined);
                          }}
                        >
                          {busy === `create-${row.id}`
                            ? "Creating…"
                            : "Create client & link"}
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!!busy || !Number(targetWebsiteId || 0)}
                          onClick={() => linkAccount(row)}
                        >
                          {busy === row.id ? "Linking…" : "Link to website"}
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {!rows.length && (
                  <div className="empty-section">
                    <p>
                      {tab === "available"
                        ? "No unused ad accounts — check ads_read + Business access, or Add Meta account."
                        : "No linked Meta ad accounts yet."}
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

export default MetaInventory;
