const categories = require("../categories");
const categoryRules = require("../categoryRules");
const { createTestHousehold, cleanupFixture, db } = require("./testUtils");

let fixture;
let categoryId;

beforeAll(async () => {
  fixture = await createTestHousehold();
  const category = await categories.create(fixture.user, { encryptedData: "ct-cat", nonce: "n" });
  categoryId = category.id;
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await db.$disconnect();
});

test("create rejects missing fields", async () => {
  await expect(categoryRules.create(fixture.user, {})).rejects.toThrow(/categoryId, encryptedData, and nonce/);
  await expect(categoryRules.create(fixture.user, { categoryId })).rejects.toThrow(
    /categoryId, encryptedData, and nonce/
  );
});

test("create + list round-trip", async () => {
  const created = await categoryRules.create(fixture.user, { categoryId, encryptedData: "ct-rule", nonce: "n1" });
  const list = await categoryRules.list(fixture.user);
  const found = list.find((r) => r.id === created.id);
  expect(found).toBeDefined();
  expect(found.categoryId).toBe(categoryId);
  expect(found.encryptedData).toBe("ct-rule");
});

test("rejects a categoryId belonging to a different household", async () => {
  const other = await createTestHousehold();
  const theirCategory = await categories.create(other.user, { encryptedData: "ct", nonce: "n" });
  await expect(
    categoryRules.create(fixture.user, { categoryId: theirCategory.id, encryptedData: "ct-rule", nonce: "n" })
  ).rejects.toThrow(/category not found/);
  await cleanupFixture(other);
});
