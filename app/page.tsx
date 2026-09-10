"use client";

import { useState } from "react";

const navigation = [
  { label: "Overview", icon: "◌" },
  { label: "Clients", icon: "♧", children: ["Client List", "Add Client", "Client Details"] },
  { label: "Projects", icon: "▦", children: ["Website 1", "Website 2", "Website 3"] },
  { label: "Keyword Tracking", icon: "⌁", children: ["Keywords", "Rankings", "Position Changes", "SERP Features", "Competitors"] },
  { label: "Site Audit", icon: "✓", children: ["Errors", "Warnings", "Passed", "Crawl Issues"] },
  { label: "Backlinks", icon: "↗", children: ["New", "Lost", "Referring Domains"] },
  { label: "Reports", icon: "▤", children: ["Client Reports", "Generate Report", "Schedule Report", "PDF / Email"] },
  { label: "Settings", icon: "⚙", children: ["Google Connections", "Users", "Billing", "API Settings"] },
];

const metrics = [
  { label: "Total clients", value: "24", change: "+12.5%", tone: "violet", note: "vs. last month" },
  { label: "Total websites", value: "68", change: "+8.2%", tone: "blue", note: "vs. last month" },
  { label: "Organic traffic", value: "1.24M", change: "+18.6%", tone: "orange", note: "sessions this month" },
  { label: "Total keywords", value: "12,480", change: "+4.8%", tone: "green", note: "being tracked" },
  { label: "Average position", value: "14.2", change: "-2.4", tone: "pink", note: "position improved" },
];

const projects = [
  { name: "Northstar Finance", url: "northstarfinance.com", score: 92, traffic: "184.2k", change: "+24.8%", color: "#6558d3" },
  { name: "Morrow & Co.", url: "morrowandco.com", score: 78, traffic: "96.4k", change: "+11.3%", color: "#e5854c" },
  { name: "Lumen Health", url: "lumenhealth.io", score: 84, traffic: "72.8k", change: "+8.6%", color: "#4ca88b" },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [expanded, setExpanded] = useState<string[]>(["Clients"]);

  function toggleSection(label: string) {
    setActive(label);
    setExpanded((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">s</span><span>searchly</span><small>SEO WORKSPACE</small></div>
        <div className="workspace-switcher"><span className="workspace-avatar">A</span><span><strong>Acme Agency</strong><small>Agency workspace</small></span><span className="chevron">⌄</span></div>
        <nav aria-label="Main navigation">
          <p className="nav-caption">Workspace</p>
          {navigation.map((item) => <div key={item.label} className="nav-group">
            <button className={`nav-item ${active === item.label ? "active" : ""}`} onClick={() => toggleSection(item.label)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.children && <span className="nav-arrow">{expanded.includes(item.label) ? "⌃" : "⌄"}</span>}
            </button>
            {item.children && expanded.includes(item.label) && <div className="subnav">{item.children.map((child) => <button key={child} onClick={() => setActive(child)} className={active === child ? "selected" : ""}>{child}</button>)}</div>}
          </div>)}
        </nav>
        <div className="sidebar-footer"><div className="help-icon">?</div><div><strong>Need a hand?</strong><small>Visit our help center</small></div><span>↗</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button notification" aria-label="Notifications">♢<i /></button><div className="profile"><span className="profile-avatar">JD</span><span><strong>Jordan Davis</strong><small>Admin</small></span><span>⌄</span></div></div></header>
        <div className="page-content">
          <div className="page-heading"><div><p className="eyebrow">THURSDAY, SEPTEMBER 10, 2026</p><h1>Good morning, Jordan <span>✦</span></h1><p className="muted">Here&apos;s what&apos;s happening across your SEO workspace.</p></div><div className="heading-actions"><button className="date-button">▣ <span>Aug 12 – Sep 10, 2026</span>⌄</button><button className="primary-button">＋ Add client</button></div></div>
          <section className="metric-grid">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className="metric-dots">•••</span></div><strong>{metric.value}</strong><div className="metric-bottom"><span className="trend">↗ {metric.change}</span><span>{metric.note}</span></div><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /></div></article>)}</section>
          <div className="content-grid"><section className="panel traffic-panel"><div className="panel-header"><div><h2>Organic traffic</h2><p className="muted">Sessions across all websites</p></div><button className="select-button">Last 30 days ⌄</button></div><div className="traffic-total"><strong>1,243,890</strong><span className="trend">↗ 18.6%</span></div><div className="chart"><div className="chart-y"><span>1.5M</span><span>1.0M</span><span>500K</span><span>0</span></div><div className="chart-lines"><i /><i /><i /><i /><svg viewBox="0 0 640 150" preserveAspectRatio="none"><path d="M0 124 C30 120 42 100 68 108 S106 90 132 106 S165 60 190 76 S231 83 250 60 S295 84 317 60 S346 50 370 60 S399 31 426 48 S456 38 478 51 S507 62 530 43 S554 35 570 44 S610 11 640 20" /></svg></div></div><div className="chart-x"><span>Aug 12</span><span>Aug 18</span><span>Aug 24</span><span>Aug 30</span><span>Sep 5</span><span>Sep 10</span></div></section><section className="panel audit-panel"><div className="panel-header"><div><h2>Site health</h2><p className="muted">Average health score</p></div><button className="more-button">•••</button></div><div className="health-score"><div className="score-ring"><strong>86</strong><span>/100</span></div><div><strong>Good</strong><p>Across 68 websites</p><span className="trend">↗ 4.2% this month</span></div></div><div className="health-bars"><div><span><b>Errors</b><em>24</em></span><i><b style={{ width: "14%" }} /></i></div><div><span><b>Warnings</b><em>186</em></span><i><b className="warning-bar" style={{ width: "38%" }} /></i></div><div><span><b>Passed</b><em>1,428</em></span><i><b className="passed-bar" style={{ width: "82%" }} /></i></div></div></section></div>
          <div className="content-grid lower-grid"><section className="panel project-panel"><div className="panel-header"><div><h2>Top projects</h2><p className="muted">Your best performing websites</p></div><button className="text-button">View all projects →</button></div><div className="project-table"><div className="table-heading"><span>PROJECT</span><span>HEALTH SCORE</span><span>ORGANIC TRAFFIC</span><span>CHANGE</span></div>{projects.map((project) => <div className="project-row" key={project.name}><div className="project-name"><span className="project-dot" style={{ background: project.color }} /><span><strong>{project.name}</strong><small>{project.url}</small></span></div><div className="score"><span className="score-bar"><i style={{ width: `${project.score}%`, background: project.color }} /></span><strong>{project.score}</strong></div><strong>{project.traffic}</strong><span className="trend">↗ {project.change}</span></div>)}</div></section><section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p className="muted">Latest updates from your workspace</p></div><button className="more-button">•••</button></div><div className="activity-list"><div><span className="activity-badge purple">↗</span><p><strong>Northstar Finance</strong> gained 18 new keywords<br /><small>12 minutes ago</small></p></div><div><span className="activity-badge orange">!</span><p><strong>Site audit</strong> completed for Morrow & Co.<br /><small>1 hour ago</small></p></div><div><span className="activity-badge green">＋</span><p><strong>New client added</strong> Lumen Health<br /><small>3 hours ago</small></p></div></div><button className="activity-link">View all activity →</button></section></div>
        </div>
      </main>
    </div>
  );
}
