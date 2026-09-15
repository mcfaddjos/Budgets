const db = require("../db");
const { getActiveHouseholdId } = require("../household");
const { currentMonth } = require("../util");

/**
 * Totals/actual-vs-budget/variance computation moved entirely client-side
 * (§10a) — amount lives inside encryptedData, so the server can no longer
 * sum it. This just returns the raw rows for the month; the client
 * decrypts and does the same aggregation this handler used to do here.
 */
async function get(user, payload) {
  const month = (payload && payload.month) || currentMonth();
  const householdId = await getActiveHouseholdId(user);

  const [categories, budgets, transactions] = await Promise.all([
    db.category.findMany({ where: { householdId } }),
    db.budget.findMany({ where: { householdId, month } }),
    db.transaction.findMany({ where: { householdId, date: { startsWith: month } } }),
  ]);

  return { month, categories, budgets, transactions };
}

/** amount lives inside encryptedData (§10a) — the server just stores whatever ciphertext it's given for this category/month. */
async function set(user, payload) {
  const { categoryId, month, encryptedData, nonce } = payload || {};
  if (!categoryId || !month || !encryptedData || !nonce) {
    throw new Error("categoryId, month (YYYY-MM), encryptedData, and nonce are required");
  }
  const householdId = await getActiveHouseholdId(user);

  const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
  if (!category) throw new Error("category not found");

  return db.budget.upsert({
    where: { householdId_categoryId_month: { householdId, categoryId, month } },
    update: { encryptedData, nonce },
    create: { householdId, categoryId, month, encryptedData, nonce },
  });
}

module.exports = { get, set };
