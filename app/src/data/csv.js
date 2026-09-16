// Minimal CSV parsing for the bulk-import template (task/roadmap item —
// distinct from bank-statement import, PRD §8.1, which needs to handle
// arbitrary issuer formats; this only ever has to understand our own
// fixed template). Handles double-quoted fields (so a description can
// contain a comma) without pulling in a full CSV library for a format we
// fully control ourselves.
export const TEMPLATE_COLUMNS = ["date", "amount", "description", "category"];
export const TEMPLATE_EXAMPLE_ROW = ["2026-09-15", "42.50", "Grocery store", "Home Fud"];
export const TEMPLATE_TEXT = `${TEMPLATE_COLUMNS.join(",")}\n${TEMPLATE_EXAMPLE_ROW.join(",")}\n`;

function parseLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Returns { headers, rows } — rows are objects keyed by lowercased header name, so column order in the file doesn't matter as long as the names match. */
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const fields = parseLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Validates a parsed row against the template columns and an existing
 * category-name lookup (case-insensitive), without touching the network
 * — lets the import UI show a full preview (what will import, what will
 * be skipped and why) before anything is actually created.
 */
export function validateRow(row, categoryIdByLowerName) {
  const errors = [];

  const date = (row.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("date must be YYYY-MM-DD");

  const amount = parseFloat(row.amount);
  if (Number.isNaN(amount)) errors.push("amount is not a number");

  const description = (row.description || "").trim();

  const categoryName = (row.category || "").trim();
  const categoryId = categoryIdByLowerName[categoryName.toLowerCase()];
  if (categoryName && !categoryId) errors.push(`category "${categoryName}" doesn't exist`);

  return { date, amount, description, categoryName, categoryId, errors };
}
