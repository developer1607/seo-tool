"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { PageHeader } from "../../components/admin-shell";
import { api, type Session } from "../../../lib/api";
import { useSession } from "../../providers";

export default function AddClientPage() {
  const router = useRouter();
  const { apply } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    website_url: "",
    brand_primary: "#6658d3",
    brand_secondary: "#1e2530",
    timezone: "Asia/Kolkata",
    currency: "INR",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<Session & { client: { id: number } }>("/clients", {
        method: "POST",
        body: JSON.stringify(form),
      });
      apply(data);
      router.push(`/clients/${data.client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Add Client">
      <div className="page-content">
        <PageHeader
          eyebrow="CLIENTS"
          title="Add a new client"
          description="Creates a client profile and first website from the URL."
          action={
            <Link className="secondary-button" href="/clients">
              ← Back to clients
            </Link>
          }
        />
        <div className="form-layout">
          <form className="panel form-panel" onSubmit={onSubmit}>
            <div className="form-section">
              <h2>Client information</h2>
              <p className="muted">Stored on the Webastral API.</p>
              {error && <div className="banner-error">{error}</div>}
              <div className="form-grid">
                <label>
                  Client name
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Northstar Finance"
                  />
                </label>
                <label>
                  Website URL
                  <input
                    required
                    value={form.website_url}
                    onChange={(e) =>
                      setForm({ ...form, website_url: e.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </label>
                <label>
                  Brand primary
                  <input
                    type="color"
                    value={form.brand_primary}
                    onChange={(e) =>
                      setForm({ ...form, brand_primary: e.target.value })
                    }
                  />
                </label>
                <label>
                  Brand secondary
                  <input
                    type="color"
                    value={form.brand_secondary}
                    onChange={(e) =>
                      setForm({ ...form, brand_secondary: e.target.value })
                    }
                  />
                </label>
                <label>
                  Timezone
                  <input
                    value={form.timezone}
                    onChange={(e) =>
                      setForm({ ...form, timezone: e.target.value })
                    }
                  />
                </label>
                <label>
                  Currency
                  <input
                    value={form.currency}
                    onChange={(e) =>
                      setForm({ ...form, currency: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="form-footer">
              <Link className="secondary-button" href="/clients">
                Cancel
              </Link>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create client →"}
              </button>
            </div>
          </form>
          <aside className="panel form-tip">
            <span className="tip-icon">✦</span>
            <h2>Next: connect platforms</h2>
            <p>
              After creating the client, open Integrations to connect GA4, Search
              Console, Meta Ads, and Google Ads (Phase 1).
            </p>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
