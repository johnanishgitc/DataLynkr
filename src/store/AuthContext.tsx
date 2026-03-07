import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setAuthHandlers } from '../api';
import {
  getAuthToken,
  isLoggedIn,
  logoutStorage,
  setAuthToken,
  setUserEmail,
  setUserName,
  getUserName,
  getUserEmail,
} from './storage';
import { refreshAllDataManagementData } from '../cache';

type AuthState = {
  isLoggedIn: boolean;
  token: string | null;
  userName: string | null;
  userEmail: string | null;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  login: (token: string, userName?: string | null, userEmail?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const defaultState: AuthState = {
  isLoggedIn: false,
  token: null,
  userName: null,
  userEmail: null,
  ready: false,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<AuthState>(defaultState);

  const refresh = useCallback(async () => {
    const loggedIn = await isLoggedIn();
    const token = await getAuthToken();
    let userName: string | null = null;
    let userEmail: string | null = null;
    if (loggedIn && token) {
      userName = await getUserName();
      userEmail = await getUserEmail();
    }
    setS({
      isLoggedIn: !!(loggedIn && token),
      token: token ?? null,
      userName,
      userEmail,
      ready: true,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (token: string, userName?: string | null, userEmail?: string | null) => {
      await setAuthToken(token);
      if (userName != null) await setUserName(userName);
      if (userEmail != null) await setUserEmail(userEmail);
      await refresh();
      // Reload customers, stock items, and stock groups in Data Management in background
      refreshAllDataManagementData().catch(() => {});
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    await logoutStorage();
    setS((prev) => ({ ...prev, isLoggedIn: false, token: null, userName: null, userEmail: null }));
  }, []);

  useEffect(() => {
    setAuthHandlers(getAuthToken, () => {
      logout();
    });
  }, [logout]);

  const value: AuthContextValue = {
    ...s,
    login,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
