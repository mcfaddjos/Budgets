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
  const categorizer = buildCategorizer_(userId);

  let imported = 0;
  let duplicates = 0;
  let uncategorized = 0;

  for (const tx of transactions) {
    if (existingKeys.has(tx.dedupKey)) {
      duplicates++;
      continue;
    }

    const categoryId = categorizer.categorize(tx.normalizedDescription) || categorizer.uncategorizedId;
    if (categoryId === categorizer.uncategorizedId) uncategorized++;

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

/**
 * Combines accounts.list + categories.list into one round trip — both are
 * needed together to open the "Add Transaction" form, and each Apps Script
 * Web App call costs a real network round trip (plus the redirect-delivery
 * hop), so halving the call count halves that fixed cost.
 */
function handleTransactionsFormOptions_(user) {
  return {
    accounts: getUserAccounts_(user.id).map(stripRow_),
    categories: getUserCategories_(user.id).map(stripRow_),
  };
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

/**
 * A manually-entered transaction is a deliberate, one-off record — unlike a
 * CSV/QuickAdd import, it's never treated as a possible duplicate of an
 * existing row (two genuinely separate $5 coffees on the same day are both
 * real), so this bypasses importTransactionRows_'s dedup check entirely and
 * gives the row a dedupKey that can never collide with anything else.
 */
function handleTransactionsCreate_(user, payload) {
  const { accountId, amount, categoryId, description } = payload || {};
  const account = getUserAccounts_(user.id).find((a) => a.id === accountId);
  if (!account) throw new Error("account not found");

  const amountNum = Number(amount);
  if (amount == null || Number.isNaN(amountNum)) throw new Error("amount is required");
  if (!categoryId) throw new Error("category is required");

  const category = getUserCategories_(user.id).find((c) => c.id === categoryId);
  if (!category) throw new Error("category not found");

  const finalDescription = (String(description || "").trim()) || category.name;
  const id = newId_();
  const transaction = {
    id,
    userId: user.id,
    accountId,
    date: new Date().toISOString().slice(0, 10),
    description: finalDescription,
    normalizedDescription: normalizeDescription_(finalDescription),
    amount: amountNum,
    categoryId,
    reviewed: false,
    dedupKey: `manual:${id}`,
    createdAt: new Date().toISOString(),
  };
  appendRow_("Transactions", transaction);
  return stripRow_(transaction);
}

/** Idempotent on the same "already gone means success" reasoning as handleAccountsDelete_. */
function handleTransactionsDelete_(user, payload) {
  const { id } = payload || {};
  const tx = readAll_("Transactions").find((t) => t.id === id && t.userId === user.id);
  if (!tx) return { ok: true };
  deleteRow_("Transactions", tx._rowNumber);
  return { ok: true };
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
  const account = getUserAccounts_(user.id).find((a) => a.id === accountId);
  if (!account) throw new Error("account not found");
  if (!csvText) throw new Error("csvText is required");

  const parsed = parseStatementCsv_(csvText);
  const result = importTransactionRows_(user.id, account.id, parsed.transactions);
  return Object.assign({}, result, { parseErrors: parsed.errors });
}

function handleTransactionsImportQuickAdd_(user, payload) {
  const { accountId } = payload || {};
  const account = getUserAccounts_(user.id).find((a) => a.id === accountId);
  if (!account) throw new Error("account not found");

  const parsed = parseQuickAddPurchases_(account.name);
  const result = importTransactionRows_(user.id, account.id, parsed.transactions);
  return Object.assign({}, result, { parseErrors: parsed.errors });
}
