import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './session.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Platform from './pages/Platform.jsx';
import Integrations from './pages/Integrations.jsx';
import Reports from './pages/Reports.jsx';
import Clients from './pages/Clients.jsx';
import Settings from './pages/Settings.jsx';

function Private({ children }) {
  const { user, loading } = useSession();
  if (loading) return <div className="login-page muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Private>
            <Layout />
          </Private>
        }
      >
        <Route index element={<Overview />} />
        <Route path="platforms/:key" element={<Platform />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="reports" element={<Reports />} />
        <Route path="clients" element={<Clients />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
