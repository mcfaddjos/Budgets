/**
 * Ported from server/src/importTransactions.js. Relies on a Set of the
 * account's existing dedup keys (built once per call) instead of a SQL
 * UNIQUE constraint to silently skip duplicates — whether the duplicate
 * came from the same source or a different one (e.g. a CSV import and a
 * QuickAdd sync both containing the same real-world purchase).
 */
function importTransactionRows_(userId, accountId, transactions) {
  const existingKeys = new Set(
    readAll_("Transactions")
      .filter((t) => t.userId === userId && t.accountId === accountId)
      .map((t) => t.dedupKey)
  );
  const uncategorizedId = getUncategorizedId_(userId);

  let imported = 0;
  let duplicates = 0;
  let uncategorized = 0;

  for (const tx of transactions) {
    if (existingKeys.has(tx.dedupKey)) {
      duplicates++;
      continue;
    }

    const categoryId = categorize_(userId, tx.normalizedDescription) || uncategorizedId;
    if (categoryId === uncategorizedId) uncategorized++;

    appendRow_("Transactions", {
      id: newId_(),
      userId,
      accountId,
      date: tx.date,
      description: tx.description,
      normalizedDescription: tx.normalizedDescription,
      amount: tx.amount,
      categoryId,
      reviewed: false,
      dedupKey: tx.dedupKey,
      createdAt: new Date().toISOString(),
    });
    existingKeys.add(tx.dedupKey);
    imported++;
  }

  return { imported, duplicates, uncategorized, totalRows: transactions.length };
}

function handleTransactionsList_(user, payload) {
  const { accountId, month } = payload || {};
  let rows = readAll_("Transactions").filter((t) => t.userId === user.id);
  if (accountId) rows = rows.filter((t) => t.accountId === accountId);
  if (month) rows = rows.filter((t) => String(t.date).indexOf(month) === 0);

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b._rowNumber - a._rowNumber;
  });

  return rows.map(stripRow_);
}

function handleTransactionsUpdate_(user, payload) {
  const { id, categoryId, reviewed, applyRule } = payload || {};
  const tx = readAll_("Transactions").find((t) => t.id === id && t.userId === user.id);
  if (!tx) throw new Error("not found");

  const patch = {};
  if (categoryId !== undefined) {
    patch.categoryId = categoryId;
    if (applyRule) saveRule_(user.id, tx.normalizedDescription, categoryId);
  }
  if (reviewed !== undefined) patch.reviewed = !!reviewed;

  updateRow_("Transactions", tx._rowNumber, patch);
  return stripRow_(Object.assign({}, tx, patch));
}

function handleTransactionsImportCsv_(user, payload) {
  const { accountId, csvText } = payload || {};
  const account = readAll_("Accounts").find((a) => a.id === accountId && a.userId === user.id);
  if (!account) throw new Error("account not found");
  if (!csvText) throw new Error("csvText is required");

  const parsed = parseStatementCsv_(csvText);
  const result = importTransactionRows_(user.id, account.id, parsed.transactions);
  return Object.assign({}, result, { parseErrors: parsed.errors });
}

function handleTransactionsImportQuickAdd_(user, payload) {
  const { accountId } = payload || {};
  const account = readAll_("Accounts").find((a) => a.id === accountId && a.userId === user.id);
  if (!account) throw new Error("account not found");

  const parsed = parseQuickAddPurchases_(account.name);
  const result = importTransactionRows_(user.id, account.id, parsed.transactions);
  return Object.assign({}, result, { parseErrors: parsed.errors });
}
