const { dispatch, PUBLIC_ACTIONS } = require("../dispatch");
const { db } = require("../handlers/__tests__/testUtils");

afterAll(async () => {
  await db.$disconnect();
});

test("rejects an unknown action", async () => {
  await expect(dispatch("not.a.real.action", null, {})).rejects.toThrow(/unknown action/i);
});

test("rejects a missing action name", async () => {
  await expect(dispatch(undefined, null, {})).rejects.toThrow(/action is required/i);
});

test("protected actions require a valid token", async () => {
  await expect(dispatch("accounts.list", null, {})).rejects.toThrow(/missing auth token/i);
  await expect(dispatch("accounts.list", "not-a-real-token", {})).rejects.toThrow(/invalid or expired token/i);
});

test("public actions don't go through requireAuth — a missing/bad token isn't why they'd fail", async () => {
  for (const action of PUBLIC_ACTIONS) {
    const err = await dispatch(action, null, {}).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toMatch(/missing auth token|invalid or expired token/i);
  }
});
