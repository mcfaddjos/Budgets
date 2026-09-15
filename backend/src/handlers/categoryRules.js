const db = require("../db");
const { getActiveHouseholdId } = require("../household");

async function list(user) {
  const householdId = await getActiveHouseholdId(user);
  return db.categoryRule.findMany({ where: { householdId } });
}

/**
 * pattern lives inside encryptedData (§10a) — matching a transaction's
 * description against a household's rules, and checking whether an
 * equivalent rule already exists, both happen client-side now (decrypt,
 * compare, then decide whether to create). Replaces the old server-side
 * saveRule() that ran as a side effect of transactions.update; the client
 * now calls this directly right after it decides a rule should be saved.
 */
async function create(user, payload) {
  const { categoryId, encryptedData, nonce } = payload || {};
  if (!categoryId || !encryptedData || !nonce) {
    throw new Error("categoryId, encryptedData, and nonce are required");
  }
  const householdId = await getActiveHouseholdId(user);

  const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
  if (!category) throw new Error("category not found");

  return db.categoryRule.create({ data: { householdId, categoryId, encryptedData, nonce } });
}

module.exports = { list, create };
