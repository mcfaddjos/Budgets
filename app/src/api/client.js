import { Platform } from "react-native";
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
 * In-memory `token` is intentionally re-hydrated from storage on every call
 * that needs it, not just once at app startup — Metro Fast Refresh re-runs
 * this module (resetting plain module-level state like `token`) independent
 * of React state elsewhere staying intact, which otherwise shows up as
 * "Missing auth token" mid-session despite the UI still saying you're logged
 * in. AsyncStorage isn't affected by that reset, so it's the source of truth.
 */
async function ensureToken() {
  if (!token) {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    if (stored) token = stored;
  }
  return token;
}

/**
 * Fire-and-forget diagnostic beacon, sent as a GET (not through the same
 * doPost path being diagnosed) so a broken doPost round-trip doesn't also
 * take out the ability to see that it broke. Never throws — a failed log
 * call must never surface as a user-facing error of its own.
 */
function logToServer(message, context) {
  try {
    const url = `${serverUrl}?log=${encodeURIComponent(message)}&platform=${encodeURIComponent(
      Platform.OS
    )}&ctx=${encodeURIComponent(context || "")}`;
    fetch(url).catch(() => {});
  } catch (err) {
    // never throw from logging
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Single request attempt. Apps Script Web App responses are delivered via a
 * 302 redirect to a one-time, short-lived script.googleusercontent.com link
 * carrying the actual result — Android's native fetch occasionally fumbles
 * that hop (landing on a 404 HTML page instead), independent of anything the
 * server did. Marking that specific failure `retryable` lets call() retry
 * with a fresh request (and therefore a fresh redirect link) instead of
 * surfacing a spurious error — a real API-level error (ok: false) is not
 * retried, since retrying wouldn't change a wrong password into a right one.
 */
async function callOnce(action, payload) {
  const currentToken = await ensureToken();
  let response;
  try {
    response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token: currentToken, payload }),
    });
  } catch (err) {
    const netErr = new Error(`Network error: ${err.message}`);
    netErr.retryable = true;
    netErr.logMessage = `network error calling ${action}: ${err.message}`;
    throw netErr;
  }

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch (err) {
    // The raw HTML page is real diagnostic info, but not something a person
    // should have to read on screen — the readable summary goes in the
    // thrown message, the full page text still goes to logMessage/the logs.
    // A 401/403 specifically means the deployment's access setting reverted
    // to requiring Google sign-in again (a known Apps Script/clasp gotcha,
    // not something a retry fixes) — worth telling the primary user exactly
    // that, rather than the generic "flaky, try again" message.
    const isAccessWall = response.status === 401 || response.status === 403;
    const badErr = new Error(
      isAccessWall
        ? "App is temporarily unavailable (deployment needs to be fixed). Please notify the developer."
        : `The server sent back an unexpected page instead of a real response (HTTP ${response.status}). ` +
            `This is a known flaky spot with Apps Script's response delivery, not something you did — it usually clears up on retry.`
    );
    badErr.retryable = !isAccessWall;
    badErr.logMessage = isAccessWall
      ? `access wall (http ${response.status}) for ${action} — deployment "Who has access" needs resetting to Anyone`
      : `bad response for ${action} (http ${response.status}): ${text.slice(0, 500)}`;
    throw badErr;
  }

  if (!result || !result.ok) {
    const message = (result && result.error) || `Request failed (${response.status})`;
    const apiErr = new Error(message);
    apiErr.logMessage = `api error for ${action}: ${message}`;
    // A clean, successful HTTP response the server explicitly rejected (bad
    // password, expired token, etc.) — as opposed to a network/malformed-
    // response failure, which says nothing about whether the token is valid.
    apiErr.isApiError = true;
    throw apiErr;
  }
  return result.data;
}

const MAX_ATTEMPTS = 3;

/**
 * In-memory cache for the two list calls that rarely change and are re-read
 * on nearly every screen — avoids a network round-trip entirely (not just
 * the spreadsheet read the server-side cache already skips) when a screen
 * was visited within the last minute. Explicitly invalidated by any action
 * that actually changes the underlying data, not just left to the TTL.
 */
const CACHEABLE_ACTIONS = new Set(["accounts.list", "categories.list"]);
const CLIENT_CACHE_TTL_MS = 60000;
const clientCache = new Map();

/**
 * Actions that append a brand-new row with a fresh id each time they run —
 * never safe to auto-retry. The Apps Script redirect delivery can fail
 * *after* a write already reached the sheet (this actually happened: logs
 * showed a clean accounts.create, then a 404 on the response, then a retry
 * that created a second account) — retrying here doesn't recover from a
 * failure, it duplicates a write that may have already succeeded. Reads and
 * upserts (budgets.set, transactions.update) stay safely retryable.
 */
const NON_IDEMPOTENT_ACTIONS = new Set(["accounts.create", "categories.create", "transactions.create"]);

function invalidateClientCache(action) {
  clientCache.delete(action);
}

async function call(action, payload) {
  if (CACHEABLE_ACTIONS.has(action)) {
    const cached = clientCache.get(action);
    if (cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS) return cached.data;
  }

  const startedAt = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) emitStatus(`Retrying ${action}… (attempt ${attempt}/${MAX_ATTEMPTS})`);
    try {
      const data = await callOnce(action, payload);
      if (attempt > 1) emitStatus(null);
      logToServer(`${action} took ${Date.now() - startedAt}ms (${attempt} attempt${attempt > 1 ? "s" : ""})`, "timing");
      if (CACHEABLE_ACTIONS.has(action)) clientCache.set(action, { data, at: Date.now() });
      return data;
    } catch (err) {
      lastErr = err;
      logToServer(err.logMessage ? `${err.logMessage} (attempt ${attempt}/${MAX_ATTEMPTS})` : String(err));
      if (err.retryable && NON_IDEMPOTENT_ACTIONS.has(action) && attempt === 1) {
        // The write may have actually reached the sheet even though this
        // response didn't — surface that honestly instead of silently
        // retrying (which could create a duplicate) or claiming it failed.
        err.message = `${err.message} This may have actually gone through — check before trying again to avoid creating a duplicate.`;
      }
      if (!err.retryable || attempt === MAX_ATTEMPTS || NON_IDEMPOTENT_ACTIONS.has(action)) {
        emitStatus(null);
        logToServer(`${action} failed after ${Date.now() - startedAt}ms (${attempt} attempts)`, "timing");
        throw err;
      }
      await sleep(300 * attempt);
    }
  }
  throw lastErr;
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
  me: () => call("auth.me"),

  getAccounts: () => call("accounts.list"),
  createAccount: async (account) => {
    const result = await call("accounts.create", account);
    invalidateClientCache("accounts.list");
    return result;
  },
  deleteAccount: async (id) => {
    const result = await call("accounts.delete", { id });
    invalidateClientCache("accounts.list");
    return result;
  },

  getCategories: () => call("categories.list"),
  createCategory: async (name) => {
    const result = await call("categories.create", { name });
    invalidateClientCache("categories.list");
    return result;
  },
  updateCategory: async (id, name) => {
    const result = await call("categories.update", { id, name });
    invalidateClientCache("categories.list");
    return result;
  },

  importStatement: async (accountId, file) => {
    const csvText = await readFileAsText(file);
    return call("transactions.importCsv", { accountId, csvText });
  },
  importQuickAddTransactions: (accountId) => call("transactions.importQuickAdd", { accountId }),
  createTransaction: (accountId, amount, categoryId, description) =>
    call("transactions.create", { accountId, amount, categoryId, description }),
  getTransactionFormOptions: () => call("transactions.formOptions"),

  getTransactions: (params = {}) => call("transactions.list", params),
  updateTransaction: (id, updates) => call("transactions.update", { id, ...updates }),
  deleteTransaction: (id) => call("transactions.delete", { id }),

  getBudgets: (month) => call("budgets.get", { month }),
  setBudget: (categoryId, month, amount) => call("budgets.set", { categoryId, month, amount }),
  importQuickAddBudgets: () => call("budgets.importQuickAdd"),

  debugLogs: () => call("debug.logs"),
};
