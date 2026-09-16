/**
 * Reads the human-editable "QuickAdd Purchases" / "QuickAdd Budgets" tabs.
 * These are deliberately separate from the canonical Transactions/Budgets
 * tabs — a bad hand-typed row here can never corrupt real data, since rows
 * only reach the canonical tabs through the validated sync actions below
 * (transactions.importQuickAdd / budgets.importQuickAdd), which run the same
 * parsing/validation and duplicate/unknown-category handling as any other
 * import path.
 */

function parseQuickAddPurchases_(accountName) {
  const wanted = String(accountName || "").trim().toLowerCase();
  const rows = readAll_("QuickAdd Purchases");
  const transactions = [];
  const errors = [];

  rows.forEach((r) => {
    const rowAccount = String(r.Account || "").trim().toLowerCase();
    if (rowAccount !== wanted) return;

    const rawDate = String(r.Date || "");
    const rawDesc = String(r.Description || "");
    if (!rawDate.trim() || !rawDesc.trim()) return;

    const amount = parseAmount_(String(r.Amount ?? ""));
    if (amount == null) {
      errors.push({ row: r._rowNumber, reason: "Could not parse amount" });
      return;
    }

    const date = normalizeDate_(rawDate);
    const description = rawDesc.trim();
    const normalizedDescription = normalizeDescription_(description);
    const dedupKey = `${date}|${amount.toFixed(2)}|${normalizedDescription.slice(0, 40)}`;

    transactions.push({ date, description, normalizedDescription, amount, dedupKey });
  });

  return { transactions, errors };
}

function normalizeMonth_(raw) {
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2].padStart(2, "0")}`;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  return null;
}

function parseQuickAddBudgets_() {
  const rows = readAll_("QuickAdd Budgets");
  const budgets = [];
  const errors = [];

  rows.forEach((r) => {
    const rawMonth = String(r.Month || "").trim();
    const category = String(r.Category || "").trim();
    if (!rawMonth || !category) return;

    const amount = parseAmount_(String(r.Amount ?? ""));
    if (amount == null) {
      errors.push({ row: r._rowNumber, reason: "Could not parse amount" });
      return;
    }

    const month = normalizeMonth_(rawMonth);
    if (!month) {
      errors.push({ row: r._rowNumber, reason: "Could not parse month (expected YYYY-MM)" });
      return;
    }

    budgets.push({ month, category, amount });
  });

  return { budgets, errors };
}
