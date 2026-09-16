import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import DateBar, { useRangeQuery } from '../components/DateBar.jsx';

export default function Platform() {
  const { key } = useParams();
  const { selectedClient } = useSession();
  const q = useRangeQuery();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedClient) return;
    setData(null);
    api(`/platforms/${key}${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [selectedClient, key, q]);

  if (!selectedClient) return <Navigate to="/clients" replace />;
  if (error) return <div className="banner banner-error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const status = data.status;

  return (
    <>
      <DateBar range={data.range} presets={data.presets} />
      <div className="page-toolbar">
        <span className="hint">
          {selectedClient.name} · {data.title}
        </span>
        {status && status.status !== 'ACTIVE' && (
          <Link className="btn btn-primary btn-sm" to="/integrations">
            Connect {data.title}
          </Link>
        )}
      </div>
      {status && (status.status === 'ERROR' || status.status === 'NEEDS_REAUTH') && (
        <div className="banner banner-error">
          {data.title} unavailable{status.last_error ? `: ${status.last_error}` : ''}. Other platforms still
          load.
        </div>
      )}
      <div className="kpi-strip">
        <div className="kpi">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: '0.85rem', fontFamily: 'var(--font)' }}>
            {status ? status.status.replace(/_/g, ' ') : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Clicks</div>
          <div className="value">{data.kpis.clicks}</div>
        </div>
        <div className="kpi">
          <div className="label">Impressions</div>
          <div className="value">{data.kpis.impressions}</div>
        </div>
        <div className="kpi">
          <div className="label">Spend</div>
          <div className="value">{Number(data.kpis.spend).toFixed(0)}</div>
        </div>
        <div className="kpi">
          <div className="label">Conversions</div>
          <div className="value">{data.kpis.primary_conversions}</div>
        </div>
        <div className="kpi">
          <div className="label">Sessions</div>
          <div className="value">{data.kpis.sessions}</div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-hd">
          <span>Detail table</span>
          <span className="muted">Column customize later</span>
        </div>
        <div className="empty">No rows for this range yet. Connect + sync in Integrations.</div>
      </div>
      <div className="panel">
        <div className="panel-hd">Trend</div>
        <div className="panel-bd">
          <p className="muted" style={{ margin: 0 }}>
            Chart series after first sync.
          </p>
        </div>
      </div>
    </>
  );
}
