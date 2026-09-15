// fromUtf8/toUtf8 are hand-rolled (see sodium.js's comment on why —
// react-native-libsodium declares from_string/to_string but never
// actually implements them natively, confirmed by an on-device failure
// the mocked Jest environment couldn't have caught on its own). Direct
// round-trip coverage here, beyond what the encryptRecord tests exercise
// incidentally with plain ASCII category/transaction names.
const { fromUtf8, toUtf8 } = require("../sodium");

describe("UTF-8 codec round-trip", () => {
  test.each([
    ["empty string", ""],
    ["plain ASCII", "STARBUCKS #4021"],
    ["extended Latin (2-byte)", "Café Résumé"],
    ["mixed scripts (3-byte)", "日本語 テスト"],
    ["emoji (surrogate pair, 4-byte)", "Groceries 🛒🥦"],
    ["JSON payload shape", JSON.stringify({ description: "TARGET T-1234", amount: -42.17 })],
  ])("%s", (_label, input) => {
    expect(toUtf8(fromUtf8(input))).toBe(input);
  });

  test("produces a Uint8Array, not a plain array", () => {
    expect(fromUtf8("hello")).toBeInstanceOf(Uint8Array);
  });

  test("ASCII bytes match their char codes directly", () => {
    expect(Array.from(fromUtf8("AB"))).toEqual([65, 66]);
  });
});
