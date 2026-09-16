const { mapColumns, parseAmount, normalizeDate, normalizeDescription } = require("./csv");

const ACCOUNT_ALIASES = ["account", "account name", "card"];

function findColumnByAliases(header, aliases) {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses rows from the "Purchases" tab into transactions for one account,
 * matching a case-insensitive "Account" column against the account's name
 * when that column is present. Uses the same dedup_key formula as CSV import
 * so a purchase entered by hand and later re-imported from a real statement
 * (or vice versa) is recognized as the same transaction, not a duplicate.
 */
function parsePurchaseRows(rows, accountName) {
  if (rows.length === 0) return { transactions: [], errors: [] };

  const header = rows[0];
  const columns = mapColumns(header);
  if (!columns) {
    throw new Error("Purchases tab is missing Date/Description/Amount columns");
  }
  const accountIdx = findColumnByAliases(header, ACCOUNT_ALIASES);
  const wantedAccount = accountName.trim().toLowerCase();

  const transactions = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (accountIdx !== -1) {
      const rowAccount = (row[accountIdx] || "").trim().toLowerCase();
      if (rowAccount !== wantedAccount) continue;
    }

    try {
      const rawDate = row[columns.dateIdx] ?? "";
      const rawDesc = row[columns.descIdx] ?? "";
      if (!rawDate.trim() || !rawDesc.trim()) continue;

      let amount;
      if (columns.amountIdx !== -1) {
        amount = parseAmount(row[columns.amountIdx]);
      } else {
        const debit = columns.debitIdx !== -1 ? parseAmount(row[columns.debitIdx]) : null;
        const credit = columns.creditIdx !== -1 ? parseAmount(row[columns.creditIdx]) : null;
        if (debit != null && debit !== 0) amount = Math.abs(debit);
        else if (credit != null && credit !== 0) amount = -Math.abs(credit);
        else amount = 0;
      }

      if (amount == null) {
        errors.push({ row: i + 1, reason: "Could not parse amount" });
        continue;
      }

      const date = normalizeDate(rawDate);
      const description = rawDesc.trim();
      const normalizedDescription = normalizeDescription(description);
      const dedupKey = `${date}|${amount.toFixed(2)}|${normalizedDescription.slice(0, 40)}`;

      transactions.push({ date, description, normalizedDescription, amount, dedupKey });
    } catch (err) {
      errors.push({ row: i + 1, reason: err.message });
    }
  }

  return { transactions, errors };
}

function normalizeMonth(raw) {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2].padStart(2, "0")}`;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  return null;
}

/** Parses rows from the "Budgets" tab: Month | Category | Amount. */
function parseBudgetRows(rows) {
  if (rows.length === 0) return { budgets: [], errors: [] };

  const header = rows[0];
  const monthIdx = findColumnByAliases(header, ["month"]);
  const categoryIdx = findColumnByAliases(header, ["category", "category name"]);
  const amountIdx = findColumnByAliases(header, ["amount", "budget", "budget amount"]);

  if (monthIdx === -1 || categoryIdx === -1 || amountIdx === -1) {
    throw new Error("Budgets tab must have Month, Category, and Amount columns");
  }

  const budgets = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawMonth = (row[monthIdx] || "").trim();
    const category = (row[categoryIdx] || "").trim();
    if (!rawMonth || !category) continue;

    const amount = parseAmount(row[amountIdx]);
    if (amount == null) {
      errors.push({ row: i + 1, reason: "Could not parse amount" });
      continue;
    }

    const month = normalizeMonth(rawMonth);
    if (!month) {
      errors.push({ row: i + 1, reason: "Could not parse month (expected YYYY-MM)" });
      continue;
    }

    budgets.push({ month, category, amount });
  }

  return { budgets, errors };
}

module.exports = { parsePurchaseRows, parseBudgetRows };
