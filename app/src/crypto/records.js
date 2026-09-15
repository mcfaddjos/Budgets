// Encrypts/decrypts the sensitive-field payloads stored in each model's
// encryptedData/nonce columns (§10a) — Account, Category, CategoryRule,
// Transaction, Budget all use the same shape, keyed by the household DEK.
import sodium, { readySodium, toBase64, fromBase64, toHex, fromUtf8, toUtf8 } from "./sodium";

export async function encryptRecord(dek, fields) {
  await readySodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = fromUtf8(JSON.stringify(fields));
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, dek);
  return {
    encryptedData: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

export async function decryptRecord(dek, encryptedData, nonce) {
  await readySodium();
  const plaintext = sodium.crypto_secretbox_open_easy(fromBase64(encryptedData), fromBase64(nonce), dek);
  return JSON.parse(toUtf8(plaintext));
}

// Domain-separated subkey so the dedup fingerprint doesn't reuse the DEK
// directly as a MAC key — same DEK, different purpose, distinct derived
// key (cheap key-hygiene win, not a real key-management burden since it's
// deterministic from the DEK alone, nothing extra to store or share).
const DEDUP_CONTEXT = "budgets-dedup-key-v1";

async function deriveDedupSubkey(dek) {
  await readySodium();
  return sodium.crypto_generichash(sodium.crypto_generichash_KEYBYTES, fromUtf8(DEDUP_CONTEXT), dek);
}

/**
 * Deterministic, keyed fingerprint of (date, amount, normalizedDescription)
 * used for the DB's per-account uniqueness constraint (§9/schema) — lets
 * the server reject duplicate transactions without ever seeing the values
 * that make a transaction a duplicate.
 */
export async function computeDedupKey(dek, { date, amount, normalizedDescription }) {
  await readySodium();
  const subkey = await deriveDedupSubkey(dek);
  const message = fromUtf8(`${date}|${amount}|${normalizedDescription}`);
  const hash = sodium.crypto_generichash(32, message, subkey);
  return toHex(hash);
}
