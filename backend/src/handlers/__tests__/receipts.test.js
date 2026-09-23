const crypto = require("node:crypto");
const receipts = require("../receipts");
const { createTestHousehold, createTestUser, cleanupFixture, cleanupUser, db } = require("./testUtils");

let fixture;
let outsider;
let transaction;

beforeAll(async () => {
  fixture = await createTestHousehold();
  outsider = await createTestUser();

  const account = await db.account.create({
    data: { householdId: fixture.household.id, encryptedData: "ct-account", nonce: "n", ownerUserIds: [fixture.user.id] },
  });
  transaction = await db.transaction.create({
    data: {
      householdId: fixture.household.id,
      accountId: account.id,
      date: "2026-09-23",
      encryptedData: "ct-tx",
      nonce: "n",
      dedupKey: crypto.randomUUID(),
      createdByUserId: fixture.user.id,
    },
  });
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await cleanupUser(outsider);
  await db.$disconnect();
});

test("upload rejects missing fields", async () => {
  await expect(receipts.upload(fixture.user, {})).rejects.toThrow(/required/);
  await expect(receipts.upload(fixture.user, { transactionId: transaction.id })).rejects.toThrow(/required/);
});

test("upload rejects a caller with no household membership", async () => {
  await expect(
    receipts.upload(outsider, { transactionId: transaction.id, encryptedData: "ct", nonce: "n" })
  ).rejects.toThrow(/no household/i);
});

test("upload stores ciphertext and get returns it back untouched", async () => {
  const uploaded = await receipts.upload(fixture.user, {
    transactionId: transaction.id,
    encryptedData: "ct-image-1",
    nonce: "n1",
  });
  expect(uploaded.transactionId).toBe(transaction.id);

  const fetched = await receipts.get(fixture.user, { transactionId: transaction.id });
  expect(fetched.encryptedData).toBe("ct-image-1");
  expect(fetched.nonce).toBe("n1");
});

test("upload is idempotent per transaction — re-uploading replaces the image (upsert)", async () => {
  await receipts.upload(fixture.user, { transactionId: transaction.id, encryptedData: "ct-image-2", nonce: "n2" });
  const fetched = await receipts.get(fixture.user, { transactionId: transaction.id });
  expect(fetched.encryptedData).toBe("ct-image-2");
  expect(fetched.nonce).toBe("n2");
});

test("get returns null when no image was ever uploaded", async () => {
  const account2 = await db.account.create({
    data: { householdId: fixture.household.id, encryptedData: "ct", nonce: "n", ownerUserIds: [fixture.user.id] },
  });
  const tx2 = await db.transaction.create({
    data: {
      householdId: fixture.household.id,
      accountId: account2.id,
      date: "2026-09-23",
      encryptedData: "ct-tx2",
      nonce: "n",
      dedupKey: crypto.randomUUID(),
      createdByUserId: fixture.user.id,
    },
  });
  expect(await receipts.get(fixture.user, { transactionId: tx2.id })).toBeNull();
});

test("get rejects a caller with no household membership", async () => {
  await expect(receipts.get(outsider, { transactionId: transaction.id })).rejects.toThrow(/no household/i);
});

test("get rejects a transaction belonging to a different household", async () => {
  const otherFixture = await createTestHousehold();
  await expect(receipts.get(otherFixture.user, { transactionId: transaction.id })).rejects.toThrow(/not found/);
  await cleanupFixture(otherFixture);
});
