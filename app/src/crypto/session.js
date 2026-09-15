// In-memory only, on purpose (§10a): the vault passphrase's entire job is
// to keep the private key and every household DEK off disk in plaintext.
// Metro Fast Refresh resets this module during development the same way
// it resets api/client.js's in-memory token — that's fine, it just means
// re-entering the vault passphrase, not a security gap.
let publicKey = null;
let privateKey = null;
let deksByHousehold = {};

export function setUnlockedIdentity(pk, priv) {
  publicKey = pk;
  privateKey = priv;
}

export function getPublicKey() {
  if (!publicKey) throw new Error("Vault is locked — sign in again");
  return publicKey;
}

export function getPrivateKey() {
  if (!privateKey) throw new Error("Vault is locked — sign in again");
  return privateKey;
}

export function isUnlocked() {
  return Boolean(privateKey);
}

export function setHouseholdDek(householdId, dek) {
  deksByHousehold[householdId] = dek;
}

export function getHouseholdDek(householdId) {
  const dek = deksByHousehold[householdId];
  if (!dek) throw new Error("No unlocked key for this household yet");
  return dek;
}

export function hasHouseholdDek(householdId) {
  return Boolean(deksByHousehold[householdId]);
}

export function lockVault() {
  publicKey = null;
  privateKey = null;
  deksByHousehold = {};
}
