"use client";

import Link from "next/link";
import AdminShell, { PageHeader } from "./admin-shell";

export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AdminShell title={title}>
      <div className="page-content">
        <PageHeader
          eyebrow="LATER"
          title={title}
          description={description}
          action={
            <Link className="secondary-button" href="/">
              ← Overview
            </Link>
          }
        />
        <section className="panel empty-section">
          <h2>Not in this phase</h2>
          <p className="muted">
            This Searchly demo screen is parked. Use Clients, From Google,
            Integrations, and Reports for live work.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Link className="primary-button" href="/clients">
              Clients
            </Link>
            <Link className="secondary-button" href="/integrations">
              From Google
            </Link>
            <Link className="secondary-button" href="/integrations">
              Integrations
            </Link>
            <Link className="secondary-button" href="/reports">
              Reports
            </Link>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
