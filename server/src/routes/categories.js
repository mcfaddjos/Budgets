const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const categories = db
    .prepare("SELECT * FROM categories WHERE user_id = ? ORDER BY name")
    .all(req.user.id);
  res.json(categories);
});

router.post("/", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const result = db
      .prepare("INSERT INTO categories (user_id, name) VALUES (?, ?)")
      .run(req.user.id, name.trim());
    const category = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "category already exists" });
    }
    throw err;
  }
});

module.exports = router;
