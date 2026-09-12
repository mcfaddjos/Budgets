const db = require("../db");
const {
  hashPassword,
  verifyPassword,
  createSession,
  recordFailedLogin,
  clearFailedLogins,
  isLocked,
  MAX_FAILED_ATTEMPTS,
} = require("../auth");
const { seedDefaultCategories } = require("../categorize");
const { newToken } = require("../auth");

/**
 * Two entry points per PRD §5b, distinguished by whether an inviteCode is
 * given — no separate global gate like the appscript backend's INVITE_CODE:
 *   - no inviteCode: creates a brand-new household, caller becomes its owner.
 *   - inviteCode: redeems a household-scoped invite, caller joins as a member.
 */
async function register({ username, password, inviteCode }) {
  if (!username || !password) throw new Error("username and password are required");

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) throw new Error("username already taken");

  const passwordHash = await hashPassword(password);

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { username, passwordHash } });

    let householdId;
    let role;

    if (inviteCode) {
      const invite = await tx.invite.findUnique({ where: { code: inviteCode } });
      if (!invite) throw new Error("Invalid invite code");
      if (invite.usedAt) throw new Error("Invite code already used");
      if (invite.expiresAt && invite.expiresAt < new Date()) throw new Error("Invite code expired");

      householdId = invite.householdId;
      role = "MEMBER";
      await tx.invite.update({ where: { id: invite.id }, data: { usedByUserId: user.id, usedAt: new Date() } });
    } else {
      const household = await tx.household.create({ data: {} });
      householdId = household.id;
      role = "OWNER";
    }

    await tx.householdMember.create({ data: { householdId, userId: user.id, role } });
    return { user, householdId, isNewHousehold: !inviteCode };
  });

  if (result.isNewHousehold) {
    await seedDefaultCategories(result.householdId);
  }

  const token = await createSession(result.user.id);
  return { token, user: { id: result.user.id, username: result.user.username } };
}

async function login({ username, password }) {
  if (!username || !password) throw new Error("username and password are required");

  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error(`No account found for username "${username}"`);

  if (isLocked(user)) {
    throw new Error("Account temporarily locked after repeated failed logins. Try again later.");
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailedLogin(user);
    throw new Error("Incorrect password");
  }

  await clearFailedLogins(user.id);
  const token = await createSession(user.id);
  return { token, user: { id: user.id, username: user.username } };
}

async function me(user) {
  return { id: user.id, username: user.username };
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

module.exports = { register, login, me, createInvite, MAX_FAILED_ATTEMPTS };
