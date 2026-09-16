"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api, type Session } from "../../lib/api";
import { useSession } from "../providers";

function SettingsInner() {
  const { user, platform, apply, refresh } = useSession();
  const search = useSearchParams();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleLogin = platform?.googleLogin;
  const googleConfigured = Boolean(platform?.google);

  useEffect(() => {
    if (search.get("google_login") === "1") {
      setMessage("Google sign-in linked to your admin account.");
      refresh().catch(() => undefined);
    }
    const err = search.get("google_error");
    if (err) setError(err);
    if (typeof window !== "undefined" && (search.get("google_login") || err)) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google_login");
      url.searchParams.delete("google_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search, refresh]);

  async function linkGoogleLogin() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ url: string }>(
        "/auth/google/login/start?intent=link&format=json"
      );
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function unlinkGoogleLogin() {
    if (
      !window.confirm(
        "Unlink Google sign-in? You can still use email and password."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api<Session & { ok?: boolean }>(
        "/auth/google/login/unlink",
        { method: "POST", body: "{}" }
      );
      apply(d);
      setMessage("Google sign-in unlinked.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Settings">
      <div className="page-content">
        <PageHeader
          title="Settings"
          description="Admin profile, sign-in methods, and platform OAuth apps (server .env — not client secrets)."
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
        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Admin</h2>
                <p className="muted">Signed-in operator</p>
              </div>
            </div>
            <div className="website-list">
              <div>
                <span className="site-favicon">A</span>
                <span>
                  <strong>{user?.name || "—"}</strong>
                  <small>{user?.email}</small>
                </span>
                <b className="status active">ADMIN</b>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Sign-in methods</h2>
                <p className="muted">
                  Continue with Google only signs you into Webastral — it does
                  not connect Analytics or Ads.
                </p>
              </div>
            </div>
            <div className="website-list">
              <div>
                <span className="site-favicon">✉</span>
                <span>
                  <strong>Email + password</strong>
                  <small>{user?.email}</small>
                </span>
                <b className="status active">Enabled</b>
              </div>
              <div>
                <span className="site-favicon">G</span>
                <span>
                  <strong>Google sign-in</strong>
                  <small>
                    {googleLogin?.linked
                      ? `Linked as ${googleLogin.email || "Google"}`
                      : "Not linked — Gmail must match this admin email"}
                  </small>
                </span>
                {googleLogin?.linked ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      unlinkGoogleLogin().catch(() => undefined);
                    }}
                  >
                    Unlink
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || !googleConfigured}
                    onClick={() => {
                      linkGoogleLogin().catch(() => undefined);
                    }}
                  >
                    {busy ? "Redirecting…" : "Link Google"}
                  </button>
                )}
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12, padding: "0 4px" }}>
              To pull client metrics, open{" "}
              <Link href="/integrations">Integrations</Link> → Connect Google,
              then Import / Link to website.
            </p>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Platform OAuth apps</h2>
                <p className="muted">From .env — not client secrets</p>
              </div>
              <Link className="text-button" href="/integrations">
                Per-site connect →
              </Link>
            </div>
            <div className="website-list">
              <div>
                <span className="site-favicon">G</span>
                <span>
                  <strong>Google</strong>
                  <small>Login SSO · GA4 · Search Console · Ads</small>
                </span>
                <b
                  className={`status ${
                    platform?.google ? "active" : "attention"
                  }`}
                >
                  {platform?.google ? "Configured" : "Missing env"}
                </b>
              </div>
              <div>
                <span className="site-favicon">A</span>
                <span>
                  <strong>Google Ads API</strong>
                  <small>
                    Cloud project access
                    {platform?.googleAdsTokenOptional
                      ? " · optional legacy token set"
                      : " · enable Ads API + apply access in Cloud Console"}
                  </small>
                </span>
                <b
                  className={`status ${
                    platform?.googleAds ? "active" : "attention"
                  }`}
                >
                  {platform?.googleAds
                    ? "OAuth ready"
                    : "Missing Google OAuth"}
                </b>
              </div>
              <div>
                <span className="site-favicon">M</span>
                <span>
                  <strong>Meta Ads</strong>
                  <small>
                    {platform?.meta
                      ? "Configured — connect under Integrations"
                      : "Set META_APP_ID / META_APP_SECRET, then Integrations → Meta"}
                  </small>
                </span>
                <b
                  className={`status ${platform?.meta ? "active" : "attention"}`}
                >
                  {platform?.meta ? "Configured" : "Missing env"}
                </b>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12, padding: "0 4px" }}>
              Google Ads &quot;OAuth ready&quot; only means Client ID/Secret are
              set. Enable Google Ads API on the same Cloud project, apply API
              access, then verify by listing Ads accounts on Integrations →
              Google. Optional legacy developer token is{" "}
              {platform?.googleAdsTokenOptional ? "set" : "not set"}.
            </p>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-content">
          <p className="muted">Loading…</p>
        </div>
      }
    >
      <SettingsInner />
    </Suspense>
  );
}
