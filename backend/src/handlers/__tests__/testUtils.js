// These are integration tests against a real Postgres database (see
// backend/README.md / PRD §14a — Neon's dev branch in normal use, a local
// throwaway instance also works fine) — there's no mocked Prisma, every
// fixture uses a random suffix and cleans itself up. Deliberately not a
// unit-test-with-mocks setup: the handlers are thin enough that mocking
// Prisma would mostly just test the mocks, not whether they actually work
// against real schema constraints (which is exactly what caught real
// issues during manual smoke testing earlier — e.g. the dedupKey unique
// constraint).
const crypto = require("node:crypto");
const db = require("../../db");

/** A household with one OWNER, one device, and that device already granted access (§10d). */
async function createTestHousehold(overrides = {}) {
  const suffix = crypto.randomUUID();
  const household = await db.household.create({ data: {} });
  const user = await db.user.create({
    data: { googleId: `test-${suffix}`, email: `test-${suffix}@example.com`, name: "Test User", ...overrides.user },
  });
  const device = await db.userDevice.create({
    data: {
      userId: user.id,
      publicKey: "test-pk",
      encryptedPrivateKey: "test-epk",
      privateKeyNonce: "test-nonce",
      vaultKdfSalt: "test-salt",
      ...overrides.device,
    },
  });
  await db.householdMember.create({
    data: { householdId: household.id, userId: user.id, role: "OWNER", ...overrides.membership },
  });
  await db.deviceHouseholdKey.create({
    data: { deviceId: device.id, householdId: household.id, wrappedDek: "test-wrapped-dek", ...overrides.deviceHouseholdKey },
  });
  return { household, user, device };
}

async function createTestUser(overrides = {}) {
  const suffix = crypto.randomUUID();
  return db.user.create({
    data: { googleId: `test-${suffix}`, email: `test-${suffix}@example.com`, name: "Test User", ...overrides },
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
 * an orphaned User (and their UserDevice rows, cascaded from the User
 * delete) behind.
 */
async function cleanupFixture({ household, user }) {
  await cleanupHousehold(household);
  await cleanupUser(user);
}

module.exports = { createTestHousehold, createTestUser, cleanupHousehold, cleanupUser, cleanupFixture, db };
