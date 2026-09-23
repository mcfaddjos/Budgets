const db = require("../db");
const { getActiveHouseholdId } = require("../household");

/**
 * The server never decides *whether* to keep an image — that's the
 * household.keepReceiptImages preference, read and enforced entirely
 * client-side before it ever calls upload() (the app just never uploads
 * one if the setting is off). This handler only ever stores/returns
 * whatever ciphertext it's given, same as transactions.encryptedData.
 */
async function upload(user, payload) {
  const { transactionId, encryptedData, nonce } = payload || {};
  if (!transactionId || !encryptedData || !nonce) {
    throw new Error("transactionId, encryptedData, and nonce are required");
  }
  const householdId = await getActiveHouseholdId(user);

  const tx = await db.transaction.findFirst({ where: { id: transactionId, householdId } });
  if (!tx) throw new Error("transaction not found");

  return db.transactionReceiptImage.upsert({
    where: { transactionId },
    create: { transactionId, encryptedData, nonce },
    update: { encryptedData, nonce },
  });
}

async function get(user, payload) {
  const { transactionId } = payload || {};
  if (!transactionId) throw new Error("transactionId is required");
  const householdId = await getActiveHouseholdId(user);

  const tx = await db.transaction.findFirst({ where: { id: transactionId, householdId } });
  if (!tx) throw new Error("transaction not found");

  return db.transactionReceiptImage.findUnique({ where: { transactionId } });
}

module.exports = { upload, get };
