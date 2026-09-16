// Mocks google-auth-library entirely — these tests exercise our own
// logic (session creation, the two-phase invite/grant handshake), not
// whether Google's SDK works. verifyGoogleIdToken's actual signature
// verification is Google's problem, not ours to re-test.
jest.mock("google-auth-library", () => {
  const verifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
    __mockVerifyIdToken: verifyIdToken,
  };
});

const crypto = require("node:crypto");
const { __mockVerifyIdToken } = require("google-auth-library");
const authHandlers = require("../auth");
const { db } = require("./testUtils");

function mockGoogleUser({ sub, email, name }) {
  __mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ sub, email, name }) });
}

function fakeKeyMaterial(suffix) {
  return {
    publicKey: `pk-${suffix}`,
    encryptedPrivateKey: `epk-${suffix}`,
    privateKeyNonce: `nonce-${suffix}`,
    vaultKdfSalt: `salt-${suffix}`,
  };
}

const createdUserIds = [];
const createdHouseholdIds = [];

afterAll(async () => {
  await db.household.deleteMany({ where: { id: { in: createdHouseholdIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.$disconnect();
});

test("registerNewHousehold creates a user, a household, and an OWNER membership with the given wrappedDek already set", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Creator" });

  const result = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
  });

  createdUserIds.push(result.user.id);
  createdHouseholdIds.push(result.householdId);

  expect(result.token).toBeDefined();
  expect(result.user.email).toBe(`${suffix}@example.com`);

  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId: result.householdId, userId: result.user.id } },
  });
  expect(membership.role).toBe("OWNER");
  expect(membership.wrappedDek).toBe(`wrapped-${suffix}`);
});

test("registerNewHousehold rejects a second registration for the same Google account", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Creator" });
  const first = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
  });
  createdUserIds.push(first.user.id);
  createdHouseholdIds.push(first.householdId);

  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Creator" });
  await expect(
    authHandlers.registerNewHousehold({ idToken: "fake", ...fakeKeyMaterial(suffix), wrappedDek: "irrelevant" })
  ).rejects.toThrow(/already exists/);
});

test("login returns key material and memberships for a returning user, and fails for an unknown one", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Creator" });
  const registered = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
  });
  createdUserIds.push(registered.user.id);
  createdHouseholdIds.push(registered.householdId);

  mockGoogleUser({ sub: `sub-${suffix}` });
  const loggedIn = await authHandlers.login({ idToken: "fake" });
  expect(loggedIn.publicKey).toBe(`pk-${suffix}`);
  expect(loggedIn.memberships).toEqual([
    { householdId: registered.householdId, role: "OWNER", wrappedDek: `wrapped-${suffix}` },
  ]);

  mockGoogleUser({ sub: "never-registered" });
  await expect(authHandlers.login({ idToken: "fake" })).rejects.toThrow(/no account found/i);
});

test("the full invite -> pending join -> grant access -> recovery key handshake", async () => {
  // Owner creates a household.
  const ownerSuffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${ownerSuffix}`, email: `${ownerSuffix}@example.com`, name: "Owner" });
  const owner = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(ownerSuffix),
    wrappedDek: `wrapped-${ownerSuffix}`,
  });
  createdUserIds.push(owner.user.id);
  createdHouseholdIds.push(owner.householdId);
  const ownerUser = await db.user.findUnique({ where: { id: owner.user.id } });

  // Owner creates an invite.
  const invite = await authHandlers.createInvite(ownerUser, { householdId: owner.householdId, expiresInDays: 7 });
  expect(invite.code).toBeDefined();

  // A new person redeems it — starts with wrappedDek = null (nobody can seal to a key that didn't exist yet).
  const joinerSuffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${joinerSuffix}`, email: `${joinerSuffix}@example.com`, name: "Joiner" });
  const joined = await authHandlers.joinHouseholdViaInvite({
    idToken: "fake",
    inviteCode: invite.code,
    ...fakeKeyMaterial(joinerSuffix),
  });
  createdUserIds.push(joined.user.id);
  expect(joined.pendingKeyGrant).toBe(true);
  expect(joined.householdId).toBe(owner.householdId);

  const pendingMembership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId: owner.householdId, userId: joined.user.id } },
  });
  expect(pendingMembership.wrappedDek).toBeNull();

  // Same invite code can't be redeemed twice.
  const secondJoinerSuffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${secondJoinerSuffix}` });
  await expect(
    authHandlers.joinHouseholdViaInvite({
      idToken: "fake",
      inviteCode: invite.code,
      ...fakeKeyMaterial(secondJoinerSuffix),
    })
  ).rejects.toThrow(/already used/);

  // The owner sees the joiner waiting for access.
  const pending = await authHandlers.listPendingKeyGrants(ownerUser, { householdId: owner.householdId });
  expect(pending).toEqual([
    { userId: joined.user.id, email: `${joinerSuffix}@example.com`, name: "Joiner", publicKey: `pk-${joinerSuffix}` },
  ]);

  // The joiner can't grant access to anyone — they have no DEK access themselves yet.
  const joinerUser = await db.user.findUnique({ where: { id: joined.user.id } });
  await expect(
    authHandlers.grantAccess(joinerUser, { householdId: owner.householdId, memberUserId: joined.user.id, wrappedDek: "x" })
  ).rejects.toThrow(/not a member with access/i);

  // The owner grants access.
  await authHandlers.grantAccess(ownerUser, {
    householdId: owner.householdId,
    memberUserId: joined.user.id,
    wrappedDek: "now-wrapped-for-joiner",
  });
  const grantedMembership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId: owner.householdId, userId: joined.user.id } },
  });
  expect(grantedMembership.wrappedDek).toBe("now-wrapped-for-joiner");

  // Granting again is rejected — already has access.
  await expect(
    authHandlers.grantAccess(ownerUser, {
      householdId: owner.householdId,
      memberUserId: joined.user.id,
      wrappedDek: "y",
    })
  ).rejects.toThrow(/already has access/);

  // Now that they have DEK access, the joiner can set up their own recovery code.
  await authHandlers.setRecoveryKey(joinerUser, {
    householdId: owner.householdId,
    recoveryWrappedDek: "recovery-ct",
    recoveryDekNonce: "recovery-nonce",
  });
  const finalMembership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId: owner.householdId, userId: joined.user.id } },
  });
  expect(finalMembership.recoveryWrappedDek).toBe("recovery-ct");

  // Either member can list the full roster now that both have access.
  const members = await authHandlers.listMembers(joinerUser, { householdId: owner.householdId });
  expect(members.sort((a, b) => a.role.localeCompare(b.role))).toEqual(
    [
      { userId: owner.user.id, email: `${ownerSuffix}@example.com`, name: "Owner", role: "OWNER" },
      { userId: joined.user.id, email: `${joinerSuffix}@example.com`, name: "Joiner", role: "MEMBER" },
    ].sort((a, b) => a.role.localeCompare(b.role))
  );

  // A non-member can't list the roster.
  const outsiderSuffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${outsiderSuffix}`, email: `${outsiderSuffix}@example.com`, name: "Outsider" });
  const outsider = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(outsiderSuffix),
    wrappedDek: `wrapped-${outsiderSuffix}`,
  });
  createdUserIds.push(outsider.user.id);
  createdHouseholdIds.push(outsider.householdId);
  const outsiderUser = await db.user.findUnique({ where: { id: outsider.user.id } });
  await expect(authHandlers.listMembers(outsiderUser, { householdId: owner.householdId })).rejects.toThrow(
    /not a member/i
  );
});
