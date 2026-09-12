const db = require("../db");
const { getActiveHouseholdId } = require("../household");
const { buildCategorizer, saveRule } = require("../categorize");
const { normalizeDescription } = require("../util");

async function list(user, payload) {
  const { accountId, month } = payload || {};
  const householdId = await getActiveHouseholdId(user);

  const where = { householdId };
  if (accountId) where.accountId = accountId;
  if (month) where.date = { startsWith: month };

  return db.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
}

/**
 * Manually-entered — never treated as a possible duplicate of an existing
 * row (see appscript/Transactions.gs's handleTransactionsCreate_ for the
 * same reasoning: two genuinely separate $5 coffees on the same day are
 * both real), so no dedupKey collision check here at all.
 */
async function create(user, payload) {
  const { accountId, amount, categoryId, description } = payload || {};
  const householdId = await getActiveHouseholdId(user);

  const account = await db.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("account not found");

  const amountNum = Number(amount);
  if (amount == null || Number.isNaN(amountNum)) throw new Error("amount is required");
  if (!categoryId) throw new Error("category is required");

  const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
  if (!category) throw new Error("category not found");

  const finalDescription = (description || "").trim() || category.name;

  return db.transaction.create({
    data: {
      householdId,
      accountId,
      date: new Date().toISOString().slice(0, 10),
      description: finalDescription,
      normalizedDescription: normalizeDescription(finalDescription),
      amount: amountNum,
      categoryId,
      createdByUserId: user.id,
      dedupKey: `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    },
  });
}

async function update(user, payload) {
  const { id, categoryId, reviewed, applyRule } = payload || {};
  const householdId = await getActiveHouseholdId(user);

  const tx = await db.transaction.findFirst({ where: { id, householdId } });
  if (!tx) throw new Error("not found");

  const data = {};
  if (categoryId !== undefined) {
    data.categoryId = categoryId;
    if (applyRule) await saveRule(householdId, tx.normalizedDescription, categoryId);
  }
  if (reviewed !== undefined) data.reviewed = Boolean(reviewed);

  return db.transaction.update({ where: { id }, data });
}

/** Idempotent — same reasoning as accounts.remove. */
async function remove(user, payload) {
  const { id } = payload || {};
  const householdId = await getActiveHouseholdId(user);
  const tx = await db.transaction.findFirst({ where: { id, householdId } });
  if (!tx) return { ok: true };

  await db.transaction.delete({ where: { id } });
  return { ok: true };
}

/** Combines accounts + categories into one round trip for the Add Transaction form — see appscript/Transactions.gs's handleTransactionsFormOptions_ for why (halves a real network round-trip cost). */
async function formOptions(user) {
  const householdId = await getActiveHouseholdId(user);
  const [accounts, categories] = await Promise.all([
    db.account.findMany({ where: { householdId } }),
    db.category.findMany({ where: { householdId } }),
  ]);
  return { accounts, categories };
}

/**
 * TODO (not ported yet — appscript/Transactions.gs's importTransactionRows_,
 * handleTransactionsImportCsv_): CSV statement parsing (appscript/Csv.gs)
 * and the dedup-by-dedupKey-set import loop. Straightforward port once
 * needed — the categorizer/dedup logic translates directly, this was left
 * out of the initial scaffold to keep it reviewable.
 */

module.exports = { list, create, update, remove, formOptions };
