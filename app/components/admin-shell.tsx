"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { label: "Overview", href: "/", icon: "◌" },
  { label: "Clients", href: "/clients", icon: "♧", children: [{ label: "Client List", href: "/clients" }, { label: "Add Client", href: "/clients/new" }] },
  { label: "Projects", href: "/projects", icon: "▦" },
  { label: "Keyword Tracking", href: "/keyword-tracking", icon: "⌁", children: [{ label: "Keywords", href: "/keyword-tracking" }, { label: "Rankings", href: "/keyword-tracking/rankings" }, { label: "Position Changes", href: "/keyword-tracking/position-changes" }, { label: "SERP Features", href: "/keyword-tracking/serp-features" }, { label: "Competitors", href: "/keyword-tracking/competitors" }] },
  { label: "Site Audit", href: "/site-audit", icon: "✓", children: [{ label: "Errors", href: "/site-audit/errors" }, { label: "Warnings", href: "/site-audit/warnings" }, { label: "Passed", href: "/site-audit/passed" }, { label: "Crawl Issues", href: "/site-audit/crawl-issues" }] },
  { label: "Backlinks", href: "/backlinks", icon: "↗", children: [{ label: "New", href: "/backlinks/new" }, { label: "Lost", href: "/backlinks/lost" }, { label: "Referring Domains", href: "/backlinks/referring-domains" }] },
  { label: "Reports", href: "/reports", icon: "▤", children: [{ label: "Client Reports", href: "/reports" }, { label: "Generate Report", href: "/reports/generate" }, { label: "Schedule Report", href: "/reports/schedule" }, { label: "PDF / Email", href: "/reports/delivery" }] },
  { label: "Settings", href: "/settings", icon: "⚙", children: [{ label: "Google Connections", href: "/settings/google" }, { label: "Users", href: "/settings/users" }, { label: "Billing", href: "/settings/billing" }, { label: "API Settings", href: "/settings/api" }] },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function AdminShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const activeItem = navigation.find((item) => isActive(pathname, item.href));
  const activeChild = pathname === "/clients/new" ? "Add Client" : pathname.includes("/clients/") ? "Client Details" : "";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Link className="brand" href="/"><span className="brand-mark">s</span><span>searchly</span><small>SEO WORKSPACE</small></Link>
        <div className="workspace-switcher"><span className="workspace-avatar">A</span><span><strong>Acme Agency</strong><small>Agency workspace</small></span><span className="chevron">⌄</span></div>
        <nav aria-label="Main navigation">
          <p className="nav-caption">Workspace</p>
          {navigation.map((item) => <div key={item.label} className="nav-group">
            <Link href={item.href} className={`nav-item ${isActive(pathname, item.href) ? "active" : ""}`}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.children && <span className="nav-arrow">⌄</span>}</Link>
            {item.children && isActive(pathname, item.href) && <div className="subnav">{item.children.map((child) => <Link href={child.href} key={child.label} className={pathname === child.href ? "selected" : ""}>{child.label}</Link>)}{item.label === "Clients" && <Link href="/clients/acme-corp" className={activeChild === "Client Details" ? "selected" : ""}>Client Details</Link>}</div>}
          </div>)}
        </nav>
        <div className="sidebar-footer"><div className="help-icon">?</div><div><strong>Need a hand?</strong><small>Visit our help center</small></div><span>↗</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{title || activeItem?.label || "Overview"}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button notification" aria-label="Notifications">♢<i /></button><div className="profile"><span className="profile-avatar">JD</span><span><strong>Jordan Davis</strong><small>Admin</small></span><span>⌄</span></div></div></header>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow = "SEO WORKSPACE", title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}
