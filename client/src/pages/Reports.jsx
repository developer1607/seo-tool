import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import DateBar, { useRangeQuery } from '../components/DateBar.jsx';

export default function Reports() {
  const { selectedClient } = useSession();
  const q = useRangeQuery();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!selectedClient) return;
    api(`/reports${q}`).then(setData).catch(console.error);
  }, [selectedClient, q]);

  if (!selectedClient) return <Navigate to="/clients" replace />;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <DateBar range={data.range} presets={data.presets} />
      <div className="layout-split">
        <div className="panel">
          <div className="panel-hd">
            <span>Saved reports</span>
            <span className="muted">{data.reports.length}</span>
          </div>
          {!data.reports.length ? (
            <div className="empty">No saved reports yet. Generate after data sync.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Range</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.title}</strong>
                      </td>
                      <td className="muted">
                        {r.range_from} → {r.range_to}
                      </td>
                      <td className="muted">{r.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-hd">Generate</div>
          <div className="panel-bd">
            <p className="muted">
              Uses {selectedClient.name} branding, current range, and AI summary (editable).
            </p>
            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="button" disabled>
                Generate report
              </button>
              <button className="btn btn-ghost btn-sm" type="button" disabled>
                Export PDF
              </button>
              <button className="btn btn-ghost btn-sm" type="button" disabled>
                Copy share link
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
