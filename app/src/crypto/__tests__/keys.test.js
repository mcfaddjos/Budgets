// Runs against libsodium-wrappers-sumo (see package.json's jest
// moduleNameMapper) standing in for react-native-libsodium — the two
// share an API by design, so this exercises the real Argon2id/X25519/
// XSalsa20-Poly1305 operations, not a mock of them.
const keys = require("../keys");
const { toBase64 } = require("../sodium");

describe("vault passphrase -> private key", () => {
  test("the right passphrase recovers the exact private key that was encrypted", async () => {
    const { privateKey, forServer } = await keys.createUserKeyMaterial("correct horse battery staple");
    const recovered = await keys.unlockPrivateKey({ passphrase: "correct horse battery staple", ...forServer });
    expect(toBase64(recovered)).toBe(toBase64(privateKey));
  });

  test("the wrong passphrase fails closed instead of returning garbage", async () => {
    const { forServer } = await keys.createUserKeyMaterial("correct horse battery staple");
    await expect(keys.unlockPrivateKey({ passphrase: "wrong passphrase entirely", ...forServer })).rejects.toThrow();
  });

  test("forServer never contains the raw private key — only ciphertext, a salt, and the public key", async () => {
    const { forServer } = await keys.createUserKeyMaterial("some passphrase");
    expect(Object.keys(forServer).sort()).toEqual(
      ["encryptedPrivateKey", "privateKeyNonce", "publicKey", "vaultKdfSalt"].sort()
    );
  });
});

describe("household DEK sharing", () => {
  test("a DEK wrapped to a member's public key unwraps back to the same bytes with their private key", async () => {
    const { privateKey, forServer } = await keys.createUserKeyMaterial("member passphrase");
    const dek = await keys.generateHouseholdDek();

    const wrapped = keys.wrapDekForMember(dek, forServer.publicKey);
    const unwrapped = keys.unwrapDek(wrapped, forServer.publicKey, privateKey);

    expect(toBase64(unwrapped)).toBe(toBase64(dek));
  });

  test("a different member's private key can't unwrap it", async () => {
    const memberA = await keys.createUserKeyMaterial("passphrase a");
    const memberB = await keys.createUserKeyMaterial("passphrase b");
    const dek = await keys.generateHouseholdDek();

    const wrappedForA = keys.wrapDekForMember(dek, memberA.forServer.publicKey);
    expect(() => keys.unwrapDek(wrappedForA, memberB.forServer.publicKey, memberB.privateKey)).toThrow();
  });
});

describe("recovery key", () => {
  test("wraps and unwraps the same DEK", async () => {
    const dek = await keys.generateHouseholdDek();
    const recoveryKey = await keys.generateRecoveryKey();

    const { recoveryWrappedDek, recoveryDekNonce } = keys.wrapDekWithRecoveryKey(dek, recoveryKey);
    const recovered = keys.unwrapDekWithRecoveryKey(recoveryWrappedDek, recoveryDekNonce, recoveryKey);

    expect(toBase64(recovered)).toBe(toBase64(dek));
  });

  test("the wrong recovery key fails closed", async () => {
    const dek = await keys.generateHouseholdDek();
    const realKey = await keys.generateRecoveryKey();
    const wrongKey = await keys.generateRecoveryKey();

    const { recoveryWrappedDek, recoveryDekNonce } = keys.wrapDekWithRecoveryKey(dek, realKey);
    expect(() => keys.unwrapDekWithRecoveryKey(recoveryWrappedDek, recoveryDekNonce, wrongKey)).toThrow();
  });

  test("display string round-trips back to the same key bytes", async () => {
    const recoveryKey = await keys.generateRecoveryKey();
    const displayed = keys.recoveryKeyToDisplayString(recoveryKey);
    const parsed = keys.recoveryKeyFromDisplayString(displayed);
    expect(toBase64(parsed)).toBe(toBase64(recoveryKey));
  });
});
