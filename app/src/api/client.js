import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_URL_KEY = "budgets:serverUrl";
const TOKEN_KEY = "budgets:token";

// Placeholder — replace with your computer's LAN IP (e.g. http://192.168.1.42:4000)
// so a phone on the same Wi-Fi can reach the backend. "localhost" on the phone
// means the phone itself, not your dev machine.
const DEFAULT_SERVER_URL = "http://192.168.1.100:4000";

let serverUrl = DEFAULT_SERVER_URL;
let token = null;

export async function loadPersistedSession() {
  const [storedUrl, storedToken] = await Promise.all([
    AsyncStorage.getItem(SERVER_URL_KEY),
    AsyncStorage.getItem(TOKEN_KEY),
  ]);
  if (storedUrl) serverUrl = storedUrl;
  if (storedToken) token = storedToken;
  return { serverUrl, token };
}

export async function setServerUrl(url) {
  serverUrl = url.replace(/\/+$/, "");
  await AsyncStorage.setItem(SERVER_URL_KEY, serverUrl);
}

export function getServerUrl() {
  return serverUrl;
}

export async function setToken(newToken) {
  token = newToken;
  if (newToken) await AsyncStorage.setItem(TOKEN_KEY, newToken);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return token;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${serverUrl}/api${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  register: (username, password) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  getAccounts: () => request("/accounts"),
  createAccount: (account) =>
    request("/accounts", { method: "POST", body: JSON.stringify(account) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: "DELETE" }),

  getCategories: () => request("/categories"),

  importStatement: (accountId, file) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: "text/csv" });
    return request(`/accounts/${accountId}/import`, { method: "POST", body: formData });
  },

  getTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/transactions${qs ? `?${qs}` : ""}`);
  },
  updateTransaction: (id, updates) =>
    request(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),

  getBudgets: (month) => request(`/budgets?month=${month}`),
  setBudget: (categoryId, month, amount) =>
    request("/budgets", { method: "PUT", body: JSON.stringify({ categoryId, month, amount }) }),
};
