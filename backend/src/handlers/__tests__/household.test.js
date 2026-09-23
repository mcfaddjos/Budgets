const household = require("../household");
const { createTestHousehold, createTestUser, cleanupFixture, cleanupUser, db } = require("./testUtils");

let fixture;
let outsider;

beforeAll(async () => {
  fixture = await createTestHousehold();
  outsider = await createTestUser();
});

afterAll(async () => {
  await cleanupFixture(fixture);
  await cleanupUser(outsider);
  await db.$disconnect();
});

test("getSettings defaults keepReceiptImages to false", async () => {
  expect(await household.getSettings(fixture.user)).toEqual({ keepReceiptImages: false });
});

test("setKeepReceiptImages toggles the household-wide setting", async () => {
  expect(await household.setKeepReceiptImages(fixture.user, { keepReceiptImages: true })).toEqual({
    keepReceiptImages: true,
  });
  expect(await household.getSettings(fixture.user)).toEqual({ keepReceiptImages: true });

  await household.setKeepReceiptImages(fixture.user, { keepReceiptImages: false });
  expect(await household.getSettings(fixture.user)).toEqual({ keepReceiptImages: false });
});

test("setKeepReceiptImages rejects a non-boolean value", async () => {
  await expect(household.setKeepReceiptImages(fixture.user, { keepReceiptImages: "yes" })).rejects.toThrow(
    /must be a boolean/
  );
  await expect(household.setKeepReceiptImages(fixture.user, {})).rejects.toThrow(/must be a boolean/);
});

test("a user with no household membership can't read or write settings", async () => {
  await expect(household.getSettings(outsider)).rejects.toThrow(/no household/i);
  await expect(household.setKeepReceiptImages(outsider, { keepReceiptImages: true })).rejects.toThrow(
    /no household/i
  );
});
