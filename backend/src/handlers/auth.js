const db = require("../db");
const { verifyGoogleIdToken, createSession, newToken } = require("../auth");

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function keyMaterial(user) {
  return {
    publicKey: user.publicKey,
    encryptedPrivateKey: user.encryptedPrivateKey,
    privateKeyNonce: user.privateKeyNonce,
    vaultKdfSalt: user.vaultKdfSalt,
  };
}

async function membershipsFor(userId) {
  const memberships = await db.householdMember.findMany({ where: { userId } });
  // wrappedDek null means this membership is still awaiting an access
  // grant from an existing member — see joinHouseholdViaInvite below.
  return memberships.map((m) => ({ householdId: m.householdId, role: m.role, wrappedDek: m.wrappedDek }));
}

/**
 * Brand-new person, first Google sign-in ever, starting their own
 * household (no invite). Per §5b/§10a a household's creator generates the
 * DEK themselves and wraps it to their own public key before this call,
 * so — unlike joinHouseholdViaInvite — their access is complete
 * immediately, no grant step needed from anyone else.
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
}) {
  if (!publicKey || !encryptedPrivateKey || !privateKeyNonce || !vaultKdfSalt || !wrappedDek) {
    throw new Error("Missing key material");
  }
  const { googleId, email, name } = await verifyGoogleIdToken(idToken);

  const existing = await db.user.findUnique({ where: { googleId } });
  if (existing) throw new Error("Account already exists — use login instead");

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { googleId, email, name, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    const household = await tx.household.create({ data: {} });
    await tx.householdMember.create({
      data: {
        householdId: household.id,
        userId: user.id,
        role: "OWNER",
        wrappedDek,
        recoveryWrappedDek: recoveryWrappedDek || null,
        recoveryDekNonce: recoveryDekNonce || null,
      },
    });
    return { user, householdId: household.id };
  });

  // Default categories are no longer seeded here — the server never holds
  // the household DEK needed to encrypt them (§10a). The client seeds
  // them right after this call succeeds, via categories.createMany, using
  // its own copy of the default list (app/src/categorize/defaults.js).

  const token = await createSession(result.user.id);
  return { token, user: publicUser(result.user), householdId: result.householdId };
}

/**
 * Brand-new person redeeming an invite. Nobody can seal the household DEK
 * to a public key that doesn't exist yet, so this membership necessarily
 * starts with wrappedDek = null — an existing member has to complete the
 * grant (see listPendingKeyGrants/grantAccess) before this person can
 * decrypt anything. The client should show a "waiting for a household
 * member to let you in" state until then (memberships[].wrappedDek turns
 * non-null once granted — poll `auth.me` or refresh on app foreground).
 */
async function joinHouseholdViaInvite({ idToken, inviteCode, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt }) {
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

    const user = await tx.user.create({
      data: { googleId, email, name, publicKey, encryptedPrivateKey, privateKeyNonce, vaultKdfSalt },
    });
    await tx.householdMember.create({
      data: { householdId: invite.householdId, userId: user.id, role: "MEMBER" },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { usedByUserId: user.id, usedAt: new Date() } });
    return { user, householdId: invite.householdId };
  });

  const token = await createSession(result.user.id);
  return { token, user: publicUser(result.user), householdId: result.householdId, pendingKeyGrant: true };
}

/** Returning user, any device — Google re-verifies identity; no local secret is checked server-side at all. */
async function login({ idToken }) {
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

  const token = await createSession(user.id);
  return { token, user: publicUser(user), ...keyMaterial(user), memberships: await membershipsFor(user.id) };
}

async function me(user) {
  return { ...publicUser(user), ...keyMaterial(user), memberships: await membershipsFor(user.id) };
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

/**
 * Existing members see who's waiting for DEK access (§10a). The caller's
 * own client fetches this, wraps the household DEK to each pending
 * member's publicKey locally (crypto_box_seal — see app/src/crypto/keys.js
 * wrapDekForMember), then calls grantAccess with the result. The server
 * never does any wrapping itself — it never has the DEK to wrap.
 */
async function listPendingKeyGrants(user, payload) {
  const { householdId } = payload || {};
  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!membership || !membership.wrappedDek) throw new Error("Not a member with access to that household");

  const pending = await db.householdMember.findMany({
    where: { householdId, wrappedDek: null },
    include: { user: { select: { id: true, email: true, name: true, publicKey: true } } },
  });
  return pending.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, publicKey: m.user.publicKey }));
}

/** Completes a pending member's access — see listPendingKeyGrants above. */
async function grantAccess(user, payload) {
  const { householdId, memberUserId, wrappedDek } = payload || {};
  if (!wrappedDek) throw new Error("wrappedDek is required");

  const granterMembership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!granterMembership || !granterMembership.wrappedDek) {
    throw new Error("Not a member with access to that household");
  }

  const target = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: memberUserId } },
  });
  if (!target) throw new Error("That user is not a member of this household");
  if (target.wrappedDek) throw new Error("That member already has access");

  await db.householdMember.update({
    where: { householdId_userId: { householdId, userId: memberUserId } },
    data: { wrappedDek },
  });
  return { ok: true };
}

/**
 * A member sets up their own recovery code for a household — only
 * possible once they already have DEK access (wrapping the DEK with a
 * recovery key requires the plaintext DEK in the first place), so this is
 * always a follow-up call after grantAccess for an invited member (the
 * household creator instead sets this up atomically in
 * registerNewHousehold, since they have the DEK from the start).
 */
async function setRecoveryKey(user, payload) {
  const { householdId, recoveryWrappedDek, recoveryDekNonce } = payload || {};
  if (!recoveryWrappedDek || !recoveryDekNonce) throw new Error("recoveryWrappedDek and recoveryDekNonce are required");

  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
  });
  if (!membership || !membership.wrappedDek) throw new Error("Not a member with access to that household");

  await db.householdMember.update({
    where: { householdId_userId: { householdId, userId: user.id } },
    data: { recoveryWrappedDek, recoveryDekNonce },
  });
  return { ok: true };
}

module.exports = {
  registerNewHousehold,
  joinHouseholdViaInvite,
  login,
  me,
  createInvite,
  listPendingKeyGrants,
  grantAccess,
  setRecoveryKey,
};
