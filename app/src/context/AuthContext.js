import { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { api, loadPersistedSession, setToken, getServerUrl, setServerUrl } from "../api/client";
import { signInWithGoogle, signOutOfGoogle } from "../auth/google";
import * as keys from "../crypto/keys";
import * as records from "../crypto/records";
import * as session from "../crypto/session";
import { getOrCreateVaultSecret, getDeviceId, setDeviceId as persistDeviceId } from "../crypto/deviceSecret";
import { DEFAULT_CATEGORIES } from "../categorize/defaults";

const AuthContext = createContext(null);

const DEFAULT_DEVICE_NAME = Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android" : "Device";

/**
 * Unwraps every membership's household DEK the caller's private key can
 * open (§10a) and loads it into session.js. Memberships with wrappedDek
 * still null (a device awaiting an access grant — see backend
 * handlers/auth.js) are left alone; the caller checks
 * session.hasHouseholdDek(householdId) to tell the two states apart.
 */
function unlockAvailableDeks(memberships, publicKeyB64) {
  for (const m of memberships) {
    if (m.wrappedDek && !session.hasHouseholdDek(m.householdId)) {
      const dek = keys.unwrapDek(m.wrappedDek, publicKeyB64, session.getPrivateKey());
      session.setHouseholdDek(m.householdId, dek);
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [keyMaterial, setKeyMaterial] = useState(null); // publicKey/encryptedPrivateKey/privateKeyNonce/vaultKdfSalt for THIS device, or all-null if this device has none yet (§10d)
  const [deviceId, setDeviceIdState] = useState(null); // this device's UserDevice.id, once the server has confirmed or assigned one
  const [memberships, setMemberships] = useState([]);
  const [unlocked, setUnlocked] = useState(false); // mirrors session.isUnlocked(), kept in React state so the UI re-renders
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState(null); // { householdId, code } — shown once, then acknowledged away
  const [unlockError, setUnlockError] = useState(null); // set when this device HAS key material but unlocking it still failed (a real anomaly, not the common "new device" case)
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  // v1 is single-household (§5b leaves room for more later) — the first
  // membership that's actually unlocked (has a DEK loaded) is "the"
  // household the rest of the app operates on. A membership stuck at
  // wrappedDek === null (pending an access grant) never counts here, even
  // though it's already in `memberships` — that's what tells App.js to
  // show the "waiting for access" screen instead of the normal tabs.
  const activeHouseholdId = memberships.find((m) => session.hasHouseholdDek(m.householdId))?.householdId || null;

  // First real use of the OWNER/MEMBER role from §5a — previously stored
  // but never checked anywhere. A household's creator is always OWNER
  // (see registerNewHousehold below); invited members are MEMBER.
  const isHouseholdOwner = memberships.find((m) => m.householdId === activeHouseholdId)?.role === "OWNER";

  // §10d: identity resolved, definitely not unlocked, and the server
  // confirmed this device has never been added to this account — distinct
  // from unlockError (this device HAD key material and decrypting it
  // still failed, a genuine anomaly). UnlockScreen branches on this to
  // show "use a recovery code / pair with another device" instead of a
  // bare retry.
  const deviceNeedsSetup = ready && !unlocked && !!user && !keyMaterial?.publicKey;

  useEffect(() => {
    loadPersistedSession().then(async ({ serverUrl: url, token }) => {
      setServerUrlState(url);
      if (token) {
        try {
          const storedDeviceId = await getDeviceId();
          // silent: a stale/invalid stored token here is an expected,
          // self-healing outcome (e.g. switching the app to a different
          // backend), not a bug worth surfacing to Logcat.
          const me = await api.me(storedDeviceId, { silent: true });
          await applyIdentity(me);
          if (me.deviceId) {
            // Uses `me` directly rather than the `keyMaterial` state just
            // set above — that state update hasn't landed yet in this
            // same tick, so reading it here would see the stale (null)
            // value from before this effect ran.
            await unlockWithKeyMaterial(buildKeyMaterial(me), me.memberships || []).catch((err) =>
              setUnlockError(err.message)
            );
          }
          // me.deviceId === null means this device has never been added
          // to this account — nothing to unlock yet, deviceNeedsSetup
          // above covers the UI for that; not an error.
        } catch (err) {
          // Only a genuine server rejection (expired/invalid token) means the
          // stored token is actually bad — a network blip says nothing about
          // the token's validity, so leave it in storage for a later retry.
          if (err.isApiError) await setToken(null);
        }
      }
      setReady(true);
    });
  }, []);

  function buildKeyMaterial(response) {
    return {
      publicKey: response.publicKey,
      encryptedPrivateKey: response.encryptedPrivateKey,
      privateKeyNonce: response.privateKeyNonce,
      vaultKdfSalt: response.vaultKdfSalt,
    };
  }

  /** Common shape of auth.me/auth.login/registration responses — sets identity/membership/device state, but does not unlock the vault. */
  async function applyIdentity(response) {
    setUser({ id: response.id, email: response.email, name: response.name });
    setKeyMaterial(buildKeyMaterial(response));
    setMemberships(response.memberships || []);
    setDeviceIdState(response.deviceId || null);
    // Only ever written when the server actually confirms/assigns one —
    // never overwrites existing local storage with null, since that would
    // just be this specific call's outcome, not proof the old id is bad.
    if (response.deviceId) await persistDeviceId(response.deviceId);
  }

  async function updateServerUrl(url) {
    await setServerUrl(url);
    setServerUrlState(url);
  }

  /**
   * Shared by unlockVault (reads current state) and the cold-start effect
   * (passes freshly-fetched data directly, since React state set moments
   * earlier in the same tick isn't readable yet) — re-derives the private
   * key from this device's stored secret (§10c). Only ever called once
   * the caller has confirmed this device has real key material (a null
   * publicKey means "no device yet," handled separately via
   * deviceNeedsSetup, not a decryption failure).
   */
  async function unlockWithKeyMaterial(km, currentMemberships) {
    setUnlockError(null);
    const secret = await getOrCreateVaultSecret();
    let privateKey;
    try {
      privateKey = await keys.unlockPrivateKey({ passphrase: secret, ...km });
    } catch {
      throw new Error(
        "Couldn't unlock this device's stored key. This is unexpected — try again, or use a recovery code if it keeps happening."
      );
    }
    session.setUnlockedIdentity(km.publicKey, privateKey);
    unlockAvailableDeks(currentMemberships, km.publicKey);
    setUnlocked(true);
  }

  /**
   * App restart / any time session.js has been cleared (Metro Fast
   * Refresh, or the process was killed) but the backend session token is
   * still valid and this device already has working key material.
   */
  async function unlockVault() {
    if (!keyMaterial?.publicKey) throw new Error("Nothing to unlock — this device has no key material yet");
    await unlockWithKeyMaterial(keyMaterial, memberships);
  }

  /**
   * New person, first Google sign-in ever, starting their own household.
   * seedDefaults lets the caller offer a choice ("start with common
   * categories, or add your own from scratch?") instead of always
   * seeding the built-in default list.
   */
  async function registerNewHousehold(seedDefaults = true) {
    const idToken = await signInWithGoogle();
    if (!idToken) return false; // user cancelled the Google sign-in sheet

    const secret = await getOrCreateVaultSecret();
    const { privateKey, forServer } = await keys.createUserKeyMaterial(secret);
    const dek = await keys.generateHouseholdDek();
    const wrappedDek = keys.wrapDekForMember(dek, forServer.publicKey);
    const recoveryKey = await keys.generateRecoveryKey();
    const { recoveryWrappedDek, recoveryDekNonce } = keys.wrapDekWithRecoveryKey(dek, recoveryKey);

    const result = await api.registerNewHousehold({
      idToken,
      ...forServer,
      wrappedDek,
      recoveryWrappedDek,
      recoveryDekNonce,
      deviceName: DEFAULT_DEVICE_NAME,
    });

    await setToken(result.token);
    await persistDeviceId(result.deviceId);
    session.setUnlockedIdentity(forServer.publicKey, privateKey);
    session.setHouseholdDek(result.householdId, dek);
    setUnlocked(true);
    await applyIdentity({
      ...result.user,
      ...forServer,
      deviceId: result.deviceId,
      memberships: [{ householdId: result.householdId, role: "OWNER", wrappedDek }],
    });

    // By this point React has already navigated away from whatever screen
    // called this (unlocked/activeHouseholdId just flipped true), so a
    // thrown error here can't reach that screen's own error UI — it would
    // otherwise fail completely silently. Log explicitly and don't let a
    // seeding failure undo an already-successful registration; the user
    // can still add categories manually from the Budgets screen.
    if (seedDefaults) {
      try {
        await seedDefaultCategories(dek);
      } catch (err) {
        console.error("[registerNewHousehold] seedDefaultCategories failed:", err.message);
      }
    }
    setPendingRecoveryCode({ householdId: result.householdId, code: keys.recoveryKeyToDisplayString(recoveryKey) });

    return true;
  }

  async function seedDefaultCategories(dek) {
    const encrypted = await Promise.all(DEFAULT_CATEGORIES.map((name) => records.encryptRecord(dek, { name })));
    await api.createDefaultCategories(encrypted);
  }

  /**
   * New person redeeming an invite. Their device starts with no DEK
   * access at all (see backend handlers/auth.js joinHouseholdViaInvite) —
   * the caller should show a "waiting for a household member to let you
   * in" state and call refreshMemberships() periodically until it clears.
   */
  async function joinHousehold(inviteCode) {
    const idToken = await signInWithGoogle();
    if (!idToken) return false;

    const secret = await getOrCreateVaultSecret();
    const { privateKey, forServer } = await keys.createUserKeyMaterial(secret);
    const result = await api.joinHouseholdViaInvite({ idToken, inviteCode, ...forServer, deviceName: DEFAULT_DEVICE_NAME });

    await setToken(result.token);
    await persistDeviceId(result.deviceId);
    session.setUnlockedIdentity(forServer.publicKey, privateKey);
    setUnlocked(true);
    await applyIdentity({
      ...result.user,
      ...forServer,
      deviceId: result.deviceId,
      memberships: [{ householdId: result.householdId, role: "MEMBER", wrappedDek: null }],
    });

    return { householdId: result.householdId, pendingKeyGrant: true };
  }

  /**
   * Polled from UnlockScreen after joinViaPairingCode, while waiting for
   * the granting device to approve this one — deliberately doesn't touch
   * Google Sign-In (unlike login() below), just re-checks this already-
   * authenticated session's access with the current session token.
   * Returns true once access has arrived and this device is unlocked.
   */
  async function checkDeviceAccess() {
    if (!deviceId) return false;
    const me = await api.me(deviceId);
    await applyIdentity(me);
    if (me.deviceId && me.memberships.some((m) => m.wrappedDek)) {
      await unlockWithKeyMaterial(buildKeyMaterial(me), me.memberships);
      return true;
    }
    return false;
  }

  /**
   * Returning user, this device. If this device has never been added to
   * this account, the server comes back with deviceId: null and no key
   * material — that's not an error (identity is still valid), it just
   * means there's nothing to unlock; deviceNeedsSetup covers the UI.
   */
  async function login() {
    const idToken = await signInWithGoogle();
    if (!idToken) return false;

    const storedDeviceId = await getDeviceId();
    const result = await api.login(idToken, storedDeviceId);
    await setToken(result.token);
    await applyIdentity(result);
    if (result.deviceId) {
      await unlockWithKeyMaterial(buildKeyMaterial(result), result.memberships || []);
    }
    return true;
  }

  /**
   * Re-fetches membership state and unwraps any DEK that's newly become
   * available since the last check (an existing member just completed a
   * grantAccess call for this device). The first time a household's DEK
   * becomes available this way, immediately sets up this member's own
   * recovery code — that requires the plaintext DEK, so it could never
   * happen earlier in joinHousehold above — and surfaces it via
   * pendingRecoveryCode for the UI to show the user once.
   */
  async function refreshMemberships() {
    const me = await api.me(deviceId);
    const publicKeyB64 = me.publicKey;
    for (const m of me.memberships) {
      const justGranted = m.wrappedDek && !session.hasHouseholdDek(m.householdId);
      if (justGranted) {
        const dek = keys.unwrapDek(m.wrappedDek, publicKeyB64, session.getPrivateKey());
        session.setHouseholdDek(m.householdId, dek);

        const recoveryKey = await keys.generateRecoveryKey();
        const { recoveryWrappedDek, recoveryDekNonce } = keys.wrapDekWithRecoveryKey(dek, recoveryKey);
        await api.setRecoveryKey(m.householdId, recoveryWrappedDek, recoveryDekNonce);
        setPendingRecoveryCode({ householdId: m.householdId, code: keys.recoveryKeyToDisplayString(recoveryKey) });
      }
    }
    setMemberships(me.memberships);
  }

  function acknowledgeRecoveryCode() {
    setPendingRecoveryCode(null);
  }

  /**
   * §10c's original gap, closed (decision, 2026-09-22, see PRD §10d):
   * called when this device has no working key material for this account
   * (deviceNeedsSetup is true). The user supplies the recovery code they
   * were shown once at setup — unwrapping the household DEK with it
   * happens entirely client-side (the server never sees the recovery
   * key). This device then generates its own fresh keypair and registers
   * it as a brand-new device — purely additive, no other device's key
   * material is touched, so anything already working keeps working.
   * v1 is single-household (§5c), so `memberships[0]` is unambiguous.
   */
  async function recoverAccess(recoveryCodeStr) {
    const membership = memberships[0];
    if (!membership) throw new Error("Nothing to recover — sign in first");
    if (!membership.recoveryWrappedDek || !membership.recoveryDekNonce) {
      throw new Error("No recovery code was ever set up for this account.");
    }

    let recoveryKey;
    let dek;
    try {
      recoveryKey = keys.recoveryKeyFromDisplayString(recoveryCodeStr.trim());
      dek = keys.unwrapDekWithRecoveryKey(membership.recoveryWrappedDek, membership.recoveryDekNonce, recoveryKey);
    } catch {
      throw new Error("That recovery code doesn't match.");
    }

    const secret = await getOrCreateVaultSecret();
    const { privateKey, forServer } = await keys.createUserKeyMaterial(secret);
    const wrappedDek = keys.wrapDekForMember(dek, forServer.publicKey);
    const newRecoveryKey = await keys.generateRecoveryKey();
    const { recoveryWrappedDek, recoveryDekNonce } = keys.wrapDekWithRecoveryKey(dek, newRecoveryKey);

    const result = await api.addDeviceViaRecoveryCode(membership.householdId, {
      ...forServer,
      wrappedDek,
      recoveryWrappedDek,
      recoveryDekNonce,
      deviceName: DEFAULT_DEVICE_NAME,
    });

    await persistDeviceId(result.deviceId);
    session.setUnlockedIdentity(forServer.publicKey, privateKey);
    session.setHouseholdDek(membership.householdId, dek);
    setKeyMaterial(forServer);
    setDeviceIdState(result.deviceId);
    setMemberships((prev) => prev.map((m) => (m.householdId === membership.householdId ? { ...m, wrappedDek } : m)));
    setUnlocked(true);
    setUnlockError(null);
    setPendingRecoveryCode({ householdId: membership.householdId, code: keys.recoveryKeyToDisplayString(newRecoveryKey) });
  }

  /**
   * Device pairing (§10d), the granting side — call from an
   * already-unlocked device to start a short-lived session, then show/
   * hand the returned `code` to the joining device out of band (read
   * aloud, copy/paste, eventually a QR). The pairing secret embedded in
   * the code never touches the server; only its effect (a MAC the joining
   * device computes) does. Returns the raw secret too — pollPairing needs
   * it back to verify the joining device's submission locally.
   */
  async function startDevicePairing(householdId) {
    const secret = await keys.generatePairingSecret();
    const created = await api.createPairingSession(householdId);
    const code = `${created.pairingId}.${keys.pairingSecretToDisplayString(secret)}`;
    return { pairingId: created.pairingId, secret, code, expiresAt: created.expiresAt };
  }

  /**
   * Granting side, called on an interval while showing the pairing code:
   * checks whether a joining device has submitted its key material yet,
   * and if so, verifies its MAC against the locally-held pairing secret
   * (never sent to the server) before ever wrapping the real DEK — this
   * is what stops a compromised relay from substituting its own key to
   * hijack the pairing. Returns { ready: false } until something's been
   * submitted, or { ready: true } once this device has granted it access.
   */
  async function pollDevicePairing(householdId, pairingId, secret) {
    const status = await api.getPairingStatus(pairingId);
    if (status.expired) throw new Error("This pairing code expired — start a new one.");
    if (!status.newPublicKey || !status.newDeviceMac || !status.newDeviceId) return { ready: false };

    if (!keys.verifyPairingMac(secret, status.newPublicKey, status.newDeviceMac)) {
      throw new Error("That pairing code doesn't check out — the code may have been tampered with. Start a new one.");
    }

    const dek = session.getHouseholdDek(householdId);
    const wrappedDek = keys.wrapDekForMember(dek, status.newPublicKey);
    await api.grantAccess(householdId, status.newDeviceId, wrappedDek);
    return { ready: true };
  }

  /**
   * Joining side: the user types/pastes the code shown on the
   * already-unlocked device. This device generates its own fresh keypair,
   * computes a MAC over its own public key using the pairing secret
   * embedded in the code (proving it actually saw that code, not just a
   * relayed public key), and submits both. Access isn't granted yet at
   * this point — the granting device still has to verify the MAC and
   * call grantAccess (see pollDevicePairing above); the caller should
   * show a "waiting for the other device" state and poll login()/me()
   * with the returned deviceId until it shows real access.
   */
  async function joinViaPairingCode(pairingCodeStr) {
    const [pairingId, secretStr] = pairingCodeStr.trim().split(".");
    if (!pairingId || !secretStr) throw new Error("That doesn't look like a valid pairing code.");
    const secret = keys.pairingSecretFromDisplayString(secretStr);

    const deviceSecret = await getOrCreateVaultSecret();
    const { forServer } = await keys.createUserKeyMaterial(deviceSecret);
    const mac = keys.computePairingMac(secret, forServer.publicKey);

    const result = await api.submitPairingDevice(pairingId, { ...forServer, deviceName: DEFAULT_DEVICE_NAME }, mac);
    await persistDeviceId(result.deviceId);
    setDeviceIdState(result.deviceId);
    return result.deviceId;
  }

  /** For an existing member: which devices are waiting for access to a household they're already in. */
  function listPendingKeyGrants(householdId) {
    return api.listPendingKeyGrants(householdId);
  }

  /** Every member of a household (granted or pending) — e.g. for an account owner picker. */
  function listMembers(householdId) {
    return api.listMembers(householdId);
  }

  /** Completes another device's access — wraps this household's DEK (already unlocked here) to that device's public key. */
  async function grantAccessTo(householdId, targetDeviceId, devicePublicKeyB64) {
    const dek = session.getHouseholdDek(householdId);
    const wrappedDek = keys.wrapDekForMember(dek, devicePublicKeyB64);
    await api.grantAccess(householdId, targetDeviceId, wrappedDek);
  }

  function createInvite(householdId, expiresInDays) {
    return api.createInvite(householdId, expiresInDays);
  }

  async function logout() {
    await setToken(null);
    await signOutOfGoogle();
    session.lockVault();
    setUnlocked(false);
    setUser(null);
    setKeyMaterial(null);
    setDeviceIdState(null);
    setMemberships([]);
    setPendingRecoveryCode(null);
    setUnlockError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeHouseholdId,
        isHouseholdOwner,
        unlocked,
        ready,
        serverUrl,
        pendingRecoveryCode,
        unlockError,
        deviceNeedsSetup,
        updateServerUrl,
        registerNewHousehold,
        joinHousehold,
        login,
        unlockVault,
        recoverAccess,
        checkDeviceAccess,
        startDevicePairing,
        pollDevicePairing,
        joinViaPairingCode,
        refreshMemberships,
        acknowledgeRecoveryCode,
        listPendingKeyGrants,
        listMembers,
        grantAccessTo,
        createInvite,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
