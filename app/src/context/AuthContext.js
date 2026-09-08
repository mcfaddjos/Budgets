import { createContext, useContext, useEffect, useState } from "react";
import { api, loadPersistedSession, setToken, getServerUrl, setServerUrl } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  useEffect(() => {
    loadPersistedSession().then(({ serverUrl: url }) => {
      setServerUrlState(url);
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

  async function register(username, password) {
    const result = await api.register(username, password);
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
