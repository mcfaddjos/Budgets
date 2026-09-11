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
