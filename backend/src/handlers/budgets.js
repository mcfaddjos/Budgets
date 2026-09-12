const db = require("../db");
const { getActiveHouseholdId } = require("../household");
const { currentMonth } = require("../util");

async function get(user, payload) {
  const month = (payload && payload.month) || currentMonth();
  const householdId = await getActiveHouseholdId(user);

  const [categories, budgets, transactions] = await Promise.all([
    db.category.findMany({ where: { householdId } }),
    db.budget.findMany({ where: { householdId, month } }),
    db.transaction.findMany({ where: { householdId, date: { startsWith: month } } }),
  ]);

  const categoryRows = categories
    .map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const budgetAmount = budget ? budget.amount : 0;
      const actual = transactions
        .filter((t) => t.categoryId === c.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        categoryId: c.id,
        categoryName: c.name,
        budgetAmount,
        actual,
        variance: budgetAmount - actual,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const totals = categoryRows.reduce(
    (acc, c) => ({ budget: acc.budget + c.budgetAmount, actual: acc.actual + c.actual }),
    { budget: 0, actual: 0 }
  );
  totals.variance = totals.budget - totals.actual;

  return { month, categories: categoryRows, totals };
}

async function set(user, payload) {
  const { categoryId, month, amount } = payload || {};
  if (!categoryId || !month || amount == null) {
    throw new Error("categoryId, month (YYYY-MM), and amount are required");
  }
  const householdId = await getActiveHouseholdId(user);

  const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
  if (!category) throw new Error("category not found");

  return db.budget.upsert({
    where: { householdId_categoryId_month: { householdId, categoryId, month } },
    update: { amount },
    create: { householdId, categoryId, month, amount },
  });
}

// TODO (not ported yet — appscript/Budgets.gs's handleBudgetsImportQuickAdd_):
// no QuickAdd-sheet equivalent exists for a Postgres backend yet; the whole
// "type into a spreadsheet, sync into canonical tables" mechanism was a
// Sheets-specific convenience. Worth deciding whether it's still wanted
// (e.g. as a CSV upload of budget rows) or was really just a workaround for
// Apps Script not having a real manual-entry UI in the app — the app now
// has "+ Add Category" and the budget editor doing that job directly.

module.exports = { get, set };
