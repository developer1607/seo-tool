"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { OriginBadge } from "../components/origin-badge";
import { api, type Client, type Session } from "../../lib/api";
import { useSession } from "../providers";

const colors = ["purple", "orange", "green", "blue", "pink"];

export default function ClientsPage() {
  const { clients, selectClient, apply } = useSession();
  const [list, setList] = useState<Client[]>(clients);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setList(clients);
  }, [clients]);

  useEffect(() => {
    api<{ clients: Client[] }>("/clients")
      .then((d) => setList(d.clients))
      .catch(() => undefined);
  }, []);

  const filtered = list.filter((c) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.website_url || "").toLowerCase().includes(s)
    );
  });

  async function deleteClient(client: Client) {
    const ok = window.confirm(
      `Delete “${client.name}” from Webastral and disconnect its Google links?\n\nGA4 / Search Console stay in the Google account. Agency Gmail login is kept for other clients.`
    );
    if (!ok) return;
    setBusyId(client.id);
    setError("");
    try {
      const session = await api<Session>(
        `/clients/${client.id}?disconnectGoogle=1`,
        {
          method: "DELETE",
          body: JSON.stringify({ disconnectGoogle: true }),
        }
      );
      apply(session);
      setList(session.clients || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Clients">
      <div className="page-content">
        <PageHeader
          eyebrow="WORKSPACE"
          title="Clients"
          description="Client profiles and websites. Open a row to manage sites and connections."
          action={
            <>
              <Link className="secondary-button" href="/agency">
                Agency dashboard
              </Link>
              <Link className="secondary-button" href="/integrations?tab=accounts&view=google">
                From Google
              </Link>
              <Link className="primary-button" href="/clients/new">
                ＋ Add client
              </Link>
            </>
          }
        />
        {error && <div className="banner-error">{error}</div>}
        <div className="client-toolbar">
          <div className="search-field">
            ⌕{" "}
            <input
              aria-label="Search clients"
              placeholder="Search by name or URL…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <section className="panel client-list-panel">
          <div className="list-summary">
            <strong>
              {filtered.length} client{filtered.length === 1 ? "" : "s"}
            </strong>
            <span>Open a row · Delete removes dashboard + Google links</span>
          </div>
          <div className="client-table">
            <div className="table-heading">
              <span>CLIENT</span>
              <span>PRIMARY URL</span>
              <span>ORIGIN</span>
              <span>CURRENCY</span>
              <span>TIMEZONE</span>
              <span />
            </div>
            {filtered.map((client, i) => (
              <div className="client-row client-row-actions" key={client.id}>
                <Link
                  className="client-row-main"
                  href={`/clients/${client.id}`}
                  onClick={() => {
                    selectClient(client.id).catch(() => undefined);
                  }}
                >
                  <div className="client-name">
                    <span
                      className={`client-avatar ${colors[i % colors.length]}`}
                    >
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{client.name}</strong>
                      <small>ID {client.id}</small>
                    </span>
                  </div>
                  <span>{client.website_url || "—"}</span>
                  <span>
                    <OriginBadge origin={client.origin} />
                  </span>
                  <strong>{client.currency}</strong>
                  <span>{client.timezone}</span>
                </Link>
                <span className="client-delete-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyId === client.id}
                    onClick={() => deleteClient(client)}
                  >
                    {busyId === client.id ? "…" : "Delete"}
                  </button>
                </span>
              </div>
            ))}
            {!filtered.length && (
              <div className="empty-section">
                <p>No clients match. Add one or import From Google.</p>
                <Link className="primary-button" href="/clients/new">
                  Add client
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
