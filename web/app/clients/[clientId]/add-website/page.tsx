"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell, { PageHeader } from "../../../components/admin-shell";
import { api, type Session } from "../../../../lib/api";
import { useSession } from "../../../providers";

export default function AddWebsitePage() {
  const params = useParams();
  const clientId = Number(params.clientId);
  const router = useRouter();
  const { apply, selectedClient } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<Session & { website: { id: number } }>(
        `/clients/${clientId}/websites`,
        {
          method: "POST",
          body: JSON.stringify(form),
        }
      );
      apply(data);
      router.push(`/clients/${clientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add website");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Add website">
      <div className="page-content">
        <PageHeader
          eyebrow={`CLIENTS / ${(selectedClient?.name || "…").toUpperCase()}`}
          title="Add a website"
          description="Each website has its own platform connections and reports."
          action={
            <Link className="secondary-button" href={`/clients/${clientId}`}>
              ← Back
            </Link>
          }
        />
        <form className="panel form-panel" onSubmit={onSubmit}>
          {error && <div className="banner-error">{error}</div>}
          <div className="form-grid">
            <label>
              Website name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main site"
              />
            </label>
            <label>
              URL
              <input
                required
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com"
              />
            </label>
            <label>
              Timezone
              <input
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </label>
            <label>
              Currency
              <input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </label>
          </div>
          <div className="form-footer">
            <Link className="secondary-button" href={`/clients/${clientId}`}>
              Cancel
            </Link>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add website"}
            </button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
