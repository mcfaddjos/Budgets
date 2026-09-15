import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_URL_KEY = "budgets:serverUrl";
const TOKEN_KEY = "budgets:token";

// Local dev default — override via the in-app server URL field (same
// mechanism as before) or EXPO_PUBLIC_SERVER_URL, once deployed to Render.
const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:4000/api";

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
 * In-memory `token` is re-hydrated from storage on every call that needs
 * it, not just once at app startup — Metro Fast Refresh re-runs this
 * module (resetting plain module-level state) independent of React state
 * elsewhere staying intact. AsyncStorage isn't affected by that reset.
 */
async function ensureToken() {
  if (!token) {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    if (stored) token = stored;
  }
  return token;
}

/**
 * Lets screens show live "what's going on" text (e.g. "Retrying…") while a
 * call is in flight, without threading a callback through every api.* call.
 */
let statusListeners = [];
export function onStatus(listener) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}
function emitStatus(message) {
  statusListeners.forEach((l) => l(message));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single request attempt. Unlike the old Apps Script backend, Express
 * returns a real HTTP response body directly — no redirect hop, so none
 * of the old "landed on an unrelated page instead of JSON" handling
 * applies here. A network failure (dropped connection, DNS, etc.) is
 * still retryable; a clean response the server rejected is not.
 */
async function callOnce(action, payload) {
  const currentToken = await ensureToken();
  let response;
  try {
    response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token: currentToken, payload }),
    });
  } catch (err) {
    const netErr = new Error(`Network error: ${err.message}`);
    netErr.retryable = true;
    throw netErr;
  }

  let result;
  try {
    result = await response.json();
  } catch (err) {
    const badErr = new Error(`Unexpected response from server (HTTP ${response.status})`);
    badErr.retryable = true;
    throw badErr;
  }

  if (!result || !result.ok) {
    const message = (result && result.error) || `Request failed (${response.status})`;
    const apiErr = new Error(message);
    // A clean, successful HTTP response the server explicitly rejected
    // (invalid token, bad invite code, etc.) — as opposed to a
    // network/malformed-response failure, which says nothing about
    // whether the token is valid.
    apiErr.isApiError = true;
    throw apiErr;
  }
  return result.data;
}

const MAX_ATTEMPTS = 3;

/**
 * In-memory cache for the two list calls that rarely change and are
 * re-read on nearly every screen — avoids a network round-trip when a
 * screen was visited within the last minute. Explicitly invalidated by
 * any action that actually changes the underlying data, not just left to
 * the TTL. This is a stopgap; §10b's real cache-first/prefetch layer
 * (TanStack Query + persisted storage) replaces it once the screens are
 * rewritten to consume it.
 */
const CACHEABLE_ACTIONS = new Set(["accounts.list", "categories.list", "categoryRules.list"]);
const CLIENT_CACHE_TTL_MS = 60000;
const clientCache = new Map();

/**
 * Actions that append a brand-new row each time they run — never safe to
 * auto-retry. A response can fail to arrive *after* a write already
 * reached the database (a dropped connection after the server committed),
 * so retrying here doesn't recover from a failure, it risks duplicating a
 * write that may have already succeeded.
 */
const NON_IDEMPOTENT_ACTIONS = new Set([
  "accounts.create",
  "categories.create",
  "categories.createMany",
  "categoryRules.create",
  "transactions.create",
]);

function invalidateClientCache(action) {
  clientCache.delete(action);
}

async function call(action, payload) {
  if (CACHEABLE_ACTIONS.has(action)) {
    const cached = clientCache.get(action);
    if (cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS) return cached.data;
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) emitStatus(`Retrying ${action}… (attempt ${attempt}/${MAX_ATTEMPTS})`);
    try {
      const data = await callOnce(action, payload);
      if (attempt > 1) emitStatus(null);
      if (CACHEABLE_ACTIONS.has(action)) clientCache.set(action, { data, at: Date.now() });
      return data;
    } catch (err) {
      lastErr = err;
      if (err.retryable && NON_IDEMPOTENT_ACTIONS.has(action) && attempt === 1) {
        err.message = `${err.message} This may have actually gone through — check before trying again to avoid creating a duplicate.`;
      }
      if (!err.retryable || attempt === MAX_ATTEMPTS || NON_IDEMPOTENT_ACTIONS.has(action)) {
        emitStatus(null);
        // Surfaced to Logcat (tag ReactNativeJS) so a failure can be
        // pulled via adb without the user having to copy/paste it —
        // errors were previously only ever shown in the in-app UI.
        console.error(`[api] ${action} failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err.message);
        throw err;
      }
      await sleep(300 * attempt);
    }
  }
  throw lastErr;
}

export const api = {
  // Google Sign-In handles identity; these three carry key material for
  // the separate vault-passphrase encryption chain (§10a) — see
  // app/src/context/AuthContext.js for how they're assembled.
  registerNewHousehold: (keyMaterial) => call("auth.registerNewHousehold", keyMaterial),
  joinHouseholdViaInvite: (payload) => call("auth.joinHouseholdViaInvite", payload),
  login: (idToken) => call("auth.login", { idToken }),
  me: () => call("auth.me"),
  createInvite: (householdId, expiresInDays) => call("auth.createInvite", { householdId, expiresInDays }),
  listPendingKeyGrants: (householdId) => call("auth.listPendingKeyGrants", { householdId }),
  grantAccess: (householdId, memberUserId, wrappedDek) =>
    call("auth.grantAccess", { householdId, memberUserId, wrappedDek }),
  setRecoveryKey: (householdId, recoveryWrappedDek, recoveryDekNonce) =>
    call("auth.setRecoveryKey", { householdId, recoveryWrappedDek, recoveryDekNonce }),

  getAccounts: () => call("accounts.list"),
  createAccount: async (encryptedData, nonce) => {
    const result = await call("accounts.create", { encryptedData, nonce });
    invalidateClientCache("accounts.list");
    return result;
  },
  deleteAccount: async (id) => {
    const result = await call("accounts.delete", { id });
    invalidateClientCache("accounts.list");
    return result;
  },

  getCategories: () => call("categories.list"),
  createCategory: async (encryptedData, nonce) => {
    const result = await call("categories.create", { encryptedData, nonce });
    invalidateClientCache("categories.list");
    return result;
  },
  createDefaultCategories: async (categories) => {
    const result = await call("categories.createMany", { categories });
    invalidateClientCache("categories.list");
    return result;
  },
  updateCategory: async (id, encryptedData, nonce) => {
    const result = await call("categories.update", { id, encryptedData, nonce });
    invalidateClientCache("categories.list");
    return result;
  },

  getCategoryRules: () => call("categoryRules.list"),
  createCategoryRule: async (categoryId, encryptedData, nonce) => {
    const result = await call("categoryRules.create", { categoryId, encryptedData, nonce });
    invalidateClientCache("categoryRules.list");
    return result;
  },

  createTransaction: (transaction) => call("transactions.create", transaction),
  getTransactionFormOptions: () => call("transactions.formOptions"),
  getTransactions: (params = {}) => call("transactions.list", params),
  updateTransaction: (id, updates) => call("transactions.update", { id, ...updates }),
  deleteTransaction: (id) => call("transactions.delete", { id }),

  getBudgets: (month) => call("budgets.get", { month }),
  setBudget: (categoryId, month, encryptedData, nonce) =>
    call("budgets.set", { categoryId, month, encryptedData, nonce }),

  // CSV statement import and the old QuickAdd-sheet mechanism aren't
  // ported — both need a client-side rewrite (parsing, categorization,
  // and dedup all need plaintext that only exists on-device now, §10a)
  // and don't correspond to any current backend action yet.
};
