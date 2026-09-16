import { useSession } from '../session.jsx';

export default function Settings() {
  const { user, platform } = useSession();

  return (
    <div className="layout-split">
      <div className="panel">
        <div className="panel-hd">Admin</div>
        <div className="panel-bd">
          <table className="table">
            <tbody>
              <tr>
                <th style={{ width: 120 }}>Name</th>
                <td>{user?.name}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{user?.email}</td>
              </tr>
              <tr>
                <th>Role</th>
                <td>ADMIN</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-hd">Platform OAuth apps</div>
        <div className="panel-bd">
          <table className="table">
            <tbody>
              <tr>
                <th style={{ width: 120 }}>Google</th>
                <td>
                  <span className={`pill ${platform?.google ? 'pill-ok' : 'pill-warn'}`}>
                    {platform?.google ? 'Configured' : 'Missing env'}
                  </span>
                </td>
              </tr>
              <tr>
                <th>Meta</th>
                <td>
                  <span className={`pill ${platform?.meta ? 'pill-ok' : 'pill-warn'}`}>
                    {platform?.meta ? 'Configured' : 'Missing env'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: '0.65rem' }}>
            One Google/Meta app in .env. Per-client tokens on Connections.
          </p>
        </div>
      </div>
    </div>
  );
}
