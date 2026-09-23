const db = require("../db");
const { verifyGoogleIdToken, createSession, newToken } = require("../auth");

const PAIRING_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes — short-lived, both devices are expected to be active together

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function deviceKeyMaterial(device) {
  return {
    publicKey: device.publicKey,
    encryptedPrivateKey: device.encryptedPrivateKey,
    privateKeyNonce: device.privateKeyNonce,
    vaultKdfSalt: device.vaultKdfSalt,
  };
}

const EMPTY_KEY_MATERIAL = { publicKey: null, encryptedPrivateKey: null, privateKeyNonce: null, vaultKdfSalt: null };

/**
 * Per-device membership view (decision, 2026-09-22, see PRD §10d): wrappedDek
 * now lives on DeviceHouseholdKey, keyed by (deviceId, householdId), not on
 * HouseholdMember — a household's DEK is wrapped once per device, not once
 * per user, so more than one of a user's devices can hold working access
 * simultaneously. deviceId is null for a caller with no recognized device
 * yet (a brand-new install, or a stale/cleared one) — every wrappedDek in
 * the response comes back null in that case, same shape the client already
 * understands as "no access yet," now just also covering "no device yet."
 * recoveryWrappedDek/recoveryDekNonce stay per-user-per-household (a
 * recovery code isn't device-specific) so a client can attempt recovery
 * regardless of which device is asking.
 */
async function membershipsFor(userId, deviceId) {
  const memberships = await db.householdMember.findMany({ where: { userId } });
  const deviceKeys = deviceId
    ? await db.deviceHouseholdKey.findMany({
        where: { deviceId, householdId: { in: memberships.map((m) => m.householdId) } },
      })
    : [];
  const wrappedDekByHousehold = Object.fromEntries(deviceKeys.map((k) => [k.householdId, k.wrappedDek]));

  return memberships.map((m) => ({
    householdId: m.householdId,
    role: m.role,
    wrappedDek: wrappedDekByHousehold[m.householdId] || null,
    recoveryWrappedDek: m.recoveryWrappedDek,
    recoveryDekNonce: m.recoveryDekNonce,
  }));
}

/**
 * Brand-new person, first Google sign-in ever, starting their own
 * household (no invite). Per §5b/§10a a household's creator generates the
 * DEK themselves and wraps it to their own device's public key before this
 * call, so — unlike joinHouseholdViaInvite — access is complete
 * immediately, no grant step needed from anyone else. Creates this
 * caller's first UserDevice row; the returned deviceId must be persisted
 * client-side (§10d) so future login/me calls can identify this device.
 */
async function registerNewHousehold({
  idToken,
  publicKey,
  encryptedPrivateKey,
  privateKeyNonce,
  vaultKdfSalt,
  wrappedDek,
  recoveryWrappedDek,
  recoveryDekNonce,
  deviceName,
}) {
  if (!publicKey || !encryptedPrivateKey || !privateKeyNonce || !vaultKdfSalt || !wrappedDek) {
    throw new Error("Missing key material");
  }
  const { googleId, email, name } = await verifyGoogleIdToken(idToken);

  const existing = await db.user.findUnique({ where: { googleId } });
  if (existing) throw new Error("Account already exists — use login instead");

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { googleId, email, name } });
    const device = await tx.userDevice.create({
      data: { userId: user.id, name: deviceName || null, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    const household = await tx.household.create({ data: {} });
    await tx.householdMember.create({
      data: {
        householdId: household.id,
        userId: user.id,
        role: "OWNER",
        recoveryWrappedDek: recoveryWrappedDek || null,
        recoveryDekNonce: recoveryDekNonce || null,
      },
    });
    await tx.deviceHouseholdKey.create({ data: { deviceId: device.id, householdId: household.id, wrappedDek } });
    return { user, device, householdId: household.id };
  });

  // Default categories are no longer seeded here — the server never holds
  // the household DEK needed to encrypt them (§10a). The client seeds
  // them right after this call succeeds, via categories.createMany, using
  // its own copy of the default list (app/src/categorize/defaults.js).

  const token = await createSession(result.user.id);
  return { token, user: publicUser(result.user), householdId: result.householdId, deviceId: result.device.id };
}

/**
 * Brand-new person redeeming an invite. Nobody can seal the household DEK
 * to a device's public key that doesn't exist yet, so this device's
 * DeviceHouseholdKey row can't be created here — an existing member has to
 * complete the grant (see listPendingKeyGrants/grantAccess) before this
 * device can decrypt anything. The client should show a "waiting for a
 * household member to let you in" state until then (memberships[].wrappedDek
 * turns non-null once granted — poll `auth.login`/`auth.me` with the
 * returned deviceId, or refresh on app foreground).
 */
async function joinHouseholdViaInvite({ idToken, inviteCode, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt, deviceName }) {
  if (!inviteCode) throw new Error("inviteCode is required");
  if (!publicKey || !encryptedPrivateKey || !privateKeyNonce || !vaultKdfSalt) {
    throw new Error("Missing key material");
  }
  const { googleId, email, name } = await verifyGoogleIdToken(idToken);

  const existing = await db.user.findUnique({ where: { googleId } });
  if (existing) throw new Error("Account already exists — use login instead");

  const result = await db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { code: inviteCode } });
    if (!invite) throw new Error("Invalid invite code");
    if (invite.usedAt) throw new Error("Invite code already used");
    if (invite.expiresAt && invite.expiresAt < new Date()) throw new Error("Invite code expired");

    const user = await tx.user.create({ data: { googleId, email, name } });
    const device = await tx.userDevice.create({
      data: { userId: user.id, name: deviceName || null, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    await tx.householdMember.create({
      data: { householdId: invite.householdId, userId: user.id, role: "MEMBER" },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { usedByUserId: user.id, usedAt: new Date() } });
    return { user, device, householdId: invite.householdId };
  });

  const token = await createSession(result.user.id);
  return {
    token,
    user: publicUser(result.user),
    householdId: result.householdId,
    deviceId: result.device.id,
    pendingKeyGrant: true,
  };
}

/**
 * Returning user, any device — Google re-verifies identity; no local secret
 * is checked server-side at all. deviceId (persisted client-side since
 * whichever call first created this device) identifies which device's key
 * material to return; omitted, unrecognized, or belonging to a different
 * user all come back the same way — no key material, memberships present
 * but every wrappedDek null — so the client can tell "this device has never
 * been added to this account" and route into recovery-code or device-
 * pairing instead of a bare failure.
 */
async function login({ idToken, deviceId }) {
  const { googleId, email, name } = await verifyGoogleIdToken(idToken);

  let user = await db.user.findUnique({ where: { googleId } });
  if (!user) throw new Error("No account found — register first");

  // Self-heals a name/email that came back empty at registration — Google
  // doesn't always include these claims on every ID token, but re-checking
  // here is free since the token's already being verified for login anyway.
  const patch = {};
  if (name && user.name !== name) patch.name = name;
  if (email && user.email !== email) patch.email = email;
  if (Object.keys(patch).length > 0) {
    user = await db.user.update({ where: { id: user.id }, data: patch });
  }

  const device = deviceId ? await db.userDevice.findUnique({ where: { id: deviceId } }) : null;
  const validDevice = device && device.userId === user.id ? device : null;
  if (validDevice) {
    await db.userDevice.update({ where: { id: validDevice.id }, data: { lastSeenAt: new Date() } });
  }

  const token = await createSession(user.id);
  return {
    token,
    user: publicUser(user),
    ...(validDevice ? deviceKeyMaterial(validDevice) : EMPTY_KEY_MATERIAL),
    deviceId: validDevice ? validDevice.id : null,
    memberships: await membershipsFor(user.id, validDevice ? validDevice.id : null),
  };
}

/** Cold-start refresh with an already-valid session token — same device-scoping as login above. */
async function me(user, payload) {
  const { deviceId } = payload || {};
  const device = deviceId ? await db.userDevice.findUnique({ where: { id: deviceId } }) : null;
  const validDevice = device && device.userId === user.id ? device : null;

  return {
    ...publicUser(user),
    ...(validDevice ? deviceKeyMaterial(validDevice) : EMPTY_KEY_MATERIAL),
    deviceId: validDevice ? validDevice.id : null,
    memberships: await membershipsFor(user.id, validDevice ? validDevice.id : null),
  };
}

/** Any household member can invite for now — see PRD §5b open question on whether this should be owner-only. */
async function createInvite(user, payload) {
  const { householdId, expiresInDays } = payload || {};
  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!membership) throw new Error("Not a member of that household");

  const invite = await db.invite.create({
    data: {
      householdId,
      code: newToken().slice(0, 12),
      createdByUserId: user.id,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    },
  });
  return { code: invite.code, expiresAt: invite.expiresAt };
}

/** True if the caller has at least one device with working access to this household. */
async function hasHouseholdAccess(userId, householdId) {
  const key = await db.deviceHouseholdKey.findFirst({ where: { householdId, device: { userId } } });
  return !!key;
}

/**
 * Existing members (via any of their own devices with access) see which
 * *devices* are waiting for DEK access — covers a brand-new household
 * member (their first device, from joinHouseholdViaInvite) and an
 * existing member's own additional device (from device pairing, §10d)
 * identically: both are just "a device with no DeviceHouseholdKey row for
 * this household yet." The caller's own client fetches this, wraps the
 * household DEK to each pending device's publicKey locally
 * (crypto_box_seal — see app/src/crypto/keys.js wrapDekForMember), then
 * calls grantAccess with the result. The server never does any wrapping
 * itself — it never has the DEK to wrap.
 */
async function listPendingKeyGrants(user, payload) {
  const { householdId } = payload || {};
  if (!(await hasHouseholdAccess(user.id, householdId))) {
    throw new Error("Not a member with access to that household");
  }

  const members = await db.householdMember.findMany({ where: { householdId } });
  const memberUserIds = members.map((m) => m.userId);

  const pendingDevices = await db.userDevice.findMany({
    where: { userId: { in: memberUserIds }, householdKeys: { none: { householdId } } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return pendingDevices.map((d) => ({
    deviceId: d.id,
    deviceName: d.name,
    userId: d.userId,
    email: d.user.email,
    name: d.user.name,
    publicKey: d.publicKey,
  }));
}

/** Every member of a household (granted or still pending on every device) — for building an owner picker, member list, etc. */
async function listMembers(user, payload) {
  const { householdId } = payload || {};
  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!membership) throw new Error("Not a member of that household");

  const members = await db.householdMember.findMany({
    where: { householdId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role }));
}

/**
 * Completes a pending device's access — see listPendingKeyGrants above.
 * Targets a specific device (not a user), since a user can have more than
 * one pending device (e.g. mid device-pairing for themselves) at once.
 */
async function grantAccess(user, payload) {
  const { householdId, deviceId, wrappedDek } = payload || {};
  if (!deviceId || !wrappedDek) throw new Error("deviceId and wrappedDek are required");

  if (!(await hasHouseholdAccess(user.id, householdId))) {
    throw new Error("Not a member with access to that household");
  }

  const targetDevice = await db.userDevice.findUnique({ where: { id: deviceId } });
  if (!targetDevice) throw new Error("No such device");
  const targetMembership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: targetDevice.userId } },
  });
  if (!targetMembership) throw new Error("That device's owner is not a member of this household");

  const existingKey = await db.deviceHouseholdKey.findUnique({
    where: { deviceId_householdId: { deviceId, householdId } },
  });
  if (existingKey) throw new Error("That device already has access");

  await db.deviceHouseholdKey.create({ data: { deviceId, householdId, wrappedDek } });
  return { ok: true };
}

/**
 * A member sets up their own recovery code for a household — only
 * possible once at least one of their devices already has DEK access
 * (wrapping the DEK with a recovery key requires the plaintext DEK in the
 * first place), so this is always a follow-up call after grantAccess for
 * an invited member (the household creator instead sets this up
 * atomically in registerNewHousehold, since they have the DEK from the
 * start). Per-user-per-household, not per-device — any of this user's
 * devices can call it, and the resulting code works to recover any future
 * device, not just the one that generated it.
 */
async function setRecoveryKey(user, payload) {
  const { householdId, recoveryWrappedDek, recoveryDekNonce } = payload || {};
  if (!recoveryWrappedDek || !recoveryDekNonce) throw new Error("recoveryWrappedDek and recoveryDekNonce are required");

  if (!(await hasHouseholdAccess(user.id, householdId))) {
    throw new Error("Not a member with access to that household");
  }

  await db.householdMember.update({
    where: { householdId_userId: { householdId, userId: user.id } },
    data: { recoveryWrappedDek, recoveryDekNonce },
  });
  return { ok: true };
}

/**
 * §10c's original gap, closed (decision, 2026-09-22, see PRD §10d): a
 * device with no working key material for this account (never registered
 * here, or storage was cleared) redeems the household's recovery code
 * instead. The client already unwrapped the household DEK client-side
 * with the recovery key before calling this (the server never sees that
 * key) — this call is purely additive, registering a brand-new device
 * with its own keypair and its own wrap of the DEK, never touching any
 * other device's key material. That's the important difference from the
 * first version of this feature: recovering on a new device no longer
 * invalidates any other device that's already working.
 */
async function addDeviceViaRecoveryCode(user, payload) {
  const {
    householdId,
    publicKey,
    encryptedPrivateKey,
    privateKeyNonce,
    vaultKdfSalt,
    wrappedDek,
    recoveryWrappedDek,
    recoveryDekNonce,
    deviceName,
  } = payload || {};
  if (!publicKey || !encryptedPrivateKey || !privateKeyNonce || !vaultKdfSalt || !wrappedDek) {
    throw new Error("Missing key material");
  }

  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!membership) throw new Error("Not a member of that household");

  const device = await db.$transaction(async (tx) => {
    const device = await tx.userDevice.create({
      data: { userId: user.id, name: deviceName || null, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    await tx.deviceHouseholdKey.create({ data: { deviceId: device.id, householdId, wrappedDek } });
    if (recoveryWrappedDek && recoveryDekNonce) {
      await tx.householdMember.update({
        where: { householdId_userId: { householdId, userId: user.id } },
        data: { recoveryWrappedDek, recoveryDekNonce },
      });
    }
    return device;
  });

  return { ok: true, deviceId: device.id };
}

/**
 * Device pairing (decision, 2026-09-22, see PRD §10d) — the primary way to
 * add a device going forward, with the recovery code above as the
 * backstop for "every device is gone." An already-unlocked device (the
 * "granter") starts a short-lived session and shows/types a pairing code
 * to the joining device out of band; the actual pairing secret inside
 * that code is never sent here (see DevicePairingSession's model comment
 * for the MAC-based hijack protection this buys).
 *
 * Opportunistically sweeps expired sessions on every create rather than
 * running a separate cleanup job — cheap, and this table is never large.
 */
async function createPairingSession(user, payload) {
  const { householdId } = payload || {};
  if (!(await hasHouseholdAccess(user.id, householdId))) {
    throw new Error("Not a member with access to that household");
  }

  await db.devicePairingSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const session = await db.devicePairingSession.create({
    data: { userId: user.id, householdId, expiresAt: new Date(Date.now() + PAIRING_SESSION_TTL_MS) },
  });
  return { pairingId: session.id, expiresAt: session.expiresAt };
}

/**
 * The joining device submits its own freshly-generated key material plus
 * a MAC (HMAC-SHA256 of its public key, keyed by the pairing secret it
 * read off the granting device's screen — see app/src/crypto/keys.js
 * pairingDeviceMac). Creates the UserDevice row immediately — that's safe
 * on its own (same state as any pre-grant device from joinHouseholdViaInvite)
 * since it has no DeviceHouseholdKey yet; the MAC is what the granting
 * device checks before it ever wraps the real DEK, so a compromised
 * server relaying this can't substitute its own key to hijack the pairing.
 */
async function submitPairingDevice(user, payload) {
  const { pairingId, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt, mac, deviceName } = payload || {};
  if (!publicKey || !encryptedPrivateKey || !privateKeyNonce || !vaultKdfSalt || !mac) {
    throw new Error("Missing key material");
  }

  const session = await db.devicePairingSession.findUnique({ where: { id: pairingId } });
  if (!session || session.userId !== user.id) throw new Error("Invalid pairing code");
  if (session.expiresAt < new Date()) throw new Error("Pairing code expired");
  if (session.newPublicKey) throw new Error("This pairing code has already been used");

  const device = await db.$transaction(async (tx) => {
    const device = await tx.userDevice.create({
      data: { userId: user.id, name: deviceName || null, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    await tx.devicePairingSession.update({
      where: { id: pairingId },
      data: { newPublicKey: publicKey, newDeviceMac: mac },
    });
    return device;
  });

  return { ok: true, deviceId: device.id };
}

/** Polled by the granting device until the joining device has submitted its key material. */
async function getPairingStatus(user, payload) {
  const { pairingId } = payload || {};
  const session = await db.devicePairingSession.findUnique({ where: { id: pairingId } });
  if (!session || session.userId !== user.id) throw new Error("Invalid pairing code");

  // Looked up by publicKey rather than stored directly on the session —
  // avoids a schema column for something derivable, same pattern as
  // isPairingComplete below.
  const device = session.newPublicKey
    ? await db.userDevice.findFirst({ where: { userId: user.id, publicKey: session.newPublicKey } })
    : null;

  return {
    expired: session.expiresAt < new Date(),
    newDeviceId: device ? device.id : null,
    newPublicKey: session.newPublicKey,
    newDeviceMac: session.newDeviceMac,
  };
}

/**
 * Polled by the joining device — once the granting device verifies the
 * MAC and calls grantAccess (below) for this new device, this comes back
 * true and the joining device's own auth.login/auth.me calls (with its
 * now-registered deviceId) will start returning real access.
 */
async function isPairingComplete(user, payload) {
  const { pairingId } = payload || {};
  const session = await db.devicePairingSession.findUnique({ where: { id: pairingId } });
  if (!session || session.userId !== user.id) throw new Error("Invalid pairing code");
  if (!session.newPublicKey) return { ready: false };

  const device = await db.userDevice.findFirst({ where: { userId: user.id, publicKey: session.newPublicKey } });
  const key = device
    ? await db.deviceHouseholdKey.findUnique({
        where: { deviceId_householdId: { deviceId: device.id, householdId: session.householdId } },
      })
    : null;
  return { ready: !!key };
}

module.exports = {
  registerNewHousehold,
  joinHouseholdViaInvite,
  login,
  me,
  createInvite,
  listPendingKeyGrants,
  listMembers,
  grantAccess,
  setRecoveryKey,
  addDeviceViaRecoveryCode,
  createPairingSession,
  submitPairingDevice,
  getPairingStatus,
  isPairingComplete,
};
