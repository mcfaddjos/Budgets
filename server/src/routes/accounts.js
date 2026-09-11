const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const accounts = db
    .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at")
    .all(req.user.id);
  res.json(accounts);
});

router.post("/", (req, res) => {
  const { name, type, institution } = req.body || {};
  if (!name || !["credit", "checking", "savings"].includes(type)) {
    return res
      .status(400)
      .json({ error: "name and type (credit|checking|savings) are required" });
  }

  const result = db
    .prepare(
      "INSERT INTO accounts (user_id, name, type, institution) VALUES (?, ?, ?, ?)"
    )
    .run(req.user.id, name, type, institution || null);

  const account = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json(account);
});

router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

module.exports = router;
