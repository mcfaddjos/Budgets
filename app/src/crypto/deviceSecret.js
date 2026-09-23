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
// §10d closes the gap noted above: a device with no working key material
// yet (never registered here, or storage was cleared) now has two ways
// back in — recovery-code redemption, or pairing with an already-unlocked
// device — both additive (a new UserDevice row), never touching any other
// device's key material. See AuthContext.js's recoverAccess/pairing
// functions and PRD §10d for the full design.
import * as SecureStore from "expo-secure-store";
import sodium, { readySodium, toBase64 } from "./sodium";

const STORAGE_KEY = "budgets_vault_secret_v1";
const DEVICE_ID_KEY = "budgets_device_id_v1";

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

/**
 * This device's UserDevice.id (§10d) — assigned by the server the first
 * time this device ever registers key material (new household, invite
 * redemption, recovery-code redemption, or device pairing) and persisted
 * here so every later auth.login/auth.me call can identify which device
 * is asking. Not a secret itself (an opaque id, not key material) — just
 * needs to survive restarts the same way the vault secret does.
 */
export async function getDeviceId() {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

export async function setDeviceId(deviceId) {
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
}
