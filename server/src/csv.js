/** Minimal CSV parser: handles quoted fields, escaped quotes, and CRLF/LF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const HEADER_ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "trans date"],
  description: ["description", "memo", "payee", "merchant", "name"],
  amount: ["amount", "transaction amount"],
  debit: ["debit", "debit amount", "withdrawal"],
  credit: ["credit", "credit amount", "deposit", "payment"],
};

function findColumn(header, aliases) {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Maps a CSV's header row to date/description/amount columns.
 * Supports issuers that split amount into separate debit/credit columns
 * (debits become positive spend, credits become negative/refunds).
 */
function mapColumns(header) {
  const dateIdx = findColumn(header, HEADER_ALIASES.date);
  const descIdx = findColumn(header, HEADER_ALIASES.description);
  const amountIdx = findColumn(header, HEADER_ALIASES.amount);
  const debitIdx = findColumn(header, HEADER_ALIASES.debit);
  const creditIdx = findColumn(header, HEADER_ALIASES.credit);

  if (dateIdx === -1 || descIdx === -1) return null;
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) return null;

  return { dateIdx, descIdx, amountIdx, debitIdx, creditIdx };
}

function parseAmount(raw) {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const negativeParens = /^\(.*\)$/.test(cleaned);
  const value = parseFloat(negativeParens ? `-${cleaned.slice(1, -1)}` : cleaned);
  return Number.isNaN(value) ? null : value;
}

function normalizeDate(raw) {
  const trimmed = raw.trim();
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let [, m, d, y] = mdy;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const isoLike = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeDescription(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a raw CSV string into normalized transaction rows.
 * Amount convention: positive = money spent (charge), negative = credit/refund/payment.
 * This matches how most credit card issuers export CSVs, and is the convention
 * the rest of the app (budgets, spend totals) assumes.
 */
function parseStatementCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSV file is empty");

  const header = rows[0];
  const columns = mapColumns(header);
  if (!columns) {
    throw new Error(
      "Could not find date/description/amount columns in the CSV header"
    );
  }

  const transactions = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
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

module.exports = {
  parseCsv,
  mapColumns,
  parseAmount,
  normalizeDate,
  normalizeDescription,
  parseStatementCsv,
};
