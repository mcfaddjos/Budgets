const express = require("express");
const multer = require("multer");
const db = require("../db");
const { parseStatementCsv } = require("../csv");
const { parsePurchaseRows } = require("../sheetImport");
const { getSheetRows } = require("../googleSheets");
const { importTransactionRows } = require("../importTransactions");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const PURCHASES_TAB = process.env.GOOGLE_SHEET_PURCHASES_TAB || "Purchases";

function getOwnedAccount(accountId, userId) {
  return db
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(accountId, userId);
}

router.post("/:accountId/import", upload.single("file"), (req, res) => {
  const account = getOwnedAccount(req.params.accountId, req.user.id);
  if (!account) return res.status(404).json({ error: "account not found" });
  if (!req.file) return res.status(400).json({ error: "CSV file is required (field: file)" });

  let parsed;
  try {
    parsed = parseStatementCsv(req.file.buffer.toString("utf8"));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const result = importTransactionRows(req.user.id, account.id, parsed.transactions);
  res.json({ ...result, parseErrors: parsed.errors });
});

// Pulls rows from the "Purchases" tab of the configured Google Sheet
// (see server/src/googleSheets.js) that match this account's name, and
// imports them the same way a CSV upload would.
router.post("/:accountId/import-sheet", async (req, res) => {
  const account = getOwnedAccount(req.params.accountId, req.user.id);
  if (!account) return res.status(404).json({ error: "account not found" });

  let rows;
  try {
    rows = await getSheetRows(PURCHASES_TAB);
  } catch (err) {
    return res.status(502).json({ error: `Could not read Google Sheet: ${err.message}` });
  }

  let parsed;
  try {
    parsed = parsePurchaseRows(rows, account.name);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const result = importTransactionRows(req.user.id, account.id, parsed.transactions);
  res.json({ ...result, parseErrors: parsed.errors });
});

module.exports = router;
