const express = require("express");
const db = require("../db");
const { getSheetRows } = require("../googleSheets");
const { parseBudgetRows } = require("../sheetImport");

const router = express.Router();

const BUDGETS_TAB = process.env.GOOGLE_SHEET_BUDGETS_TAB || "Budgets";

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

router.get("/", (req, res) => {
  const month = req.query.month || currentMonth();

  const rows = db
    .prepare(
      `SELECT
         c.id AS categoryId,
         c.name AS categoryName,
         COALESCE(b.amount, 0) AS budgetAmount,
         COALESCE((
           SELECT SUM(t.amount) FROM transactions t
           WHERE t.category_id = c.id AND t.user_id = ? AND t.date LIKE ?
         ), 0) AS actual
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = c.user_id AND b.month = ?
       WHERE c.user_id = ?
       ORDER BY c.name`
    )
    .all(req.user.id, `${month}%`, month, req.user.id);

  const categories = rows.map((r) => ({
    ...r,
    variance: r.budgetAmount - r.actual,
  }));

  const totals = categories.reduce(
    (acc, c) => ({
      budget: acc.budget + c.budgetAmount,
      actual: acc.actual + c.actual,
    }),
    { budget: 0, actual: 0 }
  );
  totals.variance = totals.budget - totals.actual;

  res.json({ month, categories, totals });
});

router.put("/", (req, res) => {
  const { categoryId, month, amount } = req.body || {};
  if (!categoryId || !month || amount == null) {
    return res
      .status(400)
      .json({ error: "categoryId, month (YYYY-MM), and amount are required" });
  }

  const category = db
    .prepare("SELECT * FROM categories WHERE id = ? AND user_id = ?")
    .get(categoryId, req.user.id);
  if (!category) return res.status(404).json({ error: "category not found" });

  db.prepare(
    `INSERT INTO budgets (user_id, category_id, month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, month) DO UPDATE SET amount = excluded.amount`
  ).run(req.user.id, categoryId, month, amount);

  const budget = db
    .prepare(
      "SELECT * FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?"
    )
    .get(req.user.id, categoryId, month);
  res.json(budget);
});

// Pulls rows from the "Budgets" tab of the configured Google Sheet
// (Month | Category | Amount) and upserts each into this user's budgets.
// Rows naming a category the user doesn't have yet are skipped, not created,
// since categories are meant to be curated, not sheet-driven.
router.post("/import-sheet", async (req, res) => {
  let rows;
  try {
    rows = await getSheetRows(BUDGETS_TAB);
  } catch (err) {
    return res.status(502).json({ error: `Could not read Google Sheet: ${err.message}` });
  }

  let parsed;
  try {
    parsed = parseBudgetRows(rows);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const upsert = db.prepare(
    `INSERT INTO budgets (user_id, category_id, month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, month) DO UPDATE SET amount = excluded.amount`
  );
  const findCategory = db.prepare("SELECT id FROM categories WHERE user_id = ? AND name = ?");

  let applied = 0;
  let skippedUnknownCategory = 0;

  for (const b of parsed.budgets) {
    const category = findCategory.get(req.user.id, b.category);
    if (!category) {
      skippedUnknownCategory++;
      continue;
    }
    upsert.run(req.user.id, category.id, b.month, b.amount);
    applied++;
  }

  res.json({ applied, skippedUnknownCategory, parseErrors: parsed.errors });
});

module.exports = router;
