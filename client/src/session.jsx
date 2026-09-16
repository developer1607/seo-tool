import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    user: null,
    selectedClient: null,
    clients: [],
    unreadCount: 0,
    recentNotifications: [],
    platform: null,
  });

  const refresh = useCallback(async () => {
    const data = await api('/session');
    setState((s) => ({ ...s, loading: false, ...data }));
    return data;
  }, []);

  useEffect(() => {
    refresh().catch(() => setState((s) => ({ ...s, loading: false, user: null })));
  }, [refresh]);

  const applySession = (data) => {
    setState((s) => ({ ...s, loading: false, ...data }));
  };

  const login = async (email, password) => {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    applySession(data);
    return data;
  };

  const logout = async () => {
    await api('/logout', { method: 'POST', body: '{}' });
    setState({
      loading: false,
      user: null,
      selectedClient: null,
      clients: [],
      unreadCount: 0,
      recentNotifications: [],
      platform: null,
    });
  };

  const selectClient = async (id) => {
    const data = await api(`/clients/${id}/select`, { method: 'POST', body: '{}' });
    applySession(data);
    return data;
  };

  const value = {
    ...state,
    refresh,
    applySession,
    login,
    logout,
    selectClient,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
