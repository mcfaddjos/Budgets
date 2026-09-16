const db = require("../db");
const { getActiveHouseholdId } = require("../household");

// No orderBy: name lives inside encryptedData (§10a), so alphabetical
// ordering — like duplicate-name checking — moves to the client, which
// sorts after decrypting.
async function list(user) {
  const householdId = await getActiveHouseholdId(user);
  return db.category.findMany({ where: { householdId } });
}

/**
 * name lives inside encryptedData (§10a) — duplicate-name checking is no
 * longer possible server-side (ciphertext isn't comparable) and moves to
 * the client: decrypt the household's categories, check for a collision,
 * before calling this.
 */
async function create(user, payload) {
  const { encryptedData, nonce } = payload || {};
  if (!encryptedData || !nonce) throw new Error("encryptedData and nonce are required");
  const householdId = await getActiveHouseholdId(user);
  return db.category.create({ data: { householdId, encryptedData, nonce } });
}

/**
 * Bulk variant for seeding the default category set right after a new
 * household is created. The old appscript/Postgres-scaffold behavior did
 * this server-side (seedDefaultCategories) using plaintext names — that's
 * no longer possible at all, since the server never holds the household
 * DEK needed to encrypt them (§10a). The client does this instead,
 * immediately after registerNewHousehold succeeds, using its own copy of
 * the default category list (app/src/categorize/defaults.js).
 */
async function createMany(user, payload) {
  const { categories } = payload || {};
  if (!Array.isArray(categories) || categories.length === 0) throw new Error("categories array is required");
  if (categories.some((c) => !c || !c.encryptedData || !c.nonce)) {
    throw new Error("every category needs encryptedData and nonce");
  }
  const householdId = await getActiveHouseholdId(user);
  await db.category.createMany({
    data: categories.map(({ encryptedData, nonce }) => ({ householdId, encryptedData, nonce })),
  });
  return { ok: true };
}

async function update(user, payload) {
  const { id, encryptedData, nonce } = payload || {};
  if (!encryptedData || !nonce) throw new Error("encryptedData and nonce are required");
  const householdId = await getActiveHouseholdId(user);

  const category = await db.category.findFirst({ where: { id, householdId } });
  if (!category) throw new Error("category not found");

  return db.category.update({ where: { id }, data: { encryptedData, nonce } });
}

module.exports = { list, create, createMany, update };
