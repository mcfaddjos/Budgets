const express = require("express");
const db = require("../db");

const router = express.Router();

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

module.exports = router;
