import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';

export default function Integrations() {
  const { selectedClient } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!selectedClient) return;
    api('/integrations').then(setData).catch(console.error);
  }, [selectedClient]);

  if (!selectedClient) return <Navigate to="/clients" replace />;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-toolbar">
        <span className="hint">
          Connect platforms for <strong>{selectedClient.name}</strong>. Tokens stay on this client only.
        </span>
      </div>
      <div className="panel">
        <div className="panel-hd">Data sources</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Platform</th>
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
                    <button className="btn btn-primary btn-sm" type="button" disabled title="OAuth next">
                      Connect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
