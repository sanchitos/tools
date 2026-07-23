import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ProfileDTO } from '@tools-jamaica/shared';
import { api, ApiError } from '../lib/api.js';

interface AuthState {
  user: ProfileDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ProfileDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Admin session state. Restores the session on load via /auth/me (which will
 * transparently refresh from the cookie if the access token has expired). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const profile = await api.login(email, password);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
