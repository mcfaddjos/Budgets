const accounts = require("../accounts");
const { createTestHousehold, createTestUser, cleanupFixture, cleanupUser, db } = require("./testUtils");

let fixture;
let outsider;

beforeAll(async () => {
  fixture = await createTestHousehold();
  outsider = await createTestUser(); // belongs to no household — for cross-household isolation checks
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await cleanupUser(outsider);
  await db.$disconnect();
});

test("create rejects missing encryptedData/nonce", async () => {
  await expect(accounts.create(fixture.user, {})).rejects.toThrow(/encryptedData and nonce/);
  await expect(accounts.create(fixture.user, { encryptedData: "ct" })).rejects.toThrow(/encryptedData and nonce/);
});

test("create never touches plaintext — server just stores whatever ciphertext it's given", async () => {
  const created = await accounts.create(fixture.user, { encryptedData: "ct-account-1", nonce: "n1" });
  const list = await accounts.list(fixture.user);
  const found = list.find((a) => a.id === created.id);
  expect(found).toBeDefined();
  expect(found.encryptedData).toBe("ct-account-1");
  expect(found.nonce).toBe("n1");
});

test("a user with no household membership can't list or create accounts", async () => {
  await expect(accounts.list(outsider)).rejects.toThrow(/no household/i);
  await expect(accounts.create(outsider, { encryptedData: "ct", nonce: "n" })).rejects.toThrow(/no household/i);
});

test("remove is idempotent — a retried delete of an already-gone row succeeds", async () => {
  const created = await accounts.create(fixture.user, { encryptedData: "ct-account-2", nonce: "n2" });
  const first = await accounts.remove(fixture.user, { id: created.id });
  expect(first).toEqual({ ok: true });
  const second = await accounts.remove(fixture.user, { id: created.id });
  expect(second).toEqual({ ok: true });
});

test("create defaults ownerUserIds to just the creator", async () => {
  const created = await accounts.create(fixture.user, { encryptedData: "ct-owner-default", nonce: "n" });
  expect(created.ownerUserIds).toEqual([fixture.user.id]);
});

test("create accepts multiple owners who are all household members (a shared account)", async () => {
  const secondMember = await createTestUser();
  await db.householdMember.create({
    data: { householdId: fixture.household.id, userId: secondMember.id, role: "MEMBER" },
  });

  const created = await accounts.create(fixture.user, {
    encryptedData: "ct-shared",
    nonce: "n",
    ownerUserIds: [fixture.user.id, secondMember.id],
  });
  expect(created.ownerUserIds.sort()).toEqual([fixture.user.id, secondMember.id].sort());

  await cleanupUser(secondMember);
});

test("create rejects an ownerUserId that isn't a member of this household", async () => {
  await expect(
    accounts.create(fixture.user, { encryptedData: "ct", nonce: "n", ownerUserIds: [outsider.id] })
  ).rejects.toThrow(/must all be members/);
});
