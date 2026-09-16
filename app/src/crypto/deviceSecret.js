// §10c: replaces a human-typed/memorized vault passphrase with a random
// secret generated once per device and held in the OS's own secure
// storage (Android Keystore / iOS Keychain via expo-secure-store,
// encrypted at rest regardless of the options below) — fed into the exact
// same createUserKeyMaterial/unlockPrivateKey functions in keys.js that
// used to take a typed passphrase. Nothing about the encryption chain
// itself changes, only where the "passphrase" string comes from.
//
// Not gated behind a biometric/PIN prompt on top of that (yet) —
// `requireAuthentication` support varies enough across Android versions/
// manufacturers that it risked making the unlock flaky; worth adding back
// as a follow-up once there's a device matrix to test it against.
//
// Known gap (§10c, logged in PRD): a device that never had this secret
// generated (a genuinely new device, or reinstalling after clearing app
// data) has no way to recover an existing account's private key — that
// requires a recovery-code redemption flow that doesn't exist yet.
import * as SecureStore from "expo-secure-store";
import sodium, { readySodium, toBase64 } from "./sodium";

const STORAGE_KEY = "budgets_vault_secret_v1";

/**
 * Returns this device's vault secret, generating and storing one the
 * first time it's ever called. Always the same value on every later call
 * on this device (across accounts, restarts, reinstalled JS bundles —
 * SecureStore data survives an app update, not a full uninstall).
 */
export async function getOrCreateVaultSecret() {
  const existing = await SecureStore.getItemAsync(STORAGE_KEY);
  if (existing) return existing;

  await readySodium();
  const secret = toBase64(sodium.randombytes_buf(32));
  await SecureStore.setItemAsync(STORAGE_KEY, secret, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  return secret;
}
