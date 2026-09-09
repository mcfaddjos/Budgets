import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

const SERVER_URL_KEY = "budgets:serverUrl";
const TOKEN_KEY = "budgets:token";

// Placeholder — replace with your Apps Script Web App's /exec URL, from
// Deploy > Manage deployments in the Apps Script editor (or `clasp deploy`).
const DEFAULT_SERVER_URL = "https://script.google.com/macros/s/REPLACE_ME/exec";

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

/**
 * Every call — reads included — goes through this one action envelope,
 * since an Apps Script Web App only routes on doGet/doPost, not REST
 * paths/verbs. Content-Type is deliberately text/plain: a browser (Expo
 * web) would otherwise CORS-preflight a JSON POST, which Apps Script Web
 * Apps don't handle; Apps Script reads the raw body regardless of the
 * declared type, and native fetch (iOS/Android) isn't CORS-restricted anyway.
 */
async function call(action, payload) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token, payload }),
  });

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Unexpected response from server: ${text.slice(0, 200)}`);
  }

  if (!result || !result.ok) {
    throw new Error((result && result.error) || `Request failed (${response.status})`);
  }
  return result.data;
}

/** Native: read via expo-file-system. Web: DocumentPicker's asset carries a real browser File. */
async function readFileAsText(file) {
  if (file.file && typeof file.file.text === "function") {
    return file.file.text();
  }
  return FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export const api = {
  register: (username, password, inviteCode) => call("auth.register", { username, password, inviteCode }),
  login: (username, password) => call("auth.login", { username, password }),

  getAccounts: () => call("accounts.list"),
  createAccount: (account) => call("accounts.create", account),
  deleteAccount: (id) => call("accounts.delete", { id }),

  getCategories: () => call("categories.list"),

  importStatement: async (accountId, file) => {
    const csvText = await readFileAsText(file);
    return call("transactions.importCsv", { accountId, csvText });
  },
  importQuickAddTransactions: (accountId) => call("transactions.importQuickAdd", { accountId }),

  getTransactions: (params = {}) => call("transactions.list", params),
  updateTransaction: (id, updates) => call("transactions.update", { id, ...updates }),

  getBudgets: (month) => call("budgets.get", { month }),
  setBudget: (categoryId, month, amount) => call("budgets.set", { categoryId, month, amount }),
  importQuickAddBudgets: () => call("budgets.importQuickAdd"),
};
