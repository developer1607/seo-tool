"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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
  defaultChartTypes,
  kpisForEnabledSections,
  type ChartType,
} from "../../../lib/report-kpis";
import {
  DEFAULT_PRESETS,
  previewResolveRange,
} from "../../../lib/date-range";

export default function GenerateReportPage() {
  const router = useRouter();
  const { clients, selectedClient, selectedWebsite, selectClient } =
    useSession();
  const [clientId, setClientId] = useState(
    String(selectedClient?.id || clients[0]?.id || "")
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
  const [chartTypes, setChartTypes] = useState<Record<string, ChartType>>(
    defaultChartTypes()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previewName = useMemo(() => {
    const c = clients.find((x) => String(x.id) === clientId);
    const raw = c?.name || selectedClient?.name || "Client";
    return raw.split(/\s+[—–-]\s+/)[0] || raw;
  }, [clients, clientId, selectedClient]);

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
    if (preset === "custom" && (!from || !to)) {
      setError("Pick From and To for a custom period");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await selectClient(Number(clientId));
      const data = await api<{ report: { id: number } }>("/reports", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || `${previewName} SEO report`,
          preset,
          from: preset === "custom" ? from : undefined,
          to: preset === "custom" ? to : undefined,
          use_overview_defaults: useOverviewDefaults,
          sections: activeSections,
          chart_types: chartTypes,
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
        {!selectedWebsite && clientId && (
          <div className="banner-error" style={{ marginBottom: 12 }}>
            This client needs a website selected in the top bar after you pick
            them.
          </div>
        )}
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
                    onChange={(e) => {
                      setClientId(e.target.value);
                      const c = clients.find(
                        (x) => String(x.id) === e.target.value
                      );
                      if (c) {
                        const short =
                          c.name.split(/\s+[—–-]\s+/)[0] || c.name;
                        setTitle(`${short} SEO report`);
                      }
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
              <h2>Chart type for each KPI</h2>
              <p className="muted">
                Every metric below gets a scorecard and a chart in the PDF.
                Change the chart style per KPI.
              </p>
              <div className="report-chart-type-grid">
                {chartKpis.map((k) => (
                  <label key={k.key} className="report-chart-type-row">
                    <span>
                      <strong>{k.label}</strong>
                      <small>
                        {REPORT_SECTIONS.find((s) => s.id === k.section)?.label}
                      </small>
                    </span>
                    <select
                      value={chartTypes[k.key] || k.defaultChart}
                      onChange={(e) =>
                        setChartTypes((prev) => ({
                          ...prev,
                          [k.key]: e.target.value as ChartType,
                        }))
                      }
                    >
                      {k.charts.map((c) => (
                        <option key={c} value={c}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {!chartKpis.length ? (
                  <p className="muted">Enable a data section to configure charts.</p>
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
                {selectedWebsite?.url || "Select client / website"} ·{" "}
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
