/**
 * Thin data layer over the bound spreadsheet. Every "table" is a tab; the
 * header row (in HEADERS below) defines its columns. Rows are read/written
 * as plain objects keyed by header name. Small dataset (two users), so every
 * read loads the whole tab into memory rather than doing range lookups.
 */

const HEADERS = {
  Users: ["id", "username", "passwordHash", "failedAttempts", "lockedUntil", "createdAt"],
  Sessions: ["token", "userId", "createdAt"],
  Accounts: ["id", "userId", "name", "type", "institution", "createdAt"],
  Categories: ["id", "userId", "name"],
  CategoryRules: ["id", "userId", "pattern", "categoryId"],
  Transactions: [
    "id", "userId", "accountId", "date", "description", "normalizedDescription",
    "amount", "categoryId", "reviewed", "dedupKey", "createdAt",
  ],
  Budgets: ["id", "userId", "categoryId", "month", "amount"],
  "QuickAdd Purchases": ["Date", "Description", "Amount", "Account"],
  "QuickAdd Budgets": ["Month", "Category", "Amount"],
  ClientLogs: ["timestamp", "platform", "message", "context"],
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS[name]);
  }
  return sheet;
}

/** Returns every non-empty data row in a tab as an object keyed by header, plus _rowNumber (1-indexed sheet row) for later update/delete. */
function readAll_(name) {
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every((c) => c === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    obj._rowNumber = i + 1;
    rows.push(obj);
  }
  return rows;
}

function appendRow_(name, obj) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  const row = headers.map((h) => (obj[h] === undefined || obj[h] === null ? "" : obj[h]));
  sheet.appendRow(row);
  return obj;
}

function updateRow_(name, rowNumber, patch) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  headers.forEach((h, idx) => {
    if (Object.prototype.hasOwnProperty.call(patch, h)) {
      sheet.getRange(rowNumber, idx + 1).setValue(patch[h]);
    }
  });
}

function deleteRow_(name, rowNumber) {
  getSheet_(name).deleteRow(rowNumber);
}

function newId_() {
  return Utilities.getUuid();
}

/** Strips the internal _rowNumber bookkeeping field before a row is returned to the client. */
function stripRow_(obj) {
  const copy = Object.assign({}, obj);
  delete copy._rowNumber;
  return copy;
}

/**
 * Script-wide cache (shared across all executions/users, per Apps Script's
 * CacheService model) for full-tab reads that are expensive (a real network
 * round-trip to Sheets per call) but rarely change — Categories, Accounts,
 * CategoryRules are read on nearly every request yet only change through a
 * handful of actions we control, so those actions explicitly invalidate the
 * relevant key instead of relying on the TTL alone. Rows are cached whole
 * (with _rowNumber) since some callers need it for update/delete — callers
 * apply stripRow_ themselves before returning data to the client.
 */
const CACHE_TTL_SECONDS = 300;

function getCachedRows_(cacheKey, loader) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  const rows = loader();
  cache.put(cacheKey, JSON.stringify(rows), CACHE_TTL_SECONDS);
  return rows;
}

function invalidateCachedRows_(cacheKey) {
  CacheService.getScriptCache().remove(cacheKey);
}

function getUserCategories_(userId) {
  return getCachedRows_(`categories:${userId}`, () =>
    readAll_("Categories").filter((c) => c.userId === userId)
  );
}
function invalidateUserCategories_(userId) {
  invalidateCachedRows_(`categories:${userId}`);
}

function getUserAccounts_(userId) {
  return getCachedRows_(`accounts:${userId}`, () => readAll_("Accounts").filter((a) => a.userId === userId));
}
function invalidateUserAccounts_(userId) {
  invalidateCachedRows_(`accounts:${userId}`);
}

function getUserCategoryRules_(userId) {
  return getCachedRows_(`categoryRules:${userId}`, () =>
    readAll_("CategoryRules").filter((r) => r.userId === userId)
  );
}
function invalidateUserCategoryRules_(userId) {
  invalidateCachedRows_(`categoryRules:${userId}`);
}
