"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Session } from "../../lib/api";
import { useSession } from "../providers";
import ClientWebsiteSwitcher from "./client-website-switcher";

type NavChild = { label: string; href: string };
type NavItem = {
  label: string;
  href: string;
  icon: string;
  soon?: boolean;
  children?: NavChild[];
};
type NavSection = { caption: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    caption: "Agency",
    items: [
      { label: "Agency dashboard", href: "/agency", icon: "▦" },
      {
        label: "Clients",
        href: "/clients",
        icon: "♧",
        children: [
          { label: "Client List", href: "/clients" },
          { label: "Add Client", href: "/clients/new" },
        ],
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "⚙",
        children: [{ label: "Account & apps", href: "/settings" }],
      },
    ],
  },
  {
    caption: "Setup",
    items: [
      { label: "Integrations", href: "/integrations", icon: "⛓" },
      {
        label: "Reports",
        href: "/reports",
        icon: "▤",
        children: [
          { label: "Client Reports", href: "/reports" },
          { label: "Generate Report", href: "/reports/generate" },
        ],
      },
    ],
  },
  {
    caption: "Performance",
    items: [
      { label: "Overview", href: "/", icon: "◌" },
      { label: "Google Ads", href: "/platforms/google-ads", icon: "▣" },
      { label: "Meta Ads", href: "/platforms/meta", icon: "◈" },
      { label: "GA4", href: "/platforms/ga4", icon: "◎" },
      { label: "Search Console", href: "/platforms/gsc", icon: "⌕" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/agency") return pathname === "/agency" || pathname.startsWith("/agency/");
  if (href === "/integrations") {
    return (
      pathname.startsWith("/integrations") ||
      pathname.startsWith("/google-accounts")
    );
  }
  if (href === "/clients") {
    return pathname.startsWith("/clients");
  }
  return pathname.startsWith(href);
}

/** Client + website + Sync only where page work is scoped to a client/site. */
function needsClientWebsiteChrome(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/platforms/")) return true;
  if (pathname.startsWith("/reports")) return true;
  if (
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/google-accounts")
  ) {
    return true;
  }
  // /clients/123 or /clients/123/add-website — not list or /clients/new
  if (/^\/clients\/\d+/.test(pathname)) return true;
  return false;
}

function findActiveItem(pathname: string): NavItem | undefined {
  for (const section of navSections) {
    const hit = section.items.find((item) => isActive(pathname, item.href));
    if (hit) return hit;
  }
  return undefined;
}

const DATA_PROVIDERS = [
  "GOOGLE_ANALYTICS",
  "GOOGLE_SEARCH_CONSOLE",
  "GOOGLE_ADS",
  "META_ADS",
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ANALYTICS: "GA4",
  GOOGLE_SEARCH_CONSOLE: "GSC",
  GOOGLE_ADS: "Ads",
  META_ADS: "Meta",
};

type StaleSyncResult = {
  ok?: boolean;
  synced?: { provider: string; days?: number }[];
  skipped?: { provider: string; reason?: string }[];
  failed?: { provider: string; error?: string; reason?: string }[];
  fresh?: { provider: string }[];
};

const visitSyncInflight = new Map<string, Promise<StaleSyncResult>>();

function staleSyncProvidersForPath(pathname: string): string[] | null {
  if (pathname === "/") return [...DATA_PROVIDERS];
  if (pathname === "/platforms/ga4") return ["GOOGLE_ANALYTICS"];
  if (pathname === "/platforms/gsc") return ["GOOGLE_SEARCH_CONSOLE"];
  if (pathname === "/platforms/google-ads") return ["GOOGLE_ADS"];
  if (pathname === "/platforms/meta") return ["META_ADS"];
  return null;
}

function requestVisitSync(websiteId: number, providers: string[]) {
  const key = `${websiteId}:${providers.slice().sort().join(",")}`;
  const existing = visitSyncInflight.get(key);
  if (existing) return existing;
  const pending = api<StaleSyncResult>("/integrations/sync-stale", {
    method: "POST",
    body: JSON.stringify({ website_id: websiteId, providers }),
  }).finally(() => {
    visitSyncInflight.delete(key);
  });
  visitSyncInflight.set(key, pending);
  return pending;
}

export default function AdminShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    loading,
    selectedClient,
    selectedWebsite,
    websites,
    clients,
    unreadCount,
    recentNotifications,
    platform,
    logout,
    selectClient,
    selectWebsite,
    apply,
    refresh,
  } = useSession();
  const [notifOpen, setNotifOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [visitBusy, setVisitBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const showClientChrome = needsClientWebsiteChrome(pathname);
  const activeItem = findActiveItem(pathname);
  const googleLinked = Boolean(platform?.agencyGoogle?.linked);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user?.id || !selectedWebsite?.id) return;
    const wanted = staleSyncProvidersForPath(pathname);
    if (!wanted) return;
    const providers = platform?.meta
      ? wanted
      : wanted.filter((p) => p !== "META_ADS");
    if (!providers.length) return;

    let cancelled = false;
    let slowTimer: number | undefined;
    slowTimer = window.setTimeout(() => {
      if (!cancelled) setVisitBusy(true);
    }, 800);

    requestVisitSync(selectedWebsite.id, providers)
      .then(async (d) => {
        if (cancelled) return;
        const synced = d.synced || [];
        const failed = d.failed || [];
        if (synced.length || failed.length) {
          await refresh();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("webastral:synced"));
          }
        }
        if (cancelled) return;
        const parts: string[] = [];
        if (synced.length) {
          parts.push(
            `Updated ${synced
              .map((s) => PROVIDER_LABELS[s.provider] || s.provider)
              .join(" · ")}`
          );
        }
        if (failed.length) {
          parts.push(
            failed
              .map((f) => {
                const label = PROVIDER_LABELS[f.provider] || f.provider;
                if (f.reason === "needs_reauth") {
                  return `${label}: reconnect Google`;
                }
                return `${label}: ${f.error || "sync failed"}`;
              })
              .join("; ")
          );
        }
        if (parts.length) {
          setSyncNote(parts.join(" "));
          window.setTimeout(() => setSyncNote(""), 8000);
        }
      })
      .catch(() => {
        /* keep cached snapshots; header Sync remains available */
      })
      .finally(() => {
        if (slowTimer) window.clearTimeout(slowTimer);
        if (!cancelled) setVisitBusy(false);
      });

    return () => {
      cancelled = true;
      if (slowTimer) window.clearTimeout(slowTimer);
    };
  }, [user?.id, pathname, selectedWebsite?.id, platform?.meta, refresh]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  if (loading) {
    return (
      <div className="dashboard-shell">
        <main className="main-content">
          <div className="page-content muted">Loading…</div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  async function markRead(id: number) {
    const data = await api<Session>(`/notifications/${id}/read`, {
      method: "POST",
      body: "{}",
    });
    apply(data);
  }

  async function markAll() {
    const data = await api<Session>(`/notifications/read-all`, {
      method: "POST",
      body: "{}",
    });
    apply(data);
  }

  async function syncSelectedWebsite() {
    if (!selectedWebsite || syncBusy) return;
    setSyncBusy(true);
    setSyncNote("");
    const providers = [
      "GOOGLE_ANALYTICS",
      "GOOGLE_SEARCH_CONSOLE",
      "GOOGLE_ADS",
      ...(platform?.meta ? (["META_ADS"] as const) : []),
    ] as const;
    const ok: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];
    try {
      for (const provider of providers) {
        try {
          const d = await api<{ days?: number }>(
            `/integrations/${provider}/sync`,
            {
              method: "POST",
              body: JSON.stringify({ website_id: selectedWebsite.id }),
            }
          );
          ok.push(
            d.days != null
              ? `${PROVIDER_LABELS[provider]} (${d.days}d)`
              : PROVIDER_LABELS[provider]
          );
        } catch (e) {
          const msg = (e as Error).message || "";
          if (/not active/i.test(msg)) {
            skipped.push(PROVIDER_LABELS[provider]);
            continue;
          }
          if (/expired|revoked|reauth|reconnect/i.test(msg)) {
            failed.push(`${PROVIDER_LABELS[provider]}: reconnect Google`);
            continue;
          }
          failed.push(`${PROVIDER_LABELS[provider]}: ${msg}`);
        }
      }
      await refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webastral:synced"));
      }
      const parts: string[] = [];
      if (ok.length) parts.push(`Synced ${ok.join(" · ")}`);
      if (failed.length) parts.push(failed.join("; "));
      if (!ok.length && !failed.length && skipped.length) {
        parts.push(
          "Nothing active to sync — connect or reconnect on Integrations."
        );
      } else if (skipped.length && failed.some((f) => /reconnect/i.test(f))) {
        parts.push("Open Integrations → Reconnect Google.");
      }
      setSyncNote(parts.join(" ") || "Sync finished.");
    } catch (e) {
      setSyncNote((e as Error).message || "Sync failed");
    } finally {
      setSyncBusy(false);
      window.setTimeout(() => setSyncNote(""), 8000);
    }
  }

  return (
    <div
      className={`dashboard-shell${mobileNavOpen ? " mobile-nav-open" : ""}`}
    >
      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-scrim"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside className="sidebar" id="mobile-nav-drawer">
        <Link className="brand" href="/">
          <span className="brand-mark">W</span>
          <span>Webastral</span>
          <small>MARKETING REPORTS</small>
        </Link>
        <nav aria-label="Main navigation">
          {navSections.map((section) => (
            <div key={section.caption} className="nav-section">
              <p className="nav-caption">{section.caption}</p>
              {section.items.map((item) => (
                <div key={item.label} className="nav-group">
                  <Link
                    href={item.href}
                    className={`nav-item ${isActive(pathname, item.href) ? "active" : ""}`}
                    aria-label={item.label}
                    title={
                      item.soon ? `${item.label} — not wired yet` : item.label
                    }
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>
                      {item.label}
                      {item.soon ? " · soon" : ""}
                    </span>
                    {item.children && <span className="nav-arrow">⌄</span>}
                  </Link>
                  {item.children &&
                    (isActive(pathname, item.href) || mobileNavOpen) && (
                    <div className="subnav">
                      {item.children.map((child) => (
                        <Link
                          href={child.href}
                          key={child.label}
                          className={
                            pathname === child.href ? "selected" : ""
                          }
                          onClick={() => setMobileNavOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="help-icon">?</div>
          <div>
            <strong>
              {googleLinked ? "Google data linked" : "Google data"}
            </strong>
            <small>
              {googleLinked ? (
                <Link href="/integrations?tab=accounts&view=google">Manage in Integrations</Link>
              ) : (
                <Link href="/integrations">Connect in Integrations</Link>
              )}
            </small>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              {mobileNavOpen ? "✕" : "☰"}
            </button>
            Workspace <span>/</span>{" "}
            <strong>{title || activeItem?.label || "Overview"}</strong>
          </div>
          <div className="top-actions">
            {showClientChrome ? (
              <>
                <ClientWebsiteSwitcher
                  clients={clients}
                  selectedClient={selectedClient}
                  websites={websites}
                  selectedWebsite={selectedWebsite}
                  selectClient={selectClient}
                  selectWebsite={selectWebsite}
                />
                <button
                  type="button"
                  className="secondary-button topbar-sync-btn"
                  disabled={!selectedWebsite || syncBusy}
                  title={
                    !selectedWebsite
                      ? "Select a website to sync"
                      : visitBusy
                        ? `Refreshing stale sources for ${selectedWebsite.name}`
                        : `Sync GA4, Search Console, Ads, and Meta for ${selectedWebsite.name}`
                  }
                  onClick={() => {
                    syncSelectedWebsite().catch(() => undefined);
                  }}
                >
                  {syncBusy ? "Syncing…" : visitBusy ? "Refreshing…" : "Sync"}
                </button>
                {syncNote ? (
                  <span className="topbar-sync-note" title={syncNote}>
                    {syncNote}
                  </span>
                ) : null}
              </>
            ) : null}
            <div className="notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="icon-button notification"
                aria-label="Notifications"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotifOpen((v) => !v);
                }}
              >
                ♢
                {unreadCount > 0 && <i />}
              </button>
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-hd">
                    <strong>Notifications</strong>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={markAll}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {!recentNotifications?.length ? (
                    <div className="notif-empty">No notifications</div>
                  ) : (
                    recentNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${n.read_at ? "" : "unread"}`}
                      >
                        <div>
                          <strong>{n.title}</strong>
                          {n.body && <p>{n.body}</p>}
                          <small>{n.created_at}</small>
                        </div>
                        {!n.read_at && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => markRead(n.id)}
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="profile">
              <span className="profile-avatar">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{user.name}</strong>
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => logout().then(() => router.push("/login"))}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow = "Webastral",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
