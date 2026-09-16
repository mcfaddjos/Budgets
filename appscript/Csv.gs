/**
 * Direct port of server/src/csv.js — pure JS, no Node built-ins, so it
 * carries over almost verbatim. Handles quoted fields, escaped quotes,
 * CRLF/LF, and issuers that split amount into separate debit/credit columns.
 */

function parseCsv_(text) {
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

function findColumn_(header, aliases) {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function mapColumns_(header) {
  const dateIdx = findColumn_(header, HEADER_ALIASES.date);
  const descIdx = findColumn_(header, HEADER_ALIASES.description);
  const amountIdx = findColumn_(header, HEADER_ALIASES.amount);
  const debitIdx = findColumn_(header, HEADER_ALIASES.debit);
  const creditIdx = findColumn_(header, HEADER_ALIASES.credit);

  if (dateIdx === -1 || descIdx === -1) return null;
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) return null;

  return { dateIdx, descIdx, amountIdx, debitIdx, creditIdx };
}

function parseAmount_(raw) {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const negativeParens = /^\(.*\)$/.test(cleaned);
  const value = parseFloat(negativeParens ? `-${cleaned.slice(1, -1)}` : cleaned);
  return Number.isNaN(value) ? null : value;
}

function normalizeDate_(raw) {
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

function normalizeDescription_(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses tabular rows (header + data, as string arrays) into normalized
 * transaction rows. Amount convention: positive = money spent (charge),
 * negative = credit/refund/payment.
 */
function parseStatementRows_(rows) {
  if (rows.length === 0) throw new Error("No rows to parse");

  const header = rows[0];
  const columns = mapColumns_(header);
  if (!columns) {
    throw new Error("Could not find date/description/amount columns in the header");
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
        amount = parseAmount_(row[columns.amountIdx]);
      } else {
        const debit = columns.debitIdx !== -1 ? parseAmount_(row[columns.debitIdx]) : null;
        const credit = columns.creditIdx !== -1 ? parseAmount_(row[columns.creditIdx]) : null;
        if (debit != null && debit !== 0) amount = Math.abs(debit);
        else if (credit != null && credit !== 0) amount = -Math.abs(credit);
        else amount = 0;
      }

      if (amount == null) {
        errors.push({ row: i + 1, reason: "Could not parse amount" });
        continue;
      }

      const date = normalizeDate_(rawDate);
      const description = rawDesc.trim();
      const normalizedDescription = normalizeDescription_(description);
      const dedupKey = `${date}|${amount.toFixed(2)}|${normalizedDescription.slice(0, 40)}`;

      transactions.push({ date, description, normalizedDescription, amount, dedupKey });
    } catch (err) {
      errors.push({ row: i + 1, reason: err.message });
    }
  }

  return { transactions, errors };
}

function parseStatementCsv_(text) {
  const rows = parseCsv_(text);
  if (rows.length === 0) throw new Error("CSV file is empty");
  return parseStatementRows_(rows);
}
