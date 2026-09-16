// These are integration tests against the real Neon dev database (the
// same one `backend/.env` points at) — there's no separate test DB, so
// every fixture uses a random suffix and cleans itself up, rather than
// mocking Prisma. Deliberately not a unit-test-with-mocks setup: the
// handlers are thin enough that mocking Prisma would mostly just test the
// mocks, not whether they actually work against real schema constraints
// (which is exactly what caught real issues during manual smoke testing
// earlier — e.g. the dedupKey unique constraint).
const crypto = require("node:crypto");
const db = require("../../db");

async function createTestHousehold(overrides = {}) {
  const suffix = crypto.randomUUID();
  const household = await db.household.create({ data: {} });
  const user = await db.user.create({
    data: {
      googleId: `test-${suffix}`,
      email: `test-${suffix}@example.com`,
      name: "Test User",
      publicKey: "test-pk",
      encryptedPrivateKey: "test-epk",
      privateKeyNonce: "test-nonce",
      vaultKdfSalt: "test-salt",
      ...overrides.user,
    },
  });
  await db.householdMember.create({
    data: {
      householdId: household.id,
      userId: user.id,
      role: "OWNER",
      wrappedDek: "test-wrapped-dek",
      ...overrides.membership,
    },
  });
  return { household, user };
}

async function createTestUser(overrides = {}) {
  const suffix = crypto.randomUUID();
  return db.user.create({
    data: {
      googleId: `test-${suffix}`,
      email: `test-${suffix}@example.com`,
      name: "Test User",
      publicKey: "test-pk",
      encryptedPrivateKey: "test-epk",
      privateKeyNonce: "test-nonce",
      vaultKdfSalt: "test-salt",
      ...overrides,
    },
  });
}

async function cleanupHousehold(household) {
  if (household) await db.household.delete({ where: { id: household.id } }).catch(() => {});
}

async function cleanupUser(user) {
  if (user) await db.user.delete({ where: { id: user.id } }).catch(() => {});
}

/**
 * Deleting a Household cascades HouseholdMember/Account/Category/etc.
 * (schema's onDelete: Cascade) but never the User rows themselves — a
 * user isn't owned by any single household (§5b, membership is a
 * relationship). Fixtures need both cleaned up, or every test run leaves
 * an orphaned User behind.
 */
async function cleanupFixture({ household, user }) {
  await cleanupHousehold(household);
  await cleanupUser(user);
}

module.exports = { createTestHousehold, createTestUser, cleanupHousehold, cleanupUser, cleanupFixture, db };
