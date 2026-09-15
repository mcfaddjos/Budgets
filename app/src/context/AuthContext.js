import { createContext, useContext, useEffect, useState } from "react";
import { api, loadPersistedSession, setToken, getServerUrl, setServerUrl } from "../api/client";
import { signInWithGoogle, signOutOfGoogle } from "../auth/google";
import * as keys from "../crypto/keys";
import * as records from "../crypto/records";
import * as session from "../crypto/session";
import { DEFAULT_CATEGORIES } from "../categorize/defaults";

const AuthContext = createContext(null);

/**
 * Unwraps every membership's household DEK the caller's private key can
 * open (§10a) and loads it into session.js. Memberships with wrappedDek
 * still null (an invite awaiting an access grant — see backend
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
  const [keyMaterial, setKeyMaterial] = useState(null); // publicKey/encryptedPrivateKey/privateKeyNonce/vaultKdfSalt from the server
  const [memberships, setMemberships] = useState([]);
  const [unlocked, setUnlocked] = useState(false); // mirrors session.isUnlocked(), kept in React state so the UI re-renders
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState(null); // { householdId, code } — shown once, then acknowledged away
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  // v1 is single-household (§5b leaves room for more later) — the first
  // membership that's actually unlocked (has a DEK loaded) is "the"
  // household the rest of the app operates on. A membership stuck at
  // wrappedDek === null (pending an access grant) never counts here, even
  // though it's already in `memberships` — that's what tells App.js to
  // show the "waiting for access" screen instead of the normal tabs.
  const activeHouseholdId = memberships.find((m) => session.hasHouseholdDek(m.householdId))?.householdId || null;

  useEffect(() => {
    loadPersistedSession().then(async ({ serverUrl: url, token }) => {
      setServerUrlState(url);
      if (token) {
        try {
          const me = await api.me();
          applyIdentity(me);
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

  /** Common shape of both auth.me and auth.login responses — sets identity/membership state, but does not unlock the vault (that needs the passphrase). */
  function applyIdentity(response) {
    setUser({ id: response.id, email: response.email, name: response.name });
    setKeyMaterial({
      publicKey: response.publicKey,
      encryptedPrivateKey: response.encryptedPrivateKey,
      privateKeyNonce: response.privateKeyNonce,
      vaultKdfSalt: response.vaultKdfSalt,
    });
    setMemberships(response.memberships || []);
  }

  async function updateServerUrl(url) {
    await setServerUrl(url);
    setServerUrlState(url);
  }

  /**
   * App restart / any time session.js has been cleared (Metro Fast
   * Refresh, or the process was killed) but the backend session token is
   * still valid — re-derives the private key from the passphrase without
   * going through Google Sign-In again.
   */
  async function unlockVault(vaultPassphrase) {
    if (!keyMaterial) throw new Error("Nothing to unlock — sign in first");
    const privateKey = await keys.unlockPrivateKey({ passphrase: vaultPassphrase, ...keyMaterial });
    session.setUnlockedIdentity(keyMaterial.publicKey, privateKey);
    unlockAvailableDeks(memberships, keyMaterial.publicKey);
    setUnlocked(true);
  }

  /** New person, first Google sign-in ever, starting their own household. */
  async function registerNewHousehold(vaultPassphrase) {
    const idToken = await signInWithGoogle();
    if (!idToken) return false; // user cancelled the Google sign-in sheet

    const { privateKey, forServer } = await keys.createUserKeyMaterial(vaultPassphrase);
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
    });

    await setToken(result.token);
    session.setUnlockedIdentity(forServer.publicKey, privateKey);
    session.setHouseholdDek(result.householdId, dek);
    setUnlocked(true);
    applyIdentity({ ...result.user, ...forServer, memberships: [{ householdId: result.householdId, role: "OWNER", wrappedDek }] });

    // By this point React has already navigated away from whatever screen
    // called this (unlocked/activeHouseholdId just flipped true), so a
    // thrown error here can't reach that screen's own error UI — it would
    // otherwise fail completely silently. Log explicitly and don't let a
    // seeding failure undo an already-successful registration; the user
    // can still add categories manually from the Budgets screen.
    try {
      await seedDefaultCategories(dek);
    } catch (err) {
      console.error("[registerNewHousehold] seedDefaultCategories failed:", err.message);
    }
    setPendingRecoveryCode({ householdId: result.householdId, code: keys.recoveryKeyToDisplayString(recoveryKey) });

    return true;
  }

  async function seedDefaultCategories(dek) {
    const encrypted = await Promise.all(DEFAULT_CATEGORIES.map((name) => records.encryptRecord(dek, { name })));
    await api.createDefaultCategories(encrypted);
  }

  /**
   * New person redeeming an invite. Their membership starts with no DEK
   * access at all (see backend handlers/auth.js joinHouseholdViaInvite) —
   * the caller should show a "waiting for a household member to let you
   * in" state and call refreshMemberships() periodically until it clears.
   */
  async function joinHousehold(inviteCode, vaultPassphrase) {
    const idToken = await signInWithGoogle();
    if (!idToken) return false;

    const { privateKey, forServer } = await keys.createUserKeyMaterial(vaultPassphrase);
    const result = await api.joinHouseholdViaInvite({ idToken, inviteCode, ...forServer });

    await setToken(result.token);
    session.setUnlockedIdentity(forServer.publicKey, privateKey);
    setUnlocked(true);
    applyIdentity({ ...result.user, ...forServer, memberships: [{ householdId: result.householdId, role: "MEMBER", wrappedDek: null }] });

    return { householdId: result.householdId, pendingKeyGrant: true };
  }

  /** Returning user, any device. */
  async function login(vaultPassphrase) {
    const idToken = await signInWithGoogle();
    if (!idToken) return false;

    const result = await api.login(idToken);
    await setToken(result.token);

    const privateKey = await keys.unlockPrivateKey({ passphrase: vaultPassphrase, ...result });
    session.setUnlockedIdentity(result.publicKey, privateKey);
    unlockAvailableDeks(result.memberships, result.publicKey);
    setUnlocked(true);
    applyIdentity(result);
    return true;
  }

  /**
   * Re-fetches membership state and unwraps any DEK that's newly become
   * available since the last check (an existing member just completed a
   * grantAccess call). The first time a household's DEK becomes
   * available this way, immediately sets up this member's own recovery
   * code — that requires the plaintext DEK, so it could never happen
   * earlier in joinHousehold above — and surfaces it via
   * pendingRecoveryCode for the UI to show the user once.
   */
  async function refreshMemberships() {
    const me = await api.me();
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

  /** For an existing member: who's waiting for access to a household they're already in. */
  function listPendingKeyGrants(householdId) {
    return api.listPendingKeyGrants(householdId);
  }

  /** Completes another member's access — wraps this household's DEK (already unlocked here) to their public key. */
  async function grantAccessTo(householdId, memberUserId, memberPublicKeyB64) {
    const dek = session.getHouseholdDek(householdId);
    const wrappedDek = keys.wrapDekForMember(dek, memberPublicKeyB64);
    await api.grantAccess(householdId, memberUserId, wrappedDek);
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
    setMemberships([]);
    setPendingRecoveryCode(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeHouseholdId,
        unlocked,
        ready,
        serverUrl,
        pendingRecoveryCode,
        updateServerUrl,
        registerNewHousehold,
        joinHousehold,
        login,
        unlockVault,
        refreshMemberships,
        acknowledgeRecoveryCode,
        listPendingKeyGrants,
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
