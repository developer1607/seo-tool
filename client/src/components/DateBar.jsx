import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function DateBar({ range, presets = [] }) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(
    () => ({
      preset: params.get('preset') || range?.preset || 'last_30',
      from: params.get('from') || range?.from || '',
      to: params.get('to') || range?.to || '',
    }),
    [params, range]
  );

  function apply(next) {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v) p.set(k, v);
      else p.delete(k);
    });
    setParams(p);
  }

  return (
    <form
      className="panel"
      style={{ margin: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        apply({
          preset: 'custom',
          from: fd.get('from'),
          to: fd.get('to'),
        });
      }}
    >
      <div className="panel-bd" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'end' }}>
        <label className="field" style={{ minWidth: 140 }}>
          Range
          <select
            name="preset"
            value={values.preset}
            onChange={(e) => apply({ preset: e.target.value, from: '', to: '' })}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input type="date" name="from" defaultValue={values.from} key={values.from} />
        </label>
        <label className="field">
          To
          <input type="date" name="to" defaultValue={values.to} key={values.to} />
        </label>
        <button className="btn btn-primary btn-sm" type="submit">
          Apply
        </button>
        {range && (
          <span className="muted">
            vs {range.compareFrom} → {range.compareTo}
          </span>
        )}
      </div>
    </form>
  );
}

export function useRangeQuery() {
  const [params] = useSearchParams();
  const q = new URLSearchParams();
  ['preset', 'from', 'to'].forEach((k) => {
    const v = params.get(k);
    if (v) q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function delta(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  const abs = c - p;
  let pct = null;
  if (p !== 0) pct = (abs / Math.abs(p)) * 100;
  else if (c !== 0) pct = 100;
  return { abs, pct, up: abs > 0, down: abs < 0 };
}

export function fmtDelta(d) {
  if (d.pct === null) return '—';
  const sign = d.abs > 0 ? '+' : '';
  return `${sign}${d.pct.toFixed(1)}%`;
}
