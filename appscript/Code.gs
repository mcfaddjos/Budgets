/**
 * Single Web App entry point. Apps Script only routes on doGet/doPost (no
 * path or verb routing like Express had), so every call — reads included —
 * goes through doPost with an action envelope:
 *   { action: "transactions.importCsv", token, payload: {...} }
 * returning { ok: true, data } or { ok: false, error }.
 */

// debug.logs is public (not session-gated) on purpose: it exists to diagnose
// login/auth failures themselves, so it can't depend on already having a
// valid session. Contains only error text/timestamps, never passwords or
// tokens — see the messages logToServer() sends in app/src/api/client.js.
const PUBLIC_ACTIONS = new Set(["auth.register", "auth.login", "debug.logs"]);

// Reads never need to serialize behind the global script lock — only writes
// do, to avoid two requests racing on the same row. Locking reads too was
// the actual cause of the app feeling badly stuck: a single screen load
// fires 3 read calls at once (accounts/categories/budgets), and each one
// was queueing up behind the others (and behind any in-flight write) on one
// shared lock for no real reason, compounding into very long waits.
const READ_ONLY_ACTIONS = new Set([
  "auth.me",
  "accounts.list",
  "categories.list",
  "transactions.list",
  "transactions.formOptions",
  "budgets.get",
  "debug.logs",
]);

/**
 * A GET-based, fire-and-forget client log beacon (?log=...&platform=...&ctx=...)
 * lives alongside the health check on doGet rather than as a doPost action,
 * since it exists specifically to catch cases where doPost itself is the
 * thing behaving unexpectedly — it needs its own independent path.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.log) {
    try {
      appendRow_("ClientLogs", {
        timestamp: new Date().toISOString(),
        platform: params.platform || "",
        message: params.log,
        context: params.ctx || "",
      });
    } catch (err) {
      // Logging must never itself throw.
    }
    return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("Budgets API is running").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_(false, null, "Invalid JSON body");
  }

  try {
    const run = () => dispatch_(body.action, body.token, body.payload || {});
    const data = READ_ONLY_ACTIONS.has(body.action) ? run() : withLock_(run);
    return respond_(true, data, null);
  } catch (err) {
    return respond_(false, null, err.message || String(err));
  }
}

function respond_(ok, data, error) {
  const body = ok ? { ok: true, data } : { ok: false, error };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function handleDebugLogs_() {
  const rows = readAll_("ClientLogs").map(stripRow_);
  rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return rows.slice(0, 50);
}

function dispatch_(action, token, payload) {
  if (!action) throw new Error("action is required");

  const user = PUBLIC_ACTIONS.has(action) ? null : requireAuth_(token);

  switch (action) {
    case "auth.register":
      return handleRegister_(payload);
    case "auth.login":
      return handleLogin_(payload);
    case "auth.me":
      return handleMe_(user);
    case "accounts.list":
      return handleAccountsList_(user);
    case "accounts.create":
      return handleAccountsCreate_(user, payload);
    case "accounts.delete":
      return handleAccountsDelete_(user, payload);
    case "categories.list":
      return handleCategoriesList_(user);
    case "categories.create":
      return handleCategoriesCreate_(user, payload);
    case "categories.update":
      return handleCategoriesUpdate_(user, payload);
    case "transactions.list":
      return handleTransactionsList_(user, payload);
    case "transactions.create":
      return handleTransactionsCreate_(user, payload);
    case "transactions.formOptions":
      return handleTransactionsFormOptions_(user);
    case "transactions.update":
      return handleTransactionsUpdate_(user, payload);
    case "transactions.delete":
      return handleTransactionsDelete_(user, payload);
    case "transactions.importCsv":
      return handleTransactionsImportCsv_(user, payload);
    case "transactions.importQuickAdd":
      return handleTransactionsImportQuickAdd_(user, payload);
    case "budgets.get":
      return handleBudgetsGet_(user, payload);
    case "budgets.set":
      return handleBudgetsSet_(user, payload);
    case "budgets.importQuickAdd":
      return handleBudgetsImportQuickAdd_(user);
    case "debug.logs":
      return handleDebugLogs_();
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
