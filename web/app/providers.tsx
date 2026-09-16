"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type Session } from "../lib/api";
import {
  loadDateRange,
  saveDateRange,
  type DateRangeState,
} from "../lib/date-range";

const empty: Session = {
  user: null,
  selectedClient: null,
  selectedWebsite: null,
  websites: [],
  clients: [],
  unreadCount: 0,
  recentNotifications: [],
  platform: null,
};

type CtxValue = Session & {
  loading: boolean;
  dateRange: DateRangeState;
  setDateRange: (next: DateRangeState) => void;
  refresh: () => Promise<Session>;
  apply: (s: Session) => void;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  selectClient: (id: number) => Promise<Session>;
  selectWebsite: (id: number) => Promise<Session>;
};

const Ctx = createContext<CtxValue>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session & { loading: boolean }>({
    ...empty,
    loading: true,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [dateRange, setDateRangeState] = useState<DateRangeState>({
    preset: "last_30",
    from: "",
    to: "",
  });

  useEffect(() => {
    setDateRangeState(loadDateRange());
  }, []);

  const setDateRange = useCallback((next: DateRangeState) => {
    setDateRangeState(next);
    saveDateRange(next);
  }, []);

  const refresh = useCallback(async () => {
    const data = await api<Session>("/session");
    setState({ ...data, loading: false });
    return data;
  }, []);

  useEffect(() => {
    refresh().catch(() => setState({ ...empty, loading: false }));
  }, [refresh]);

  const apply = useCallback((s: Session) => {
    setState({ ...s, loading: false });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<Session>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setState({ ...data, loading: false });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api("/logout", { method: "POST", body: "{}" });
    setState({ ...empty, loading: false });
  }, []);

  const selectClient = useCallback(async (id: number) => {
    const cur = stateRef.current;
    if (cur.selectedClient?.id === id) {
      return {
        user: cur.user,
        selectedClient: cur.selectedClient,
        selectedWebsite: cur.selectedWebsite,
        websites: cur.websites,
        clients: cur.clients,
        unreadCount: cur.unreadCount,
        recentNotifications: cur.recentNotifications,
        platform: cur.platform,
      };
    }
    const data = await api<Session>(`/clients/${id}/select`, {
      method: "POST",
      body: "{}",
    });
    setState({ ...data, loading: false });
    return data;
  }, []);

  const selectWebsite = useCallback(async (id: number) => {
    const cur = stateRef.current;
    if (cur.selectedWebsite?.id === id) {
      return {
        user: cur.user,
        selectedClient: cur.selectedClient,
        selectedWebsite: cur.selectedWebsite,
        websites: cur.websites,
        clients: cur.clients,
        unreadCount: cur.unreadCount,
        recentNotifications: cur.recentNotifications,
        platform: cur.platform,
      };
    }
    const data = await api<Session>(`/websites/${id}/select`, {
      method: "POST",
      body: "{}",
    });
    setState({ ...data, loading: false });
    return data;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      dateRange,
      setDateRange,
      refresh,
      apply,
      login,
      logout,
      selectClient,
      selectWebsite,
    }),
    [
      state,
      dateRange,
      setDateRange,
      refresh,
      apply,
      login,
      logout,
      selectClient,
      selectWebsite,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
