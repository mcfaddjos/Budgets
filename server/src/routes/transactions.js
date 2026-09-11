const express = require("express");
const db = require("../db");
const { saveRule } = require("../categorize");

const router = express.Router();

router.get("/", (req, res) => {
  const { accountId, month } = req.query;
  let sql = "SELECT * FROM transactions WHERE user_id = ?";
  const params = [req.user.id];

  if (accountId) {
    sql += " AND account_id = ?";
    params.push(accountId);
  }
  if (month) {
    sql += " AND date LIKE ?";
    params.push(`${month}%`);
  }
  sql += " ORDER BY date DESC, id DESC";

  res.json(db.prepare(sql).all(...params));
});

router.patch("/:id", (req, res) => {
  const tx = db
    .prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!tx) return res.status(404).json({ error: "not found" });

  const { categoryId, reviewed, applyRule } = req.body || {};

  if (categoryId !== undefined) {
    db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(
      categoryId,
      tx.id
    );
    if (applyRule) {
      saveRule(req.user.id, tx.normalized_description, categoryId);
    }
  }

  if (reviewed !== undefined) {
    db.prepare("UPDATE transactions SET reviewed = ? WHERE id = ?").run(
      reviewed ? 1 : 0,
      tx.id
    );
  }

  const updated = db.prepare("SELECT * FROM transactions WHERE id = ?").get(tx.id);
  res.json(updated);
});

module.exports = router;
