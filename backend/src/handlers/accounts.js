const db = require("../db");
const { getActiveHouseholdId } = require("../household");

async function list(user) {
  const householdId = await getActiveHouseholdId(user);
  return db.account.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } });
}

/**
 * name/type/institution live inside encryptedData (§10a) — the server
 * can no longer validate account type or read anything about the
 * content, only that ciphertext was actually provided.
 */
async function create(user, payload) {
  const { encryptedData, nonce } = payload || {};
  if (!encryptedData || !nonce) throw new Error("encryptedData and nonce are required");
  const householdId = await getActiveHouseholdId(user);
  return db.account.create({ data: { householdId, encryptedData, nonce } });
}

/** Idempotent — see appscript/Accounts.gs's handleAccountsDelete_ for why: a retried delete of an already-gone row is success, not an error. */
async function remove(user, payload) {
  const { id } = payload || {};
  const householdId = await getActiveHouseholdId(user);
  const account = await db.account.findFirst({ where: { id, householdId } });
  if (!account) return { ok: true };

  await db.account.delete({ where: { id } }); // Transaction rows cascade via the schema's onDelete: Cascade
  return { ok: true };
}

module.exports = { list, create, remove };
