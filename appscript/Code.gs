/**
 * Single Web App entry point. Apps Script only routes on doGet/doPost (no
 * path or verb routing like Express had), so every call — reads included —
 * goes through doPost with an action envelope:
 *   { action: "transactions.importCsv", token, payload: {...} }
 * returning { ok: true, data } or { ok: false, error }.
 */

const PUBLIC_ACTIONS = new Set(["auth.register", "auth.login"]);

function doGet() {
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
    const data = withLock_(() => dispatch_(body.action, body.token, body.payload || {}));
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

function dispatch_(action, token, payload) {
  if (!action) throw new Error("action is required");

  const user = PUBLIC_ACTIONS.has(action) ? null : requireAuth_(token);

  switch (action) {
    case "auth.register":
      return handleRegister_(payload);
    case "auth.login":
      return handleLogin_(payload);
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
    case "transactions.list":
      return handleTransactionsList_(user, payload);
    case "transactions.update":
      return handleTransactionsUpdate_(user, payload);
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
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
