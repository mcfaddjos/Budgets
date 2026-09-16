const categories = require("../categories");
const { createTestHousehold, cleanupFixture, db } = require("./testUtils");

let fixture;

beforeAll(async () => {
  fixture = await createTestHousehold();
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await db.$disconnect();
});

test("create rejects missing encryptedData/nonce", async () => {
  await expect(categories.create(fixture.user, {})).rejects.toThrow(/encryptedData and nonce/);
});

test("create + list round-trip, no server-side name comparison possible", async () => {
  const created = await categories.create(fixture.user, { encryptedData: "ct-cat-1", nonce: "n1" });
  const list = await categories.list(fixture.user);
  expect(list.find((c) => c.id === created.id)?.encryptedData).toBe("ct-cat-1");
});

test("createMany seeds a batch — replaces the old server-side default-category seeding, which can't work anymore since the server never holds the DEK", async () => {
  const result = await categories.createMany(fixture.user, {
    categories: [
      { encryptedData: "ct-default-1", nonce: "n2" },
      { encryptedData: "ct-default-2", nonce: "n3" },
    ],
  });
  expect(result).toEqual({ ok: true });

  const list = await categories.list(fixture.user);
  expect(list.some((c) => c.encryptedData === "ct-default-1")).toBe(true);
  expect(list.some((c) => c.encryptedData === "ct-default-2")).toBe(true);
});

test("createMany rejects an empty array and malformed entries", async () => {
  await expect(categories.createMany(fixture.user, { categories: [] })).rejects.toThrow(/categories array/);
  await expect(categories.createMany(fixture.user, { categories: [{ encryptedData: "ct" }] })).rejects.toThrow(
    /encryptedData and nonce/
  );
});

test("update rejects a category id from a different household", async () => {
  const other = await createTestHousehold();
  const theirCategory = await categories.create(other.user, { encryptedData: "ct-theirs", nonce: "n" });
  await expect(
    categories.update(fixture.user, { id: theirCategory.id, encryptedData: "ct-hijack", nonce: "n" })
  ).rejects.toThrow(/category not found/);
  await cleanupFixture(other);
});
