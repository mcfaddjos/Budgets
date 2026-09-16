const db = require("./db");
const { categorize, getUncategorizedId } = require("./categorize");

/**
 * Inserts already-parsed transaction rows for an account, categorizing
 * each one and relying on the transactions table's UNIQUE(account_id, dedup_key)
 * constraint to silently skip duplicates (whether the duplicate came from the
 * same source or a different one, e.g. a CSV import and a Google Sheets import
 * both containing the same real-world purchase).
 */
function importTransactionRows(userId, accountId, transactions) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (user_id, account_id, date, description, normalized_description, amount, category_id, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let imported = 0;
  let duplicates = 0;
  let uncategorized = 0;
  const uncategorizedId = getUncategorizedId(userId);

  for (const tx of transactions) {
    const categoryId = categorize(userId, tx.normalizedDescription) || uncategorizedId;
    if (categoryId === uncategorizedId) uncategorized++;

    const result = insert.run(
      userId,
      accountId,
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

  return { imported, duplicates, uncategorized, totalRows: transactions.length };
}

module.exports = { importTransactionRows };
