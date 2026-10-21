import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, saveSession } from './api';

export interface CompanySummary { id: string; name: string; currency: string; country: string; role: string }
interface SessionState {
  loading: boolean;
  user: { id: string; name: string; email: string } | null;
  companies: CompanySummary[];
  company: CompanySummary | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  selectCompany: (id: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState>(null as unknown as SessionState);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, 'login' | 'logout' | 'selectCompany' | 'refresh'>>({
    loading: true, user: null, companies: [], company: null,
  });

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setState({ loading: false, user: null, companies: [], company: null });
      return;
    }
    try {
      const me = await api.get<{ user: SessionState['user']; companies: CompanySummary[] }>('/auth/me');
      const saved = localStorage.getItem('companyId');
      const company = me.companies.find((c) => c.id === saved) ?? me.companies[0] ?? null;
      saveSession(localStorage.getItem('token'), company?.id ?? null);
      setState({ loading: false, user: me.user, companies: me.companies, company });
    } catch {
      saveSession(null, null);
      setState({ loading: false, user: null, companies: [], company: null });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value: SessionState = {
    ...state,
    refresh,
    login: async (token) => { saveSession(token); await refresh(); },
    logout: () => { saveSession(null, null); setState({ loading: false, user: null, companies: [], company: null }); },
    selectCompany: (id) => {
      saveSession(localStorage.getItem('token'), id);
      setState((s) => ({ ...s, company: s.companies.find((c) => c.id === id) ?? null }));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
