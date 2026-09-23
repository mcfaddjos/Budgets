// Mocks google-auth-library entirely — these tests exercise our own
// logic (session creation, the two-phase invite/grant handshake, the
// per-device key model), not whether Google's SDK works.
// verifyGoogleIdToken's actual signature verification is Google's
// problem, not ours to re-test.
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

test("registerNewHousehold creates a user, a device, a household, and grants that device immediate access", async () => {
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
  expect(result.deviceId).toBeDefined();

  const device = await db.userDevice.findUnique({ where: { id: result.deviceId } });
  expect(device.publicKey).toBe(`pk-${suffix}`);

  const key = await db.deviceHouseholdKey.findUnique({
    where: { deviceId_householdId: { deviceId: result.deviceId, householdId: result.householdId } },
  });
  expect(key.wrappedDek).toBe(`wrapped-${suffix}`);
});

test("registerNewHousehold rejects a second registration for the same Google account", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Creator" });
  const result = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
  });
  createdUserIds.push(result.user.id);
  createdHouseholdIds.push(result.householdId);

  mockGoogleUser({ sub: `sub-${suffix}` });
  await expect(
    authHandlers.registerNewHousehold({ idToken: "fake", ...fakeKeyMaterial(suffix), wrappedDek: "x" })
  ).rejects.toThrow(/already exists/i);
});

test("login returns key material for a recognized device, and empty key material (but real memberships) for an unrecognized one", async () => {
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
  const loggedIn = await authHandlers.login({ idToken: "fake", deviceId: registered.deviceId });
  expect(loggedIn.publicKey).toBe(`pk-${suffix}`);
  expect(loggedIn.deviceId).toBe(registered.deviceId);
  expect(loggedIn.memberships).toEqual([
    {
      householdId: registered.householdId,
      role: "OWNER",
      wrappedDek: `wrapped-${suffix}`,
      recoveryWrappedDek: null,
      recoveryDekNonce: null,
    },
  ]);

  // A device the account has never registered — real identity, no access.
  mockGoogleUser({ sub: `sub-${suffix}` });
  const unknownDevice = await authHandlers.login({ idToken: "fake", deviceId: "not-a-real-device-id" });
  expect(unknownDevice.publicKey).toBeNull();
  expect(unknownDevice.deviceId).toBeNull();
  expect(unknownDevice.memberships).toEqual([
    {
      householdId: registered.householdId,
      role: "OWNER",
      wrappedDek: null,
      recoveryWrappedDek: null,
      recoveryDekNonce: null,
    },
  ]);

  // No deviceId at all (first-ever call from a brand-new install) behaves the same way.
  mockGoogleUser({ sub: `sub-${suffix}` });
  const noDevice = await authHandlers.login({ idToken: "fake" });
  expect(noDevice.deviceId).toBeNull();

  mockGoogleUser({ sub: "never-registered" });
  await expect(authHandlers.login({ idToken: "fake" })).rejects.toThrow(/no account found/i);
});

test("the full invite -> pending device -> grant access -> recovery key handshake", async () => {
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

  // A new person redeems it — their device has no DeviceHouseholdKey yet
  // (nobody can seal to a key that didn't exist until now).
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

  const pendingKey = await db.deviceHouseholdKey.findUnique({
    where: { deviceId_householdId: { deviceId: joined.deviceId, householdId: owner.householdId } },
  });
  expect(pendingKey).toBeNull();

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

  // The owner sees the joiner's device waiting for access.
  const pending = await authHandlers.listPendingKeyGrants(ownerUser, { householdId: owner.householdId });
  expect(pending).toEqual([
    {
      deviceId: joined.deviceId,
      deviceName: null,
      userId: joined.user.id,
      email: `${joinerSuffix}@example.com`,
      name: "Joiner",
      publicKey: `pk-${joinerSuffix}`,
    },
  ]);

  // The joiner can't grant access to anyone — no device of theirs has DEK access yet.
  const joinerUser = await db.user.findUnique({ where: { id: joined.user.id } });
  await expect(
    authHandlers.grantAccess(joinerUser, { householdId: owner.householdId, deviceId: joined.deviceId, wrappedDek: "x" })
  ).rejects.toThrow(/not a member with access/i);

  // The owner grants access.
  await authHandlers.grantAccess(ownerUser, {
    householdId: owner.householdId,
    deviceId: joined.deviceId,
    wrappedDek: "now-wrapped-for-joiner",
  });
  const grantedKey = await db.deviceHouseholdKey.findUnique({
    where: { deviceId_householdId: { deviceId: joined.deviceId, householdId: owner.householdId } },
  });
  expect(grantedKey.wrappedDek).toBe("now-wrapped-for-joiner");

  // Granting the same device again is rejected — already has access.
  await expect(
    authHandlers.grantAccess(ownerUser, { householdId: owner.householdId, deviceId: joined.deviceId, wrappedDek: "y" })
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

test("addDeviceViaRecoveryCode adds a brand-new device without disturbing the one that already worked", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Recoverer" });
  const registered = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
    recoveryWrappedDek: `recovery-ct-${suffix}`,
    recoveryDekNonce: `recovery-nonce-${suffix}`,
  });
  createdUserIds.push(registered.user.id);
  createdHouseholdIds.push(registered.householdId);
  const user = await db.user.findUnique({ where: { id: registered.user.id } });

  // A different (unrelated) user can't add a device to this household.
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
  await expect(
    authHandlers.addDeviceViaRecoveryCode(outsiderUser, {
      householdId: registered.householdId,
      ...fakeKeyMaterial(`${suffix}-second-device`),
      wrappedDek: `wrapped-${suffix}-second-device`,
    })
  ).rejects.toThrow(/not a member/i);

  // The account's own owner adds a second device via the recovery code.
  const added = await authHandlers.addDeviceViaRecoveryCode(user, {
    householdId: registered.householdId,
    ...fakeKeyMaterial(`${suffix}-second-device`),
    wrappedDek: `wrapped-${suffix}-second-device`,
    recoveryWrappedDek: `recovery-ct-${suffix}-v2`,
    recoveryDekNonce: `recovery-nonce-${suffix}-v2`,
  });
  expect(added.deviceId).not.toBe(registered.deviceId);

  // The original device is completely untouched.
  mockGoogleUser({ sub: `sub-${suffix}` });
  const originalStillWorks = await authHandlers.login({ idToken: "fake", deviceId: registered.deviceId });
  expect(originalStillWorks.publicKey).toBe(`pk-${suffix}`);
  expect(originalStillWorks.memberships[0].wrappedDek).toBe(`wrapped-${suffix}`);

  // The new device works too, simultaneously.
  mockGoogleUser({ sub: `sub-${suffix}` });
  const newDeviceWorks = await authHandlers.login({ idToken: "fake", deviceId: added.deviceId });
  expect(newDeviceWorks.publicKey).toBe(`pk-${suffix}-second-device`);
  expect(newDeviceWorks.memberships[0].wrappedDek).toBe(`wrapped-${suffix}-second-device`);
});

test("device pairing: an already-unlocked device grants a new device access via a short-lived session", async () => {
  const suffix = crypto.randomUUID();
  mockGoogleUser({ sub: `sub-${suffix}`, email: `${suffix}@example.com`, name: "Pairer" });
  const registered = await authHandlers.registerNewHousehold({
    idToken: "fake",
    ...fakeKeyMaterial(suffix),
    wrappedDek: `wrapped-${suffix}`,
  });
  createdUserIds.push(registered.user.id);
  createdHouseholdIds.push(registered.householdId);
  const user = await db.user.findUnique({ where: { id: registered.user.id } });

  // Granting device starts a pairing session.
  const session = await authHandlers.createPairingSession(user, { householdId: registered.householdId });
  expect(session.pairingId).toBeDefined();

  // Joining device submits its own key material + a MAC (the MAC's actual
  // verification happens client-side on the granting device — the server
  // just relays it, see the DevicePairingSession model comment).
  const submitted = await authHandlers.submitPairingDevice(user, {
    pairingId: session.pairingId,
    ...fakeKeyMaterial(`${suffix}-paired`),
    mac: "fake-mac-value",
  });
  expect(submitted.deviceId).toBeDefined();

  // Can't submit twice on the same session.
  await expect(
    authHandlers.submitPairingDevice(user, {
      pairingId: session.pairingId,
      ...fakeKeyMaterial(`${suffix}-paired-again`),
      mac: "another-mac",
    })
  ).rejects.toThrow(/already been used/i);

  // Granting device polls and sees the submitted public key + MAC to verify locally.
  const status = await authHandlers.getPairingStatus(user, { pairingId: session.pairingId });
  expect(status.newPublicKey).toBe(`pk-${suffix}-paired`);
  expect(status.newDeviceId).toBe(submitted.deviceId);
  expect(status.newDeviceMac).toBe("fake-mac-value");
  expect(status.expired).toBe(false);

  // Not ready yet — no grant has happened.
  const notReady = await authHandlers.isPairingComplete(user, { pairingId: session.pairingId });
  expect(notReady.ready).toBe(false);

  // Granting device verifies the MAC (out of band, not shown here) and grants access —
  // this reuses the exact same grantAccess as the invite/grant flow.
  await authHandlers.grantAccess(user, {
    householdId: registered.householdId,
    deviceId: submitted.deviceId,
    wrappedDek: `wrapped-${suffix}-paired`,
  });

  const nowReady = await authHandlers.isPairingComplete(user, { pairingId: session.pairingId });
  expect(nowReady.ready).toBe(true);

  // The paired device can now log in with real access.
  mockGoogleUser({ sub: `sub-${suffix}` });
  const pairedDeviceLogin = await authHandlers.login({ idToken: "fake", deviceId: submitted.deviceId });
  expect(pairedDeviceLogin.memberships[0].wrappedDek).toBe(`wrapped-${suffix}-paired`);

  // A different user can't poll or submit against someone else's pairing session.
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
  await expect(authHandlers.getPairingStatus(outsiderUser, { pairingId: session.pairingId })).rejects.toThrow(
    /invalid pairing code/i
  );
});
