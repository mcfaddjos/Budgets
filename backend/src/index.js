require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { dispatch } = require("./dispatch");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api", async (req, res) => {
  const { action, token, payload } = req.body || {};
  try {
    const data = await dispatch(action, token, payload);
    res.json({ ok: true, data });
  } catch (err) {
    res.json({ ok: false, error: err.message || String(err) });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Budgets backend listening on http://localhost:${PORT}`);
});
