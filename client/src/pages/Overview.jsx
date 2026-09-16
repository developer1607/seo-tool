import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import DateBar, { delta, fmtDelta, useRangeQuery } from '../components/DateBar.jsx';

export default function Overview() {
  const { selectedClient } = useSession();
  const q = useRangeQuery();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedClient) return;
    setError('');
    api(`/overview${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [selectedClient, q]);

  if (!selectedClient) return <Navigate to="/clients" replace />;
  if (error) return <div className="banner banner-error">{error}</div>;
  if (!data) return <p className="muted">Loading overview…</p>;

  const items = [
    { label: 'Organic clicks', cur: data.kpis.organic_clicks, prev: data.compare.organic_clicks },
    { label: 'Sessions', cur: data.kpis.sessions, prev: data.compare.sessions },
    { label: 'Ad spend', cur: data.kpis.spend, prev: data.compare.spend },
    { label: 'Clicks', cur: data.kpis.clicks, prev: data.compare.clicks },
    { label: 'Conversions', cur: data.kpis.primary_conversions, prev: data.compare.primary_conversions },
  ];

  return (
    <>
      <DateBar range={data.range} presets={data.presets} />
      <div className="kpi-strip">
        {items.map((it) => {
          const d = delta(it.cur, it.prev);
          return (
            <div className="kpi" key={it.label}>
              <div className="label">{it.label}</div>
              <div className="value">
                {typeof it.cur === 'number' && !Number.isInteger(it.cur) ? Number(it.cur).toFixed(0) : it.cur}
              </div>
              <div
                className="sub"
                style={{ color: d.up ? 'var(--success)' : d.down ? 'var(--danger)' : 'var(--muted)' }}
              >
                {fmtDelta(d)} vs prior
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-hd">Platform status</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Account</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.platforms.map((p) => (
                <tr key={p.key}>
                  <td>
                    <strong>{p.label}</strong>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        p.status === 'ACTIVE'
                          ? 'pill-ok'
                          : p.status === 'ERROR' || p.status === 'NEEDS_REAUTH'
                            ? 'pill-err'
                            : 'pill-muted'
                      }`}
                    >
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="muted">{p.account_name || '—'}</td>
                  <td className="muted">{p.last_sync_at || '—'}</td>
                  <td>
                    {p.status !== 'ACTIVE' && (
                      <Link className="btn btn-ghost btn-sm" to="/integrations">
                        Connect
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted">KPIs fill after Integrations sync for {selectedClient.name}.</p>
    </>
  );
}
