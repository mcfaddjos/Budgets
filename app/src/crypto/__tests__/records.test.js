const { encryptRecord, decryptRecord, computeDedupKey } = require("../records");
const { generateHouseholdDek } = require("../keys");

describe("record encryption", () => {
  test("round-trips an arbitrary object through encrypt/decrypt", async () => {
    const dek = await generateHouseholdDek();
    const original = { description: "STARBUCKS #4021", normalizedDescription: "STARBUCKS 4021", amount: -6.75 };

    const { encryptedData, nonce } = await encryptRecord(dek, original);
    const decrypted = await decryptRecord(dek, encryptedData, nonce);

    expect(decrypted).toEqual(original);
  });

  test("the ciphertext doesn't contain the plaintext description as a visible substring", async () => {
    const dek = await generateHouseholdDek();
    const { encryptedData } = await encryptRecord(dek, { name: "Groceries" });
    expect(encryptedData).not.toMatch(/Groceries/);
  });

  test("decrypting with the wrong DEK fails closed instead of returning garbage silently", async () => {
    const dek = await generateHouseholdDek();
    const wrongDek = await generateHouseholdDek();
    const { encryptedData, nonce } = await encryptRecord(dek, { amount: 42 });

    await expect(decryptRecord(wrongDek, encryptedData, nonce)).rejects.toThrow();
  });

  test("two encryptions of the same content produce different ciphertext (random nonce per call)", async () => {
    const dek = await generateHouseholdDek();
    const first = await encryptRecord(dek, { amount: 10 });
    const second = await encryptRecord(dek, { amount: 10 });
    expect(first.encryptedData).not.toBe(second.encryptedData);
    expect(first.nonce).not.toBe(second.nonce);
  });
});

describe("dedup fingerprint", () => {
  const fields = { date: "2026-09-15", amount: -12.34, normalizedDescription: "STARBUCKS 4021" };

  test("is deterministic for the same DEK and inputs", async () => {
    const dek = await generateHouseholdDek();
    const a = await computeDedupKey(dek, fields);
    const b = await computeDedupKey(dek, fields);
    expect(a).toBe(b);
  });

  test("differs when any field differs", async () => {
    const dek = await generateHouseholdDek();
    const base = await computeDedupKey(dek, fields);
    const differentAmount = await computeDedupKey(dek, { ...fields, amount: -12.35 });
    const differentDate = await computeDedupKey(dek, { ...fields, date: "2026-09-16" });
    expect(differentAmount).not.toBe(base);
    expect(differentDate).not.toBe(base);
  });

  test("differs across households (keyed by the DEK, not a plain hash of the content)", async () => {
    const dekA = await generateHouseholdDek();
    const dekB = await generateHouseholdDek();
    const a = await computeDedupKey(dekA, fields);
    const b = await computeDedupKey(dekB, fields);
    expect(a).not.toBe(b);
  });
});
