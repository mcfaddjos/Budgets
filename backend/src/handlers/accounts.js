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
 *
 * ownerUserIds is plaintext (a list of user ids, not financial content —
 * see schema.prisma's note on Account) — defaults to just the creator, a
 * single-owner account like a personal credit card. A shared account
 * (e.g. a household savings account) passes more than one id.
 */
async function create(user, payload) {
  const { encryptedData, nonce, ownerUserIds } = payload || {};
  if (!encryptedData || !nonce) throw new Error("encryptedData and nonce are required");
  const householdId = await getActiveHouseholdId(user);

  const owners = ownerUserIds && ownerUserIds.length > 0 ? ownerUserIds : [user.id];
  const validOwners = await db.householdMember.count({
    where: { householdId, userId: { in: owners } },
  });
  if (validOwners !== owners.length) throw new Error("ownerUserIds must all be members of this household");

  return db.account.create({ data: { householdId, encryptedData, nonce, ownerUserIds: owners } });
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
