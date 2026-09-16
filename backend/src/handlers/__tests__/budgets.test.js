const categories = require("../categories");
const budgets = require("../budgets");
const { createTestHousehold, cleanupFixture, db } = require("./testUtils");

let fixture;
let categoryId;

beforeAll(async () => {
  fixture = await createTestHousehold();
  categoryId = (await categories.create(fixture.user, { encryptedData: "ct-cat", nonce: "n" })).id;
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await db.$disconnect();
});

test("set rejects missing fields", async () => {
  await expect(budgets.set(fixture.user, { categoryId, month: "2026-09" })).rejects.toThrow(
    /categoryId, month .*, encryptedData, and nonce/
  );
});

test("set rejects a categoryId from a different household", async () => {
  const other = await createTestHousehold();
  const theirCategory = await categories.create(other.user, { encryptedData: "ct", nonce: "n" });
  await expect(
    budgets.set(fixture.user, { categoryId: theirCategory.id, month: "2026-09", encryptedData: "ct", nonce: "n" })
  ).rejects.toThrow(/category not found/);
  await cleanupFixture(other);
});

test("set is an upsert — same categoryId+month overwrites, not duplicates", async () => {
  const first = await budgets.set(fixture.user, {
    categoryId,
    month: "2026-08",
    encryptedData: "ct-budget-v1",
    nonce: "n1",
  });
  const second = await budgets.set(fixture.user, {
    categoryId,
    month: "2026-08",
    encryptedData: "ct-budget-v2",
    nonce: "n2",
  });
  expect(second.id).toBe(first.id);
  expect(second.encryptedData).toBe("ct-budget-v2");
});

test("get returns raw rows for the month — no totals/variance computed server-side (§10a, that moved client-side)", async () => {
  await budgets.set(fixture.user, { categoryId, month: "2026-07", encryptedData: "ct", nonce: "n" });
  const result = await budgets.get(fixture.user, { month: "2026-07" });
  expect(result.month).toBe("2026-07");
  expect(result).not.toHaveProperty("totals");
  expect(result.budgets.some((b) => b.categoryId === categoryId && b.encryptedData === "ct")).toBe(true);
  expect(Array.isArray(result.categories)).toBe(true);
  expect(Array.isArray(result.transactions)).toBe(true);
});

test("get defaults to the current month when none is given", async () => {
  const result = await budgets.get(fixture.user, {});
  const expected = new Date().toISOString().slice(0, 7);
  expect(result.month).toBe(expected);
});
