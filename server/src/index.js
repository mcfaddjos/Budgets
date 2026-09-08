const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./auth");

const authRoutes = require("./routes/auth");
const accountsRoutes = require("./routes/accounts");
const categoriesRoutes = require("./routes/categories");
const transactionsRoutes = require("./routes/transactions");
const importRoutes = require("./routes/import");
const budgetsRoutes = require("./routes/budgets");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/accounts", requireAuth, accountsRoutes);
app.use("/api/categories", requireAuth, categoriesRoutes);
app.use("/api/transactions", requireAuth, transactionsRoutes);
app.use("/api/accounts", requireAuth, importRoutes);
app.use("/api/budgets", requireAuth, budgetsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budgets API listening on http://0.0.0.0:${PORT}`);
});
