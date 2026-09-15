const accounts = require("../accounts");
const categories = require("../categories");
const transactions = require("../transactions");
const { createTestHousehold, cleanupFixture, db } = require("./testUtils");

let fixture;
let accountId;
let categoryId;

beforeAll(async () => {
  fixture = await createTestHousehold();
  accountId = (await accounts.create(fixture.user, { encryptedData: "ct-acc", nonce: "n" })).id;
  categoryId = (await categories.create(fixture.user, { encryptedData: "ct-cat", nonce: "n" })).id;
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await db.$disconnect();
});

test("create rejects missing required fields", async () => {
  await expect(transactions.create(fixture.user, { accountId })).rejects.toThrow(
    /encryptedData, nonce, and dedupKey/
  );
  await expect(
    transactions.create(fixture.user, { accountId, encryptedData: "ct", nonce: "n", dedupKey: "d1" })
  ).rejects.toThrow(/date is required/);
});

test("create rejects an account from a different household", async () => {
  const other = await createTestHousehold();
  const theirAccount = await accounts.create(other.user, { encryptedData: "ct", nonce: "n" });
  await expect(
    transactions.create(fixture.user, {
      accountId: theirAccount.id,
      date: "2026-09-01",
      encryptedData: "ct",
      nonce: "n",
      dedupKey: "d-cross-household",
    })
  ).rejects.toThrow(/account not found/);
  await cleanupFixture(other);
});

test("create + list round-trip, categoryId/date/dedupKey stay plaintext, content is opaque to the caller's assertions", async () => {
  const created = await transactions.create(fixture.user, {
    accountId,
    categoryId,
    date: "2026-09-10",
    encryptedData: "ct-tx-1",
    nonce: "n1",
    dedupKey: "dedup-round-trip",
  });
  expect(created.date).toBe("2026-09-10");
  expect(created.categoryId).toBe(categoryId);

  const list = await transactions.list(fixture.user, { month: "2026-09" });
  expect(list.find((t) => t.id === created.id)?.encryptedData).toBe("ct-tx-1");
});

test("dedupKey is unique per account — a duplicate is rejected, not silently accepted", async () => {
  await transactions.create(fixture.user, {
    accountId,
    date: "2026-09-11",
    encryptedData: "ct-a",
    nonce: "n",
    dedupKey: "dedup-unique-test",
  });
  await expect(
    transactions.create(fixture.user, {
      accountId,
      date: "2026-09-11",
      encryptedData: "ct-b",
      nonce: "n",
      dedupKey: "dedup-unique-test",
    })
  ).rejects.toThrow();
});

test("the same dedupKey is allowed again on a different account — uniqueness is per-account, not global", async () => {
  const secondAccountId = (await accounts.create(fixture.user, { encryptedData: "ct-acc-2", nonce: "n" })).id;
  await transactions.create(fixture.user, {
    accountId,
    date: "2026-09-12",
    encryptedData: "ct-a",
    nonce: "n",
    dedupKey: "dedup-shared-key",
  });
  await expect(
    transactions.create(fixture.user, {
      accountId: secondAccountId,
      date: "2026-09-12",
      encryptedData: "ct-b",
      nonce: "n",
      dedupKey: "dedup-shared-key",
    })
  ).resolves.toBeDefined();
});

test("update: categoryId and reviewed are the only mutable fields here", async () => {
  const created = await transactions.create(fixture.user, {
    accountId,
    date: "2026-09-13",
    encryptedData: "ct",
    nonce: "n",
    dedupKey: "dedup-update-test",
  });
  const updated = await transactions.update(fixture.user, { id: created.id, reviewed: true });
  expect(updated.reviewed).toBe(true);
  expect(updated.categoryId).toBeNull();
});

test("remove is idempotent", async () => {
  const created = await transactions.create(fixture.user, {
    accountId,
    date: "2026-09-14",
    encryptedData: "ct",
    nonce: "n",
    dedupKey: "dedup-remove-test",
  });
  expect(await transactions.remove(fixture.user, { id: created.id })).toEqual({ ok: true });
  expect(await transactions.remove(fixture.user, { id: created.id })).toEqual({ ok: true });
});

test("formOptions returns both accounts and categories for the household", async () => {
  const options = await transactions.formOptions(fixture.user);
  expect(options.accounts.some((a) => a.id === accountId)).toBe(true);
  expect(options.categories.some((c) => c.id === categoryId)).toBe(true);
});
