import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';

const NAV = [
  { to: '/', end: true, label: 'Overview' },
  { to: '/platforms/google-ads', label: 'Google Ads' },
  { to: '/platforms/meta', label: 'Meta Ads' },
  { to: '/platforms/ga4', label: 'GA4' },
  { to: '/platforms/gsc', label: 'Search Console' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/reports', label: 'Reports' },
  { to: '/clients', label: 'Clients' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const {
    user,
    selectedClient,
    clients,
    unreadCount,
    recentNotifications,
    logout,
    selectClient,
    applySession,
  } = useSession();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!selectedClient) return;
    const root = document.documentElement;
    root.style.setProperty('--brand', selectedClient.brand_primary || '#0d7a6f');
  }, [selectedClient]);

  useEffect(() => {
    function onDoc(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function onClientChange(id) {
    if (!id) {
      navigate('/clients');
      return;
    }
    await selectClient(id);
  }

  async function markRead(id) {
    const data = await api(`/notifications/${id}/read`, { method: 'POST', body: '{}' });
    applySession(data);
  }

  async function markAll() {
    const data = await api('/notifications/read-all', { method: 'POST', body: '{}' });
    applySession(data);
  }

  return (
    <div className="shell">
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} id="sidebar">
        <NavLink className="brand" to="/">
          Astralytics AI
        </NavLink>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user?.name}
          <br />
          Admin
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <button
              type="button"
              className="menu-toggle"
              aria-label="Menu"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              Menu
            </button>
            <h1>Dashboard</h1>
          </div>
          <div className="topbar-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <label className="muted" style={{ fontSize: '0.75rem', fontWeight: 650 }}>
                Client
              </label>
              <select
                aria-label="Switch client"
                value={selectedClient?.id || ''}
                onChange={(e) => onClientChange(e.target.value)}
                style={{
                  minHeight: 32,
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '0.2rem 0.4rem',
                  background: '#fff',
                  font: 'inherit',
                }}
              >
                <option value="">Select…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedClient && (
              <span
                className="muted"
                style={{
                  maxWidth: 140,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={selectedClient.website_url}
              >
                {selectedClient.website_url}
              </span>
            )}

            <div className={`notif-wrap${notifOpen ? ' is-open' : ''}`} ref={notifRef}>
              <button
                type="button"
                className="bell"
                aria-label="Notifications"
                aria-expanded={notifOpen}
                title="Notifications"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotifOpen((v) => !v);
                }}
              >
                <svg className="bell-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                </svg>
                {unreadCount > 0 && <span className="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div className="notif-panel" role="dialog" aria-label="Notifications">
                  <div className="notif-panel-hd">
                    <strong>Notifications</strong>
                    {unreadCount > 0 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notif-panel-list">
                    {!recentNotifications?.length ? (
                      <div className="notif-empty">No notifications</div>
                    ) : (
                      recentNotifications.map((n) => (
                        <div key={n.id} className={`notif-row${n.read_at ? '' : ' is-unread'}`}>
                          <div className="notif-row-main">
                            <div className="notif-title">{n.title}</div>
                            {n.body && <div className="notif-body">{n.body}</div>}
                            <div className="notif-meta">
                              <span className="pill pill-muted">{n.layer}</span>
                              <span>{n.created_at}</span>
                            </div>
                            {n.href && (
                              <a className="notif-link" href={n.href} onClick={() => setNotifOpen(false)}>
                                Open
                              </a>
                            )}
                          </div>
                          {!n.read_at && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Mark read"
                              onClick={() => markRead(n.id)}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout().then(() => navigate('/login'))}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
