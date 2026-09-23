// Key management per PRD §10a: Google Sign-In authenticates identity;
// everything in this file is the separate, server-never-sees-it chain
// that actually protects data — a vault passphrase unlocks a per-user
// keypair, which household members use to pass around a shared DEK
// (Data Encryption Key) without the server ever holding it.
import sodium, { readySodium, toBase64, fromBase64, fromUtf8 } from "./sodium";

// INTERACTIVE limits, not MODERATE/SENSITIVE: this runs on login/signup on
// phones of varying age, and a stronger limit risks OOM on low-RAM
// devices for a KDF that only needs to resist an attacker who doesn't
// have the device itself (the vault passphrase never leaves it).
async function deriveVaultKey(passphrase, salt) {
  await readySodium();
  return sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );
}

/**
 * Run once, at signup: generates this user's box keypair and encrypts the
 * private key with a key derived from their chosen vault passphrase.
 * Everything in the returned `forServer` object is safe to send to the
 * server — it's ciphertext, a salt, and a public key. `privateKey` is not:
 * it's the caller's job to hold that only in memory (session.js), never
 * transmit or persist it.
 */
export async function createUserKeyMaterial(passphrase) {
  await readySodium();
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  const vaultKdfSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const vaultKey = await deriveVaultKey(passphrase, vaultKdfSalt);
  const privateKeyNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encryptedPrivateKey = sodium.crypto_secretbox_easy(privateKey, privateKeyNonce, vaultKey);

  return {
    privateKey,
    forServer: {
      publicKey: toBase64(publicKey),
      encryptedPrivateKey: toBase64(encryptedPrivateKey),
      privateKeyNonce: toBase64(privateKeyNonce),
      vaultKdfSalt: toBase64(vaultKdfSalt),
    },
  };
}

/**
 * Run on every login (or unlock after backgrounding): re-derives the
 * vault key from the passphrase and unwraps the private key. Throws if
 * the passphrase is wrong — crypto_secretbox_open_easy fails closed
 * rather than returning garbage.
 */
export async function unlockPrivateKey({ passphrase, vaultKdfSalt, encryptedPrivateKey, privateKeyNonce }) {
  await readySodium();
  const vaultKey = await deriveVaultKey(passphrase, fromBase64(vaultKdfSalt));
  const privateKey = sodium.crypto_secretbox_open_easy(
    fromBase64(encryptedPrivateKey),
    fromBase64(privateKeyNonce),
    vaultKey
  );
  return privateKey; // Uint8Array — hold in memory only, never persist
}

/** Run once, at household creation. */
export async function generateHouseholdDek() {
  await readySodium();
  return sodium.crypto_secretbox_keygen();
}

/**
 * Wraps the household DEK to a specific member's public key (sealed box —
 * no nonce needed, an ephemeral keypair rides inside the ciphertext).
 * Used both when creating a household (wrap to yourself) and when an
 * existing member invites someone new (wrap to the invitee's public key,
 * §5b) — the server only ever relays the result.
 */
export function wrapDekForMember(dek, memberPublicKeyB64) {
  const sealed = sodium.crypto_box_seal(dek, fromBase64(memberPublicKeyB64));
  return toBase64(sealed);
}

/** The inverse of wrapDekForMember, run with your own unlocked keypair. */
export function unwrapDek(wrappedDekB64, publicKeyB64, privateKey) {
  return sodium.crypto_box_seal_open(fromBase64(wrappedDekB64), fromBase64(publicKeyB64), privateKey);
}

/**
 * Account recovery (§10a): a high-entropy random key, shown to the user
 * exactly once at join time to store themselves. Deliberately *not*
 * derived from a human-memorable secret — unlike the vault passphrase, it
 * only has to be looked up during recovery, never typed from memory, so
 * there's no reason to accept the weaker entropy a memorable code implies.
 */
export async function generateRecoveryKey() {
  await readySodium();
  return sodium.crypto_secretbox_keygen();
}

export function wrapDekWithRecoveryKey(dek, recoveryKey) {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(dek, nonce, recoveryKey);
  return { recoveryWrappedDek: toBase64(ciphertext), recoveryDekNonce: toBase64(nonce) };
}

export function unwrapDekWithRecoveryKey(recoveryWrappedDekB64, recoveryDekNonceB64, recoveryKey) {
  return sodium.crypto_secretbox_open_easy(
    fromBase64(recoveryWrappedDekB64),
    fromBase64(recoveryDekNonceB64),
    recoveryKey
  );
}

/** Encode a recovery key for display/copy — base64 is what gets stored/wrapped either way. */
export function recoveryKeyToDisplayString(recoveryKey) {
  return toBase64(recoveryKey);
}

export function recoveryKeyFromDisplayString(str) {
  return fromBase64(str);
}

/**
 * Device pairing (§10d): the out-of-band secret an already-unlocked device
 * generates and shows/types to a new device, so the new device can join
 * without a pre-saved recovery code. Never sent to the server in any form
 * — only the MAC it produces (below) travels through the pairing-session
 * relay, and only after the granting device has verified that MAC locally
 * does it ever wrap the real DEK. crypto_auth's key size doubles as a
 * reasonable secret size — no separate derivation step needed.
 */
export async function generatePairingSecret() {
  await readySodium();
  return sodium.randombytes_buf(sodium.crypto_auth_KEYBYTES);
}

export function pairingSecretToDisplayString(secret) {
  return toBase64(secret);
}

export function pairingSecretFromDisplayString(str) {
  return fromBase64(str);
}

/**
 * Computed by the joining device over its own (base64-encoded) public key
 * and sent alongside it — proves to the granting device that whoever
 * submitted this public key actually read the pairing code, not just
 * relayed by (or substituted by) the server in between.
 */
export function computePairingMac(pairingSecret, publicKeyB64) {
  return toBase64(sodium.crypto_auth(fromUtf8(publicKeyB64), pairingSecret));
}

/** Run by the granting device before it ever wraps the DEK for the submitted public key. */
export function verifyPairingMac(pairingSecret, publicKeyB64, macB64) {
  return sodium.crypto_auth_verify(fromBase64(macB64), fromUtf8(publicKeyB64), pairingSecret);
}
