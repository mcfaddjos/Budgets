const db = require("../db");
const { getActiveHouseholdId } = require("../household");

async function list(user, payload) {
  const { accountId, month } = payload || {};
  const householdId = await getActiveHouseholdId(user);

  const where = { householdId };
  if (accountId) where.accountId = accountId;
  if (month) where.date = { startsWith: month };

  return db.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
}

/**
 * description/normalizedDescription/amount live inside encryptedData
 * (§10a), computed and encrypted client-side — including the old "default
 * description to the category's name if left blank" behavior, which the
 * server can no longer do itself since it can't read the category name
 * either.
 *
 * dedupKey's *meaning* is entirely the client's choice, not something the
 * server interprets: a statement import should pass the keyed content
 * hash from app/src/crypto/records.js (computeDedupKey) so re-importing
 * an overlapping statement gets rejected by the unique constraint below;
 * a manual entry should pass a random value instead (e.g. a fresh uuid)
 * so two genuinely separate but identical-looking manual entries — "two
 * $5 coffees on the same day" — both succeed, same as before. The server
 * just enforces per-account uniqueness on whatever it's given.
 */
async function create(user, payload) {
  const { accountId, categoryId, date, encryptedData, nonce, dedupKey } = payload || {};
  if (!encryptedData || !nonce || !dedupKey) throw new Error("encryptedData, nonce, and dedupKey are required");
  if (!date) throw new Error("date is required");
  const householdId = await getActiveHouseholdId(user);

  const account = await db.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("account not found");

  if (categoryId) {
    const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
    if (!category) throw new Error("category not found");
  }

  return db.transaction.create({
    data: {
      householdId,
      accountId,
      categoryId: categoryId || null,
      date,
      encryptedData,
      nonce,
      dedupKey,
      createdByUserId: user.id,
    },
  });
}

/**
 * applyRule used to trigger a server-side saveRule() call — the client now
 * calls categoryRules.create itself beforehand (it's the only side that
 * can read the description to derive a pattern from), so this handler
 * just updates the plaintext fields it's always been allowed to see
 * (categoryId, reviewed, accountId, date), plus the opaque encryptedData
 * blob — same validation as create() for accountId/categoryId, since a
 * full edit (PRD's transaction-edit feature) can move a transaction to a
 * different account/category, not just recategorize it.
 */
async function update(user, payload) {
  const { id, categoryId, reviewed, accountId, date, encryptedData, nonce } = payload || {};
  const householdId = await getActiveHouseholdId(user);

  const tx = await db.transaction.findFirst({ where: { id, householdId } });
  if (!tx) throw new Error("not found");

  const data = {};
  if (categoryId !== undefined) {
    if (categoryId) {
      const category = await db.category.findFirst({ where: { id: categoryId, householdId } });
      if (!category) throw new Error("category not found");
    }
    data.categoryId = categoryId;
  }
  if (reviewed !== undefined) data.reviewed = Boolean(reviewed);
  if (accountId !== undefined) {
    const account = await db.account.findFirst({ where: { id: accountId, householdId } });
    if (!account) throw new Error("account not found");
    data.accountId = accountId;
  }
  if (date !== undefined) data.date = date;
  if (encryptedData !== undefined || nonce !== undefined) {
    if (!encryptedData || !nonce) throw new Error("encryptedData and nonce must be provided together");
    data.encryptedData = encryptedData;
    data.nonce = nonce;
  }

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
 * CSV statement import (PRD §8.1) isn't ported yet, and unlike the rest of
 * this file, it can never be a thin server-side loop the way appscript's
 * importTransactionRows_ was — parsing, categorization, and dedup-key
 * computation all need the plaintext description, which only ever exists
 * on-device (§10a). It has to run entirely client-side: parse the CSV,
 * categorize and dedup locally against already-decrypted rows, then call
 * create() once per row that isn't a duplicate.
 */

module.exports = { list, create, update, remove, formOptions };
