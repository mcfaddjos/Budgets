const db = require("../db");
const { getActiveHouseholdId } = require("../household");

const ACCOUNT_TYPES = ["checking", "savings"];

async function list(user) {
  const householdId = await getActiveHouseholdId(user);
  return db.account.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } });
}

async function create(user, payload) {
  const { name, type, institution } = payload || {};
  if (!name || !ACCOUNT_TYPES.includes(type)) {
    throw new Error("name and type (checking|savings) are required");
  }
  const householdId = await getActiveHouseholdId(user);
  return db.account.create({ data: { householdId, name, type, institution: institution || null } });
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
