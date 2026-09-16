import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';

const emptyForm = {
  name: '',
  website_url: '',
  brand_primary: '#0d7a6f',
  brand_secondary: '#1e2530',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
};

export default function Clients() {
  const { clients, applySession, selectClient, refresh } = useSession();
  const [list, setList] = useState(clients || []);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setList(clients || []);
  }, [clients]);

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function startEdit(c) {
    setEditId(c.id);
    setForm({
      name: c.name,
      website_url: c.website_url,
      brand_primary: c.brand_primary,
      brand_secondary: c.brand_secondary,
      timezone: c.timezone,
      currency: c.currency,
    });
    setError('');
  }

  function cancelEdit() {
    setEditId(null);
    setForm(emptyForm);
    setError('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        const data = await api(`/clients/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        setList(data.clients);
        await refresh();
        cancelEdit();
      } else {
        const data = await api('/clients', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        applySession(data);
        setForm(emptyForm);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function onDelete(id) {
    if (!confirm('Delete this client and all connected data?')) return;
    const data = await api(`/clients/${id}`, { method: 'DELETE' });
    applySession(data);
  }

  return (
    <div className="layout-split">
      <div className="panel">
        <div className="panel-hd">
          <span>Clients</span>
          <span className="muted">{list.length}</span>
        </div>
        <div className="table-wrap">
          {!list.length ? (
            <div className="empty">Add a client to start.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Website</th>
                  <th>Brand</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td className="muted">{c.website_url}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 14,
                          height: 14,
                          borderRadius: 2,
                          background: c.brand_primary,
                          border: '1px solid var(--border)',
                          verticalAlign: 'middle',
                        }}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => selectClient(c.id)}>
                        Open
                      </button>{' '}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(c.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd">{editId ? 'Edit client' : 'Add client'}</div>
        <div className="panel-bd">
          {error && <div className="banner banner-error" style={{ marginBottom: '0.65rem' }}>{error}</div>}
          <form className="form" onSubmit={onSubmit}>
            <div className="form-grid cols-2">
              <label>
                Client name
                <input required value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </label>
              <label>
                Website URL
                <input
                  required
                  placeholder="https://"
                  value={form.website_url}
                  onChange={(e) => setField('website_url', e.target.value)}
                />
              </label>
              <label>
                Brand primary
                <input
                  type="color"
                  value={form.brand_primary}
                  onChange={(e) => setField('brand_primary', e.target.value)}
                />
              </label>
              <label>
                Brand secondary
                <input
                  type="color"
                  value={form.brand_secondary}
                  onChange={(e) => setField('brand_secondary', e.target.value)}
                />
              </label>
              <label>
                Timezone
                <input value={form.timezone} onChange={(e) => setField('timezone', e.target.value)} />
              </label>
              <label>
                Currency
                <input value={form.currency} onChange={(e) => setField('currency', e.target.value)} />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="submit">
                {editId ? 'Save' : 'Create'}
              </button>
              {editId && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
