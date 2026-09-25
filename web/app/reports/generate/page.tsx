"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { PageHeader } from "../../components/admin-shell";
import { api } from "../../../lib/api";
import { useSession } from "../../providers";
import {
  REPORT_SECTIONS,
  defaultSectionsMap,
  type SectionsMap,
} from "../../../lib/report-sections";
import {
  REPORT_KPI_DEFS,
  kpisForEnabledSections,
} from "../../../lib/report-kpis";
import {
  DEFAULT_PRESETS,
  previewResolveRange,
} from "../../../lib/date-range";

export default function GenerateReportPage() {
  const router = useRouter();
  const {
    clients,
    websites,
    selectedClient,
    selectedWebsite,
    selectClient,
    selectWebsite,
  } = useSession();
  const [clientId, setClientId] = useState(
    String(selectedClient?.id || clients[0]?.id || "")
  );
  const [websiteId, setWebsiteId] = useState(
    String(selectedWebsite?.id || "")
  );
  const [title, setTitle] = useState(
    selectedClient
      ? `${selectedClient.name.split(/\s+[—–-]\s+/)[0]} SEO report`
      : "SEO performance report"
  );
  const [preset, setPreset] = useState("last_30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [useOverviewDefaults, setUseOverviewDefaults] = useState(true);
  const [sections, setSections] = useState<SectionsMap>(defaultSectionsMap());
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedClient?.id != null) {
      const t = window.setTimeout(
        () => setClientId(String(selectedClient.id)),
        0
      );
      return () => window.clearTimeout(t);
    }
  }, [selectedClient?.id]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setWebsiteId(String(selectedWebsite?.id || "")),
      0
    );
    return () => window.clearTimeout(t);
  }, [selectedWebsite?.id]);

  const clientWebsites = useMemo(() => {
    if (!clientId) return [];
    if (String(selectedClient?.id) === clientId) return websites;
    return [];
  }, [clientId, selectedClient?.id, websites]);

  const previewName = useMemo(() => {
    const c = clients.find((x) => String(x.id) === clientId);
    const raw = c?.name || selectedClient?.name || "Client";
    return raw.split(/\s+[—–-]\s+/)[0] || raw;
  }, [clients, clientId, selectedClient]);

  const previewWebsite = useMemo(() => {
    const fromList = clientWebsites.find((w) => String(w.id) === websiteId);
    if (fromList) return fromList;
    if (String(selectedWebsite?.id) === websiteId) return selectedWebsite;
    return null;
  }, [clientWebsites, websiteId, selectedWebsite]);

  const resolved = useMemo(
    () => previewResolveRange(preset, from, to),
    [preset, from, to]
  );

  const activeSections = useOverviewDefaults
    ? defaultSectionsMap()
    : sections;

  const chartKpis = useMemo(
    () => kpisForEnabledSections(activeSections),
    [activeSections]
  );

  async function onClientChange(nextId: string) {
    setClientId(nextId);
    setError("");
    const c = clients.find((x) => String(x.id) === nextId);
    if (c) {
      const short = c.name.split(/\s+[—–-]\s+/)[0] || c.name;
      setTitle(`${short} SEO report`);
    }
    if (!nextId) {
      setWebsiteId("");
      return;
    }
    setSwitching(true);
    try {
      const session = await selectClient(Number(nextId));
      setWebsiteId(String(session.selectedWebsite?.id || ""));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not switch client"
      );
    } finally {
      setSwitching(false);
    }
  }

  async function onWebsiteChange(nextId: string) {
    setWebsiteId(nextId);
    setError("");
    if (!nextId) return;
    setSwitching(true);
    try {
      await selectWebsite(Number(nextId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not switch website"
      );
    } finally {
      setSwitching(false);
    }
  }

  function toggleSection(id: string) {
    const def = REPORT_SECTIONS.find((s) => s.id === id);
    if (def?.required) return;
    setSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Select a client");
      return;
    }
    if (!websiteId) {
      setError("Select a website");
      return;
    }
    if (preset === "custom" && (!from || !to)) {
      setError("Pick From and To for a custom period");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (String(selectedClient?.id) !== clientId) {
        await selectClient(Number(clientId));
      }
      if (String(selectedWebsite?.id) !== websiteId) {
        await selectWebsite(Number(websiteId));
      }
      const data = await api<{ report: { id: number } }>("/reports", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || `${previewName} SEO report`,
          preset,
          from: preset === "custom" ? from : undefined,
          to: preset === "custom" ? to : undefined,
          use_overview_defaults: useOverviewDefaults,
          sections: activeSections,
        }),
      });
      router.push(`/reports/${data.report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report");
      setBusy(false);
    }
  }

  const phase1 = REPORT_SECTIONS.filter((s) => s.phase <= 1);
  const later = REPORT_SECTIONS.filter((s) => s.phase > 1);

  return (
    <AdminShell title="Generate Report">
      <div className="page-content">
        <PageHeader
          eyebrow="REPORTS / NEW"
          title="Create a client report"
          description="Pick the period (prior matching window is the benchmark). Every KPI in included sections gets a scorecard and a chart."
          action={
            <Link className="secondary-button" href="/reports">
              ← Reports
            </Link>
          }
        />
        {!websiteId && clientId ? (
          <div className="banner-error" style={{ marginBottom: 12 }}>
            This client has no website yet. Add one from Clients, then return
            here.
          </div>
        ) : null}
        {error && <div className="banner-error">{error}</div>}
        <div className="report-builder">
          <form className="panel form-panel" onSubmit={onSubmit}>
            <div className="form-section">
              <h2>Report setup</h2>
              <div className="form-grid">
                <label>
                  Client
                  <select
                    required
                    value={clientId}
                    disabled={switching || busy}
                    onChange={(e) => {
                      onClientChange(e.target.value).catch(() => undefined);
                    }}
                  >
                    <option value="">Select…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Website
                  <select
                    required
                    value={websiteId}
                    disabled={
                      switching || busy || !clientId || clientWebsites.length === 0
                    }
                    onChange={(e) => {
                      onWebsiteChange(e.target.value).catch(() => undefined);
                    }}
                  >
                    {clientWebsites.length === 0 ? (
                      <option value="">
                        {clientId ? "No websites" : "Select a client…"}
                      </option>
                    ) : (
                      clientWebsites.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.url || w.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  Report period
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    {DEFAULT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {preset === "custom" ? (
                  <>
                    <label>
                      From
                      <input
                        type="date"
                        required
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                <label className="wide">
                  Report title
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              </div>
              <p className="muted date-range-hint" style={{ marginTop: 10 }}>
                {resolved.from} → {resolved.to} · vs benchmark{" "}
                {resolved.compareFrom} → {resolved.compareTo}
              </p>
            </div>

            <div className="form-section" style={{ marginTop: 22 }}>
              <label className="section-check">
                <input
                  type="checkbox"
                  checked={useOverviewDefaults}
                  onChange={(e) => setUseOverviewDefaults(e.target.checked)}
                />
                <span>
                  <strong>Use Overview defaults</strong>
                  <small>
                    Quick report from the standard Overview sections. Uncheck to
                    choose sections for a custom client report.
                  </small>
                </span>
              </label>
            </div>

            {!useOverviewDefaults ? (
              <div className="form-section" style={{ marginTop: 22 }}>
                <h2>Sections to include</h2>
                <p className="muted">
                  Each enabled data section includes every KPI with a chart.
                </p>
                <div className="section-check-grid">
                  {phase1.map((s) => (
                    <label key={s.id} className="section-check">
                      <input
                        type="checkbox"
                        checked={Boolean(sections[s.id])}
                        disabled={Boolean(s.required)}
                        onChange={() => toggleSection(s.id)}
                      />
                      <span>
                        <strong>{s.label}</strong>
                        <small>{s.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="muted" style={{ marginTop: 16 }}>
                  Later phases
                </p>
                <div className="section-check-grid">
                  {later.map((s) => (
                    <label key={s.id} className="section-check later">
                      <input
                        type="checkbox"
                        checked={Boolean(sections[s.id])}
                        onChange={() => toggleSection(s.id)}
                      />
                      <span>
                        <strong>{s.label}</strong>
                        <small>{s.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="form-section" style={{ marginTop: 22 }}>
              <h2>Report KPI matrix</h2>
              <p className="muted">
                Reports use the modern reference chart style automatically. Each
                enabled KPI gets one fixed, best-fit chart based on the metric.
              </p>
              <div className="report-chart-matrix">
                {chartKpis.map((k) => (
                  <div key={k.key} className="report-chart-matrix-row">
                    <span>
                      <strong>{k.label}</strong>
                      <small>
                        {REPORT_SECTIONS.find((s) => s.id === k.section)?.label}
                      </small>
                    </span>
                    <span className={`chart-style-pill chart-${k.defaultChart}`}>
                      {k.defaultChart.charAt(0).toUpperCase() +
                        k.defaultChart.slice(1)}
                    </span>
                  </div>
                ))}
                {!chartKpis.length ? (
                  <p className="muted">Enable a data section to include KPI charts.</p>
                ) : null}
              </div>
            </div>


            <div className="form-footer">
              <Link className="secondary-button" href="/reports">
                Cancel
              </Link>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save report"}
              </button>
            </div>
          </form>
          <aside className="panel report-preview">
            <p className="eyebrow">PREVIEW</p>
            <div className="preview-cover">
              <span className="brand-mark">W</span>
              <small>SEO PERFORMANCE REPORT</small>
              <h2>{previewName}</h2>
              <p>
                {previewWebsite?.url || "Select client / website"} ·{" "}
                {resolved.label}
              </p>
              <p className="muted" style={{ fontSize: 10 }}>
                vs {resolved.compareFrom} → {resolved.compareTo}
              </p>
            </div>
            <ul className="preview-sections">
              {REPORT_SECTIONS.filter((s) => activeSections[s.id]).map((s) => (
                <li key={s.id}>
                  {s.label}
                  {REPORT_KPI_DEFS.some((k) => k.section === s.id)
                    ? ` · ${REPORT_KPI_DEFS.filter((k) => k.section === s.id).length} KPI charts`
                    : ""}
                  {s.phase > 1 ? " (later)" : ""}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
