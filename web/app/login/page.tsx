"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "../../lib/api";
import { useSession } from "../providers";

function LoginInner() {
  const { user, loading, login, platform } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleConfigured = Boolean(platform?.google);

  useEffect(() => {
    const err = search.get("google_error");
    if (err) setError(err);
  }, [search]);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/agency");
    }
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/agency");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setError("");
    try {
      const d = await api<{ url: string }>(
        "/auth/google/login/start?format=json"
      );
      window.location.href = d.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleBusy(false);
    }
  }

  if (loading || user) {
    return (
      <div className="login-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <form className="login-card panel" onSubmit={onSubmit}>
        <div className="brand" style={{ paddingBottom: 12 }}>
          <span className="brand-mark">W</span>
          <span>Webastral</span>
          <small>ADMIN LOGIN</small>
        </div>
        <p className="muted">
          Clients do not log in — Admin only. Signing in with Google does{" "}
          <strong>not</strong> connect Analytics or Ads — do that under
          Integrations after login.
        </p>
        {error && <div className="banner-error">{error}</div>}
        {googleConfigured && (
          <>
            <button
              className="secondary-button wide-button"
              type="button"
              disabled={googleBusy || busy}
              onClick={() => {
                continueWithGoogle().catch(() => undefined);
              }}
            >
              {googleBusy ? "Redirecting…" : "Continue with Google"}
            </button>
            <p className="muted" style={{ textAlign: "center", margin: 0 }}>
              or use email and password
            </p>
          </>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button
          className="primary-button wide-button"
          type="submit"
          disabled={busy || googleBusy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {!googleConfigured && (
          <p className="muted" style={{ margin: 0 }}>
            Continue with Google appears when GOOGLE_CLIENT_ID / SECRET are set.
          </p>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <p className="muted">Loading…</p>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
