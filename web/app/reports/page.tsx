"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { PageHeader } from "../components/admin-shell";
import { api } from "../../lib/api";
import { useSession } from "../providers";

type Report = {
  id: number;
  title: string | null;
  range_from?: string;
  range_to?: string;
  created_at: string;
};

export default function ReportsPage() {
  const { selectedClient, selectedWebsite } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedWebsite) {
      setReports([]);
      return;
    }
    api<{ reports: Report[] }>("/reports")
      .then((d) => setReports(d.reports))
      .catch((e) => setError(e.message));
  }, [selectedWebsite]);

  return (
    <AdminShell title="Reports">
      <div className="page-content">
        <PageHeader
          eyebrow="WORKSPACE"
          title="Reports"
          description="Saved reports for the selected website. Click a row to open KPIs for that range."
          action={
            <Link className="primary-button" href="/reports/generate">
              ＋ Generate report
            </Link>
          }
        />
        {!selectedWebsite ? (
          <section className="panel empty-section">
            <h2>Select a website</h2>
            <p>Pick a client and website in the top bar first.</p>
            <Link className="primary-button" href="/clients">
              Open clients
            </Link>
          </section>
        ) : (
          <>
            {error && <div className="banner-error">{error}</div>}
            <section className="panel">
              <div className="list-summary">
                <strong>
                  {selectedClient?.name} · {selectedWebsite.name}
                </strong>
                <span>
                  {reports.length} report{reports.length === 1 ? "" : "s"}
                </span>
              </div>
              {!reports.length ? (
                <div className="empty-section">
                  <p>No reports yet for this website.</p>
                  <Link className="primary-button" href="/reports/generate">
                    Generate report
                  </Link>
                </div>
              ) : (
                <div className="website-list">
                  {reports.map((r) => (
                    <Link
                      key={r.id}
                      href={`/reports/${r.id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <span className="site-favicon">R</span>
                      <span>
                        <strong>{r.title || `Report #${r.id}`}</strong>
                        <small>
                          {r.range_from && r.range_to
                            ? `${r.range_from} → ${r.range_to} · `
                            : ""}
                          {r.created_at}
                        </small>
                      </span>
                      <span className="text-button">Open →</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
