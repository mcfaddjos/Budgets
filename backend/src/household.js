const db = require("./db");

/**
 * Resolves which household the caller is acting in. Every handler that
 * touches household-scoped data goes through this single function — that's
 * the seam where "switch household" support plugs in later (PRD §5b) once
 * a user can belong to more than one, without touching every handler that
 * calls this. v1 only ever creates one membership per user, so "first
 * membership" is unambiguous for now.
 */
async function getActiveHouseholdId(user) {
  const membership = await db.householdMember.findFirst({ where: { userId: user.id } });
  if (!membership) throw new Error("User has no household");
  return membership.householdId;
}

module.exports = { getActiveHouseholdId };
