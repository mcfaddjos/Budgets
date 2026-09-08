const express = require("express");
const multer = require("multer");
const db = require("../db");
const { parseStatementCsv } = require("../csv");
const { categorize, getUncategorizedId } = require("../categorize");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (user_id, account_id, date, description, normalized_description, amount, category_id, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let imported = 0;
  let duplicates = 0;
  let uncategorized = 0;
  const uncategorizedId = getUncategorizedId(req.user.id);

  for (const tx of parsed.transactions) {
    const categoryId = categorize(req.user.id, tx.normalizedDescription) || uncategorizedId;
    if (categoryId === uncategorizedId) uncategorized++;

    const result = insert.run(
      req.user.id,
      account.id,
      tx.date,
      tx.description,
      tx.normalizedDescription,
      tx.amount,
      categoryId,
      tx.dedupKey
    );

    if (result.changes > 0) imported++;
    else duplicates++;
  }

  res.json({
    imported,
    duplicates,
    uncategorized,
    parseErrors: parsed.errors,
    totalRows: parsed.transactions.length,
  });
});

module.exports = router;
