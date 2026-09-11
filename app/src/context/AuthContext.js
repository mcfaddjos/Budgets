import { createContext, useContext, useEffect, useState } from "react";
import { api, loadPersistedSession, setToken, getServerUrl, setServerUrl } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  useEffect(() => {
    loadPersistedSession().then(async ({ serverUrl: url, token }) => {
      setServerUrlState(url);
      if (token) {
        try {
          setUser(await api.me());
        } catch (err) {
          // Only a genuine server rejection (expired/invalid token) means the
          // stored token is actually bad. A network blip or the Apps Script
          // redirect flakiness says nothing about the token's validity — in
          // that case, leave it in storage so the next launch (or a manual
          // retry) can still pick the session back up instead of forcing a
          // fresh login over what might be a perfectly good token.
          if (err.isApiError) await setToken(null);
        }
      }
      setReady(true);
    });
  }, []);

  async function updateServerUrl(url) {
    await setServerUrl(url);
    setServerUrlState(url);
  }

  async function login(username, password) {
    const result = await api.login(username, password);
    await setToken(result.token);
    setUser(result.user);
  }

  async function register(username, password, inviteCode) {
    const result = await api.register(username, password, inviteCode);
    await setToken(result.token);
    setUser(result.user);
  }

  async function logout() {
    await setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, ready, serverUrl, updateServerUrl, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
