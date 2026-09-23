const db = require("../db");
const { getActiveHouseholdId } = require("../household");

/**
 * Household-level preferences that aren't financial content themselves —
 * currently just the receipt-image retention toggle (PRD §8.6) — so they
 * stay plaintext rather than going through encryptedData/nonce like every
 * other model.
 */
async function getSettings(user) {
  const householdId = await getActiveHouseholdId(user);
  const household = await db.household.findUnique({ where: { id: householdId } });
  return { keepReceiptImages: household.keepReceiptImages };
}

async function setKeepReceiptImages(user, payload) {
  const { keepReceiptImages } = payload || {};
  if (typeof keepReceiptImages !== "boolean") throw new Error("keepReceiptImages must be a boolean");
  const householdId = await getActiveHouseholdId(user);
  const household = await db.household.update({ where: { id: householdId }, data: { keepReceiptImages } });
  return { keepReceiptImages: household.keepReceiptImages };
}

module.exports = { getSettings, setKeepReceiptImages };
